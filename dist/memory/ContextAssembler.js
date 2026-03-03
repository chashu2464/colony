"use strict";
// ── Colony: Context Assembler ────────────────────────────
// Assembles complete context from multiple sources for LLM prompts.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextAssembler = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const Logger_js_1 = require("../utils/Logger.js");
const log = new Logger_js_1.Logger('ContextAssembler');
/**
 * Estimates token count for text (rough approximation).
 */
function estimateTokens(text) {
    return Math.ceil(text.length / 3.5);
}
class ContextAssembler {
    agentConfigs = new Map();
    shortTermMemory;
    longTermMemory;
    skillManagers = new Map();
    constructor(shortTermMemory, longTermMemory) {
        this.shortTermMemory = shortTermMemory;
        this.longTermMemory = longTermMemory;
    }
    /**
     * Register an agent's configuration.
     */
    registerAgent(config, skillManager) {
        this.agentConfigs.set(config.id, config);
        this.skillManagers.set(config.id, skillManager);
    }
    /**
     * Assemble a complete prompt for an agent.
     */
    async assemble(options) {
        const config = this.agentConfigs.get(options.agentId);
        if (!config) {
            throw new Error(`Agent ${options.agentId} not registered with ContextAssembler`);
        }
        const skillManager = this.skillManagers.get(options.agentId);
        const chatRoom = options.chatRoom; // Get chatRoom from options
        // Build all sections
        const sections = [];
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
        // 3. Skills (high priority)
        if (skillManager) {
            const skillBlock = skillManager.toPromptBlock();
            if (skillBlock) {
                sections.push({
                    name: 'skills',
                    content: skillBlock,
                    priority: 85,
                    tokenCount: 0,
                });
            }
        }
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
        // 3.5. Participants (high priority, for agent awareness)
        sections.push({
            name: 'participants',
            content: this.buildParticipantsSection(chatRoom),
            priority: 80, // High priority to ensure agent knows who is around
            tokenCount: 0,
        });
        // 4. Collaboration Guidelines (medium priority)
        sections.push({
            name: 'guidelines',
            content: this.buildGuidelinesSection(),
            priority: 70,
            tokenCount: 0,
        });
        // 5. Short-Term Context (medium priority, if enabled)
        if (options.includeHistory !== false) {
            const historyContent = this.buildHistorySection(options.roomId, options.currentMessage);
            if (historyContent) {
                sections.push({
                    name: 'history',
                    content: historyContent,
                    priority: 60,
                    tokenCount: 0,
                });
            }
        }
        // 5.5. Long-Term Memory (medium-high priority, if enabled)
        if (options.includeLongTerm && this.longTermMemory) {
            const longTermContent = await this.buildLongTermSection(options.currentMessage.content, options.agentId, options.roomId);
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
    buildIdentitySection(config) {
        return `# 你是 ${config.name}\n\n${config.personality}`;
    }
    buildRulesSection(rules) {
        const lines = ['## 规则'];
        for (const rule of rules) {
            lines.push(`- ${rule}`);
        }
        return lines.join('\n');
    }
    buildParticipantsSection(chatRoom) {
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
    buildGuidelinesSection() {
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
2. 执行必要的工具调用（查阅文件、执行操作等）
3. **必须调用 send-message 发送回复** ← 永远不能省略这一步`;
    }
    buildHistorySection(roomId, currentMessage) {
        // Get recent messages (excluding the current one)
        const allMessages = this.shortTermMemory.get(roomId);
        const history = allMessages.filter(m => m.id !== currentMessage.id);
        if (history.length === 0) {
            return '';
        }
        // Increased from 10 to 20 to preserve more context during model switches
        const recentHistory = history.slice(-20);
        const lines = ['## 最近对话'];
        // Add context warning if history is truncated
        if (history.length > 20) {
            lines.push(`_（显示最近20条消息，共${history.length}条）_`);
        }
        for (const msg of recentHistory) {
            const time = msg.timestamp.toLocaleTimeString();
            const mentions = msg.mentions.length > 0 ? ` @[${msg.mentions.join(', ')}]` : '';
            lines.push(`**[${time}] ${msg.sender.name}${mentions}**: ${msg.content}`);
        }
        return lines.join('\n');
    }
    buildCurrentMessageSection(message, agentId) {
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
    async buildLongTermSection(query, agentId, roomId) {
        if (!this.longTermMemory) {
            return '';
        }
        try {
            // Recall relevant memories from long-term storage
            const memories = await this.longTermMemory.recall(query, 5, {
                agentId,
                roomId
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
            log.info(`Retrieved ${memories.length} long-term memories for query: "${query.substring(0, 50)}..."`);
            return lines.join('\n');
        }
        catch (error) {
            log.error('Failed to retrieve long-term memories:', error);
            return '';
        }
    }
    async buildWorkflowStageSection(roomId, agentId) {
        try {
            const workflowDir = path.join(process.cwd(), '.data/workflows');
            const workflowFile = path.join(workflowDir, `${roomId}.json`);
            const data = await fs.readFile(workflowFile, 'utf8');
            const workflow = JSON.parse(data);
            const lines = ['## 当前工作流阶段'];
            lines.push(`- **任务**: ${workflow.task_name}`);
            lines.push(`- **当前阶段**: ${workflow.stage_name} (Stage ${workflow.current_stage})`);
            // Find agent's role
            let role = 'observer';
            if (workflow.assignments) {
                for (const [r, id] of Object.entries(workflow.assignments)) {
                    if (id === agentId) {
                        role = r;
                        break;
                    }
                }
            }
            lines.push(`- **你的角色**: ${role}`);
            lines.push(`- **状态**: ${workflow.status}`);
            if (workflow.description) {
                lines.push(`\n**任务描述**: ${workflow.description}`);
            }
            return lines.join('\n');
        }
        catch (error) {
            // Silently fail if workflow file doesn't exist or is invalid
            return '';
        }
    }
    // ── Token Budget Management ──────────────────────────
    /**
     * Apply token budget constraints to sections.
     * Strategy:
     * 1. Always include highest priority sections (identity, current message)
     * 2. Include other sections in priority order until budget is exhausted
     * 3. Truncate low-priority sections if needed
     */
    applyTokenBudget(sections, budget) {
        // Sort by priority (descending)
        const sorted = [...sections].sort((a, b) => b.priority - a.priority);
        const result = [];
        let usedTokens = 0;
        for (const section of sorted) {
            if (usedTokens + section.tokenCount <= budget) {
                // Section fits within budget
                result.push(section);
                usedTokens += section.tokenCount;
            }
            else if (section.priority >= 90) {
                // High-priority section must be included, even if over budget
                log.warn(`Including high-priority section "${section.name}" (${section.tokenCount} tokens) despite budget constraint`);
                result.push(section);
                usedTokens += section.tokenCount;
            }
            else {
                // Try to truncate section to fit
                const remaining = budget - usedTokens;
                if (remaining > 100) {
                    const truncated = this.truncateSection(section, remaining);
                    result.push(truncated);
                    usedTokens += truncated.tokenCount;
                    log.info(`Truncated section "${section.name}" from ${section.tokenCount} to ${truncated.tokenCount} tokens`);
                }
                else {
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
    truncateSection(section, maxTokens) {
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
    calculateBudget(totalBudget) {
        return {
            total: totalBudget,
            fixed: Math.floor(totalBudget * 0.3), // 30% for identity + skills
            shortTerm: Math.floor(totalBudget * 0.4), // 40% for recent messages
            longTerm: Math.floor(totalBudget * 0.1), // 10% for historical context
            reserved: Math.floor(totalBudget * 0.2), // 20% for output
        };
    }
}
exports.ContextAssembler = ContextAssembler;
//# sourceMappingURL=ContextAssembler.js.map