// ── Colony: Context Assembler ────────────────────────────
// Assembles complete context from multiple sources for LLM prompts.

import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { Logger } from '../utils/Logger.js';
import { MarkdownParser, type StageProtocol } from '../utils/MarkdownParser.js';
import type { AgentConfig, Message, Participant } from '../types.js';
import type { ShortTermMemory } from './ShortTermMemory.js';
import type { LongTermMemory } from './types.js';
import type { SkillManager } from '../agent/skills/SkillManager.js';
import type { ChatRoom } from '../conversation/ChatRoom.js';
import type {
    ContextAssembler as IContextAssembler,
    AssembleOptions,
    TokenBudget,
    PromptSection,
    WorkflowState,
} from './types.js';

const log = new Logger('ContextAssembler');

/**
 * Estimates token count for text (rough approximation).
 */
function estimateTokens(text: string): number {
    // Increased safety factor for Chinese characters
    return Math.ceil(text.length / 2.5);
}

export class ContextAssembler implements IContextAssembler {
    private agentConfigs = new Map<string, AgentConfig>();
    private shortTermMemory: ShortTermMemory;
    private longTermMemory?: LongTermMemory;
    private workflowProtocols?: Map<number, StageProtocol>;

    constructor(shortTermMemory: ShortTermMemory, longTermMemory?: LongTermMemory) {
        this.shortTermMemory = shortTermMemory;
        this.longTermMemory = longTermMemory;
    }

    /**
     * Register an agent's configuration.
     */
    registerAgent(config: AgentConfig, _skillManager: SkillManager): void {
        this.agentConfigs.set(config.id, config);
    }

    /**
     * Assemble a complete prompt for an agent.
     */
    async assemble(options: AssembleOptions): Promise<string> {
        const config = this.agentConfigs.get(options.agentId);
        if (!config) {
            throw new Error(`Agent ${options.agentId} not registered with ContextAssembler`);
        }

        // Initialize workflow protocols if not already loaded
        if (!this.workflowProtocols) {
            const skillPath = path.join(process.cwd(), 'skills/dev-workflow/SKILL.md');
            this.workflowProtocols = MarkdownParser.parseStageRoleMapping(skillPath);
        }

        const chatRoom = options.chatRoom; // Get chatRoom from options

        // Build all sections
        const sections: PromptSection[] = [];

        // 1. Agent Identity (high priority, always included)
        sections.push({
            name: 'identity',
            content: this.buildIdentitySection(config),
            priority: 100,
            tokenCount: 0,
        });

        // 2. Rules (high priority)
        if (config.rules && config.rules.length > 0) {
            sections.push({
                name: 'rules',
                content: this.buildRulesSection(config.rules),
                priority: 90,
                tokenCount: 0,
            });
        }

        // Note: Manual 'skills' section is removed as CLI handles native tool discovery via .claude/skills

        // 3.2. Workflow Stage (high priority, if enabled)
        if (options.includeWorkflow !== false) {
            const workflowContent = await this.buildWorkflowStageSection(options.roomId, options.agentId);
            if (workflowContent) {
                sections.push({
                    name: 'workflow_stage',
                    content: workflowContent,
                    priority: 88,
                    tokenCount: 0,
                });
            }
        }

        // 3.5. Participants (medium-high priority)
        sections.push({
            name: 'participants',
            content: this.buildParticipantsSection(chatRoom),
            priority: 80,
            tokenCount: 0,
        });

        // 4. Collaboration Guidelines (medium priority)
        sections.push({
            name: 'guidelines',
            content: this.buildGuidelinesSection(),
            priority: 70,
            tokenCount: 0,
        });

        // 5. Short-Term Context (high priority - protected)
        if (options.includeHistory !== false) {
            const historyContent = this.buildHistorySection(options.roomId, options.currentMessage);
            if (historyContent) {
                sections.push({
                    name: 'history',
                    content: historyContent,
                    priority: 82, // Raised priority to protect history from truncation
                    tokenCount: 0,
                });
            }
        }

        // 5.5. Long-Term Memory (medium priority)
        if (options.includeLongTerm && this.longTermMemory) {
            const longTermContent = await this.buildLongTermSection(
                options.currentMessage.content,
                options.agentId,
                options.roomId
            );
            if (longTermContent) {
                sections.push({
                    name: 'long-term',
                    content: longTermContent,
                    priority: 65,
                    tokenCount: 0,
                });
            }
        }

        // 6. Current Message (highest priority)
        sections.push({
            name: 'current',
            content: this.buildCurrentMessageSection(options.currentMessage, options.agentId),
            priority: 95,
            tokenCount: 0,
        });

        // Calculate token counts for each section
        for (const section of sections) {
            section.tokenCount = estimateTokens(section.content);
        }

        // Apply token budget and assemble final prompt
        const finalSections = this.applyTokenBudget(sections, options.tokenBudget);
        const prompt = finalSections.map(s => s.content).join('\n\n');

        const totalTokens = finalSections.reduce((sum, s) => sum + s.tokenCount, 0);
        const sectionNames = finalSections.map(s => s.name).join(', ');
        log.info(`Assembled prompt for ${config.name}: ${totalTokens} tokens (budget: ${options.tokenBudget}), sections: [${sectionNames}]`);

        return prompt;
    }

