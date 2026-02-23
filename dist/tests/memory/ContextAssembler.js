"use strict";
// ── Colony: Context Assembler ────────────────────────────
// Assembles complete context from multiple sources for LLM prompts.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextAssembler = void 0;
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
            lines.push(`- @${p.name} (${p.type === 'agent' ? '代理' : '人类'})`);
        }
        lines.push('\n你可以通过 @name 的方式提及他们。');
        const result = lines.join('\n');
        log.debug(`Built participants section with ${info.participants.length} participants`);
        return result;
    }
    buildGuidelinesSection() {
        return `## 协作指南

### 核心目标
作为高效的 AI 协作助手，你的任务是执行并达成结果，而不仅仅是回复消息。

### 元规则 (Meta Rules)
1. 主动发言：你的响应只是内心独白，必须通过 send-message skill才能回复问题、共享信息、汇报进度
2. 不确定就提问：遇到不清楚的需求或技术细节时，向相关 Agent 或用户提问，不要硬猜。
3. 禁止表演性同意：如果有疑虑或更好的方案，必须明确提出。
4. 交接必须说明 WHY：提交代码或方案时，说明设计理由和技术选型原因。
5. 重要变更需确认：涉及架构、API 或数据结构的重大调整，必须 @相关 Agent 并等待明确的放行信号（如：可以、LGTM、通过）后方可继续。

### 工具与沟通
- 获取上下文：使用 get-messages 了解对话历史，有疑问时查看项目文件或直接提问。
- 执行工作：使用工具推进任务完成。
- 沟通进度：使用 send-message 汇报结果、请求澄清或确认下一步。你无法直接说话，必须调用此技能。
- 结果导向：不要只说"完成"，要展示具体成果（如：已更新文件 X，通过测试）。`;
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
        const lines = ['## 当前消息'];
        lines.push(`**来自**: ${message.sender.name} (${message.sender.type})`);
        if (message.mentions.includes(agentId)) {
            lines.push(`**你被 @提及了，请务必用 send-message 回复。**`);
        }
        lines.push(`**内容**: ${message.content}`);
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
        // Sort result back to logical order (identity → rules → skills → participants → guidelines → history → long-term → current)
        const order = ['identity', 'rules', 'skills', 'participants', 'guidelines', 'history', 'long-term', 'current'];
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
