"use strict";
// ── Colony: Short-Term Memory ────────────────────────────
// Manages conversation windows with sliding window and compression.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShortTermMemory = void 0;
const Logger_js_1 = require("../utils/Logger.js");
const log = new Logger_js_1.Logger('ShortTermMemory');
/**
 * Estimates token count for a message (rough approximation).
 * More accurate counting would require tiktoken or similar.
 */
function estimateTokens(text) {
    // Rough estimate: 1 token ≈ 4 characters for English
    // For Chinese/Japanese: 1 token ≈ 2 characters
    // This is a simplification; real tokenization is more complex
    return Math.ceil(text.length / 3.5);
}
class ShortTermMemory {
    windows = new Map();
    config;
    constructor(config) {
        this.config = {
            windowSize: config?.windowSize ?? 50,
            maxTokens: config?.maxTokens ?? 4000,
            compressionThreshold: config?.compressionThreshold ?? 0.8,
        };
        log.info('ShortTermMemory initialized', this.config);
    }
    /**
     * Add a message to the room's conversation window.
     */
    add(roomId, message) {
        let window = this.windows.get(roomId);
        if (!window) {
            window = {
                messages: [],
                importantIds: new Set(),
                compressed: false,
            };
            this.windows.set(roomId, window);
        }
        window.messages.push(message);
        // Auto-mark important messages (e.g., @mentions, decisions)
        if (this.isAutoImportant(message)) {
            window.importantIds.add(message.id);
        }
        // Check if compression is needed
        const tokenCount = this.getTokenCount(roomId);
        const threshold = this.config.maxTokens * this.config.compressionThreshold;
        if (tokenCount > threshold) {
            log.info(`Room ${roomId} approaching token limit (${tokenCount}/${this.config.maxTokens}), triggering compression`);
            this.compress(roomId).catch(err => {
                log.error(`Failed to compress room ${roomId}:`, err);
            });
        }
        // Enforce window size limit (hard cap)
        if (window.messages.length > this.config.windowSize * 1.5) {
            const excess = window.messages.length - this.config.windowSize;
            log.info(`Room ${roomId} exceeded window size, removing ${excess} oldest messages`);
            window.messages = window.messages.slice(excess);
        }
    }
    /**
     * Get recent messages from the room (up to limit).
     */
    get(roomId, limit) {
        const window = this.windows.get(roomId);
        if (!window)
            return [];
        if (limit) {
            return window.messages.slice(-limit);
        }
        return [...window.messages];
    }
    /**
     * Get all messages from the room.
     */
    getAll(roomId) {
        return this.get(roomId);
    }
    /**
     * Compress old messages in the room to save tokens.
     * Strategy:
     * 1. Keep recent N messages intact
     * 2. Keep all important messages intact
     * 3. Compress the rest into a summary
     */
    async compress(roomId) {
        const window = this.windows.get(roomId);
        if (!window || window.messages.length === 0)
            return;
        const keepRecentCount = Math.min(10, Math.floor(this.config.windowSize * 0.2));
        const recentMessages = window.messages.slice(-keepRecentCount);
        const oldMessages = window.messages.slice(0, -keepRecentCount);
        // Separate important and non-important old messages
        const importantOld = oldMessages.filter(m => window.importantIds.has(m.id));
        const compressibleOld = oldMessages.filter(m => !window.importantIds.has(m.id));
        if (compressibleOld.length === 0) {
            log.info(`Room ${roomId}: No compressible messages, skipping compression`);
            return;
        }
        // Generate summary (simple version - could use LLM for better summaries)
        const summary = this.generateSummary(compressibleOld);
        const summaryTokens = estimateTokens(summary);
        log.info(`Room ${roomId}: Compressed ${compressibleOld.length} messages into ${summaryTokens} tokens`);
        // Create synthetic summary message
        const summaryMessage = {
            id: `summary-${Date.now()}`,
            roomId,
            sender: { id: 'system', type: 'human', name: 'System' },
            content: `[历史消息摘要]\n${summary}`,
            mentions: [],
            timestamp: new Date(),
            metadata: { skillInvocation: false },
        };
        // Rebuild window: summary + important old + recent
        window.messages = [summaryMessage, ...importantOld, ...recentMessages];
        window.compressed = true;
        window.compressionSummary = summary;
        const newTokenCount = this.getTokenCount(roomId);
        log.info(`Room ${roomId}: Token count after compression: ${newTokenCount}/${this.config.maxTokens}`);
    }
    /**
     * Mark a message as important (will be preserved during compression).
     */
    markImportant(messageId) {
        for (const window of this.windows.values()) {
            const message = window.messages.find(m => m.id === messageId);
            if (message) {
                window.importantIds.add(messageId);
                log.info(`Marked message ${messageId} as important`);
                return;
            }
        }
    }
    /**
     * Clear all messages from a room.
     */
    clear(roomId) {
        this.windows.delete(roomId);
        log.info(`Cleared memory for room ${roomId}`);
    }
    /**
     * Get total token count for a room's messages.
     */
    getTokenCount(roomId) {
        const window = this.windows.get(roomId);
        if (!window)
            return 0;
        return window.messages.reduce((sum, msg) => {
            return sum + estimateTokens(msg.content) + estimateTokens(msg.sender.name) + 10; // overhead
        }, 0);
    }
    // ── Private Helpers ──────────────────────────────────
    /**
     * Auto-detect important messages based on heuristics.
     */
    isAutoImportant(message) {
        const content = message.content.toLowerCase();
        // Messages with @mentions are important
        if (message.mentions.length > 0)
            return true;
        // Messages containing decision keywords
        const decisionKeywords = ['决定', '确定', '选择', 'decide', 'decision', 'choose'];
        if (decisionKeywords.some(kw => content.includes(kw)))
            return true;
        // Messages containing task keywords
        const taskKeywords = ['任务', '完成', '实现', 'task', 'implement', 'complete'];
        if (taskKeywords.some(kw => content.includes(kw)))
            return true;
        // Messages from system or containing errors
        if (message.sender.id === 'system' || content.includes('error') || content.includes('错误')) {
            return true;
        }
        return false;
    }
    /**
     * Generate a simple summary of messages.
     * In the future, this could use an LLM for better summaries.
     */
    generateSummary(messages) {
        if (messages.length === 0)
            return '';
        const lines = [];
        lines.push(`共 ${messages.length} 条消息，时间范围：${messages[0].timestamp.toLocaleString()} - ${messages[messages.length - 1].timestamp.toLocaleString()}`);
        // Group by sender
        const bySender = new Map();
        for (const msg of messages) {
            const count = bySender.get(msg.sender.name) ?? 0;
            bySender.set(msg.sender.name, count + 1);
        }
        lines.push('参与者：' + Array.from(bySender.entries()).map(([name, count]) => `${name}(${count}条)`).join(', '));
        // Extract key topics (simple keyword extraction)
        const allContent = messages.map(m => m.content).join(' ');
        const keywords = this.extractKeywords(allContent);
        if (keywords.length > 0) {
            lines.push('主要话题：' + keywords.slice(0, 5).join(', '));
        }
        return lines.join('\n');
    }
    /**
     * Simple keyword extraction (frequency-based).
     */
    extractKeywords(text) {
        // Remove common words and count frequency
        const stopWords = new Set(['的', '了', '是', '在', '我', '你', '他', '她', '它', '们', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for']);
        const words = text.toLowerCase().match(/[\u4e00-\u9fa5]+|[a-z]+/g) ?? [];
        const freq = new Map();
        for (const word of words) {
            if (word.length < 2 || stopWords.has(word))
                continue;
            freq.set(word, (freq.get(word) ?? 0) + 1);
        }
        // Sort by frequency
        return Array.from(freq.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([word]) => word);
    }
    // ── Serialization ────────────────────────────────────
    /**
     * Serialize memory state for persistence.
     */
    serialize() {
        const data = {};
        for (const [roomId, window] of this.windows.entries()) {
            data[roomId] = {
                messages: window.messages,
                importantIds: Array.from(window.importantIds),
                compressed: window.compressed,
                compressionSummary: window.compressionSummary,
            };
        }
        return data;
    }
    /**
     * Restore memory state from serialized data.
     */
    deserialize(data) {
        for (const [roomId, windowData] of Object.entries(data)) {
            const wd = windowData;
            this.windows.set(roomId, {
                messages: wd.messages,
                importantIds: new Set(wd.importantIds),
                compressed: wd.compressed,
                compressionSummary: wd.compressionSummary,
            });
        }
        log.info(`Restored memory for ${this.windows.size} rooms`);
    }
}
exports.ShortTermMemory = ShortTermMemory;
//# sourceMappingURL=ShortTermMemory.js.map