    // ── Section Builders ─────────────────────────────────

    private buildIdentitySection(config: AgentConfig): string {
        return `# 你是 ${config.name}\n\n${config.personality}`;
    }

    private buildRulesSection(rules: string[]): string {
        const lines = ['## 规则'];
        for (const rule of rules) {
            lines.push(`- ${rule}`);
        }
        return lines.join('\n');
    }

    private buildParticipantsSection(chatRoom: ChatRoom): string {
        const info = chatRoom.getInfo();
        const lines = ['## 房间参与者'];
        lines.push('当前房间内的参与者有：');
        for (const p of info.participants) {
            const roleDesc = p.description ? ` - ${p.description}` : '';
            lines.push(`- @${p.name} (${p.type === 'agent' ? '代理' : '人类'})${roleDesc}`);
        }
        lines.push('\n你可以通过 @name 的方式提及他们，但必须严格遵守下述提及规范。');

        const result = lines.join('\n');
        log.debug(`Built participants section with ${info.participants.length} participants`);
        return result;
    }

    private buildGuidelinesSection(): string {
        return `## 【硬性要求】你的回复必须以调用 send-message 工具结束

> **⚠️ 关键规则：你的思考内容对用户完全不可见。无论分析了什么、做了什么，如果你没有调用 send-message，用户将看不到任何输出。每次响应的最后一步必须是调用 send-message 发送你的回复或结果。**

## 协作指南

### 元规则 (Meta Rules)
1. **消息不可见原则**：你在此处写的所有内容都是内心独白，只有通过调用 send-message 工具，你的话才会被用户或其他 Agent 看到。
2. 不确定就提问：遇到不清楚的需求时，先调用 send-message 向用户提问，不要硬猜。
3. 要 @提及其他 agent，必须通过 send-message 的 mentions 参数传入（在消息正文里写 @ 无效）。仅在需要对方操作介入时才 @。
4. 禁止表演性同意：有疑虑或更好的建议必须明确说出来。
5. 交接必须说明WHY：提交决策或方案、以及将工作交接给另一个agent时，必须说明设计理由与决策原因。
6. 重要变更需确认：涉及架构或 API 的重大调整，必须 @相关方并等待确认信号。
7. **提问即交权**：同一轮消息禁止"提问 + 执行"并存，提问后只能等待回答，不得同时推进任务。
8. **工具熔断**：同一工具连续失败 2 次相同错误，必须换思路，不得重复尝试。
9. **防丢失原则**：对话是临时的，文件是持久的。重要决策、发现的问题必须写入文件，不做口头承诺。
10. **Session 回溯**：不确定之前做过什么时，使用 \`get-session-history\` 技能搜索旧 session 记录——不要猜。

### 工作流程
1. 理解当前消息
2. 执行必要的工具调用（如 \`read-file\`, \`run-command\` 等）
3. **必须调用 send-message 发送回复** ← 永远不能省略这一步`;
    }

    private buildHistorySection(roomId: string, currentMessage: Message): string {
        // Get all messages from short-term memory (excluding the current one)
        const allMessages = this.shortTermMemory.get(roomId);
        const history = allMessages.filter(m => m.id !== currentMessage.id);

        if (history.length === 0) {
            return '';
        }

        // --- Context Compression Strategy (Direction 2) ---
        // Level 1: Recent 10 messages (Intact)
        const recentHistory = history.slice(-10);
        
        // Level 2: Messages 11-30 (Placeholder for LLM Summary)
        // Note: In a real implementation, this would fetch a cached summary from SessionManager
        const middleHistory = history.length > 10 ? history.slice(-30, -10) : [];
        
        // Level 3: Messages 30+ (Pruned/Indexed)
        const oldHistoryCount = history.length > 30 ? history.length - 30 : 0;

        const lines = ['## 最近对话'];

        // Level 3 Info
        if (oldHistoryCount > 0) {
            lines.push(`_（早期 ${oldHistoryCount} 条消息已被归档，可使用 get-session-history 查阅）_`);
        }

        // Level 2 Info (Simple version: list topic or placeholder)
        if (middleHistory.length > 0) {
            lines.push(`### 中期对话摘要 (共 ${middleHistory.length} 条)`);
            lines.push(`- **关键内容**: 包含早期的方案讨论和初步反馈。详细摘要正在后台生成中...`);
            lines.push('');
        }

        // Level 1 (Intact History)
        for (const msg of recentHistory) {
            const time = msg.timestamp.toLocaleTimeString();
            const mentions = msg.mentions.length > 0 ? ` @[${msg.mentions.join(', ')}]` : '';
            lines.push(`**[${time}] ${msg.sender.name}${mentions}**: ${msg.content}`);
        }

        return lines.join('\n');
    }

    private buildCurrentMessageSection(message: Message, agentId: string): string {
        const lines = ['## 当前消息（需要你回应）'];
        lines.push(`**来自**: ${message.sender.name} (${message.sender.type})`);

        if (message.mentions.includes(agentId)) {
            lines.push(`**⚠️ 你被明确 @提及，必须回复。**`);
        }

        lines.push(`**内容**: ${message.content}`);
        lines.push('');
        lines.push('**→ 处理完成后，调用 send-message 工具发送你的回复。这是必须的最后一步。**');

        return lines.join('\n');
    }

    private async buildLongTermSection(query: string, agentId: string, roomId: string): Promise<string> {
        if (!this.longTermMemory) {
            return '';
        }

        try {
            // --- Enhanced Query Context (Phase 2) ---
            // Get recent 3 messages for semantic context
            const recentMessages = this.shortTermMemory.get(roomId).slice(-3);
            
            // Clean content to remove noise (JSON, code blocks)
            const cleanedCurrent = this.cleanMessageForQuery(query);
            const cleanedRecent = recentMessages.map(m => this.cleanMessageForQuery(m.content));
            
            // Combine for a richer query
            const contextQuery = [...cleanedRecent, cleanedCurrent].join(' ').trim();

            // --- Enhanced Filters (Phase 2) ---
            const workflowStage = await this.getCurrentWorkflowStage(roomId);
            
            const memories = await this.longTermMemory.recall(contextQuery, 5, {
                agentId,
                roomId,
                timeWindow: {
                    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
                    end: new Date(),
                },
                importance: { min: 3 }, // Focus on important info
                workflowStage, // Prioritize same workflow stage
            });

            if (memories.length === 0) {
                return '';
            }

            const lines = ['## 相关记忆'];
            lines.push('_（从长期记忆中检索到的相关信息）_\n');

            for (const memory of memories) {
                const timestamp = memory.timestamp.toLocaleString();
                const metadata = memory.metadata;
                const tags = metadata?.tags?.length ? ` [${metadata.tags.join(', ')}]` : '';

                lines.push(`**[${timestamp}]${tags}**`);
                lines.push(memory.content);
                lines.push('');
            }

            log.info(`Retrieved ${memories.length} enhanced memories for context: "${contextQuery.substring(0, 50)}..."`);
            return lines.join('\n');
        } catch (error) {
            log.error('Failed to retrieve long-term memories:', error);
            return '';
        }
    }

    /**
     * Remove noise from message content for cleaner vector search.
     */
    private cleanMessageForQuery(content: string): string {
        return content
            .replace(/```[\s\S]*?```/g, '') // Remove code blocks
            // Remove JSON-like structures that look like tool calls or large objects
            // Handles both normal quotes and escaped quotes from logged JSON
            .replace(/\{[\s\S]*?(\\?["'])(tool|skill|action|command)(\\?["']):[\s\S]*?\}/g, '')
            .replace(/\{[\s\S]*?\}/g, (match) => {
                // If it's a significant JSON-like block (> 20 chars), it's likely noise
                return match.length > 20 ? '' : match;
            })
            .substring(0, 500); // Truncate to keep query concise
    }

    /**
     * Helper to get current workflow stage for a room.
     */
    private async getCurrentWorkflowStage(roomId: string): Promise<number | undefined> {
        try {
            const workflowDir = path.join(process.cwd(), '.data/workflows');
            const workflowFile = path.join(workflowDir, `${roomId}.json`);
            
            if (!existsSync(workflowFile)) {
                return undefined;
            }

            const data = await fs.readFile(workflowFile, 'utf8');
            const workflow = JSON.parse(data);
            return workflow.current_stage;
        } catch (error) {
            return undefined;
        }
    }

    private async buildWorkflowStageSection(roomId: string, agentId: string): Promise<string> {
        try {
            const workflowDir = path.join(process.cwd(), '.data/workflows');
            const workflowFile = path.join(workflowDir, `${roomId}.json`);

            // Use existsSync to avoid throwing error for non-existent file
            if (!existsSync(workflowFile)) {
                return '';
            }

            const data = await fs.readFile(workflowFile, 'utf8');
            const workflow: WorkflowState = JSON.parse(data);

            const lines = ['## 当前工作流阶段'];
            lines.push(`**任务**: ${workflow.task_name} (ID: ${workflow.task_id})`);
            lines.push(`**阶段**: Stage ${workflow.current_stage} - ${workflow.stage_name}`);
            lines.push(`**状态**: ${workflow.status}`);
            lines.push('');

            // Role perception
            lines.push('**角色分配**：');
            let myRole = 'observer';
            if (workflow.assignments) {
                for (const [role, id] of Object.entries(workflow.assignments)) {
                    lines.push(`- ${role}: @${id}`);
                    if (id === agentId) {
                        myRole = role;
                    }
                }
            }
            lines.push(`- **你的角色**: ${myRole}`);
            lines.push('');

            if (workflow.description) {
                lines.push(`**任务描述**: ${workflow.description}\n`);
            }

            // Stage guidance
            lines.push('**当前阶段指引**：');
            lines.push(this.getStageGuidanceForAgent(workflow.current_stage, agentId, workflow.assignments));

            return lines.join('\n');
        } catch (error) {
            log.warn(`Failed to load workflow stage for room ${roomId}:`, error);
            return '';
        }
    }

    private getStageGuidanceForAgent(
        stage: number,
        agentId: string,
        assignments: Record<string, string>
    ): string {
        // 1. Determine agent's role
        let role = 'observer';
        for (const [r, id] of Object.entries(assignments)) {
            if (id === agentId) {
                role = r;
                break;
            }
        }

        // 2. Try to get guidance from parsed SKILL.md
        if (this.workflowProtocols && this.workflowProtocols.has(stage)) {
            const protocol = this.workflowProtocols.get(stage)!;
            // If the agent is the primary role for this stage
            if (protocol.primaryRole === role) {
                return `你是本阶段的主要负责人。${protocol.guidance}`;
            }
            // If the agent is a collaborator
            if (protocol.collaborators.includes(role)) {
                return `你是本阶段的协作参与者。${protocol.guidance}`;
            }
            // Generic guidance for others
            return protocol.guidance;
        }

        // 3. Fallback guidance mapping (static backup)
        const guidanceMap: Record<number, Record<string, string>> = {
            0: {
                architect: '你是本阶段的主导者。组织团队讨论任务方向，明确目标和范围。',
                developer: '参与讨论，从实现角度提供技术可行性建议。',
                qa_lead: '参与讨论，从测试角度提出质量关注点。',
            }
        };

        return guidanceMap[stage]?.[role] || '观察当前阶段进展。';
    }

    // ── Token Budget Management ──────────────────────────

    /**
     * Apply token budget constraints to sections.
     * Strategy:
     * 1. Always include highest priority sections (identity, current message)
     * 2. Include other sections in priority order until budget is exhausted
     * 3. Truncate low-priority sections if needed
     */
    private applyTokenBudget(sections: PromptSection[], budget: number): PromptSection[] {
        // Sort by priority (descending)
        const sorted = [...sections].sort((a, b) => b.priority - a.priority);

        const result: PromptSection[] = [];
        let usedTokens = 0;

        for (const section of sorted) {
            if (usedTokens + section.tokenCount <= budget) {
                // Section fits within budget
                result.push(section);
                usedTokens += section.tokenCount;
            } else if (section.priority >= 90) {
                // High-priority section must be included, even if over budget
                log.warn(`Including high-priority section "${section.name}" (${section.tokenCount} tokens) despite budget constraint`);
                result.push(section);
                usedTokens += section.tokenCount;
            } else {
                // Try to truncate section to fit
                const remaining = budget - usedTokens;
                if (remaining > 100) {
                    const truncated = this.truncateSection(section, remaining);
                    result.push(truncated);
                    usedTokens += truncated.tokenCount;
                    log.info(`Truncated section "${section.name}" from ${section.tokenCount} to ${truncated.tokenCount} tokens`);
                } else {
                    log.info(`Skipping section "${section.name}" (${section.tokenCount} tokens) due to budget constraint`);
                }
            }
        }

        // Sort result back to logical order (identity → rules → workflow → skills → participants → guidelines → history → long-term → current)
        const order = ['identity', 'rules', 'workflow_stage', 'skills', 'participants', 'guidelines', 'history', 'long-term', 'current'];
        result.sort((a, b) => {
            const aIdx = order.indexOf(a.name);
            const bIdx = order.indexOf(b.name);
            return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
        });

        return result;
    }

    /**
     * Truncate a section to fit within token limit.
     */
    private truncateSection(section: PromptSection, maxTokens: number): PromptSection {
        // Simple truncation: cut content to fit
        const targetChars = Math.floor(maxTokens * 3.5);
        const truncatedContent = section.content.substring(0, targetChars) + '\n\n[... 内容已截断 ...]';

        return {
            ...section,
            content: truncatedContent,
            tokenCount: estimateTokens(truncatedContent),
        };
    }

    // ── Token Budget Calculation ─────────────────────────

    /**
     * Calculate recommended token budget allocation.
     */
    calculateBudget(totalBudget: number): TokenBudget {
        return {
            total: totalBudget,
            fixed: Math.floor(totalBudget * 0.3),      // 30% for identity + skills
            shortTerm: Math.floor(totalBudget * 0.4),  // 40% for recent messages
            longTerm: Math.floor(totalBudget * 0.1),   // 10% for historical context
            reserved: Math.floor(totalBudget * 0.2),   // 20% for output
        };
    }
}
