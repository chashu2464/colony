// ── Colony: Short-Term Memory ────────────────────────────
// Manages conversation windows with sliding window and compression.

import { Logger } from '../utils/Logger.js';
import type { Message } from '../types.js';
import type { ShortTermMemory as IShortTermMemory, ShortTermConfig } from './types.js';

const log = new Logger('ShortTermMemory');

interface MessageWindow {
    messages: Message[];
    importantIds: Set<string>;
    compressed: boolean;
    compressionSummary?: string;
}

/**
 * Estimates token count for a message (rough approximation).
 * More accurate counting would require tiktoken or similar.
 */
function estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters for English
    // For Chinese/Japanese: 1 token ≈ 2 characters
    // This is a simplification; real tokenization is more complex
    return Math.ceil(text.length / 3.5);
}

export class ShortTermMemory implements IShortTermMemory {
    private windows = new Map<string, MessageWindow>();
    private config: ShortTermConfig;

    constructor(config?: Partial<ShortTermConfig>) {
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
    add(roomId: string, message: Message): void {
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
    get(roomId: string, limit?: number): Message[] {
        const window = this.windows.get(roomId);
        if (!window) return [];

        if (limit) {
            return window.messages.slice(-limit);
        }
        return [...window.messages];
    }

    /**
     * Get all messages from the room.
     */
    getAll(roomId: string): Message[] {
        return this.get(roomId);
    }

    /**
     * Compress old messages in the room to save tokens.
     * Strategy:
     * 1. Keep recent N messages intact
     * 2. Keep all important messages intact
     * 3. Compress the rest into a summary
     */
    async compress(roomId: string): Promise<void> {
        const window = this.windows.get(roomId);
        if (!window || window.messages.length === 0) return;

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
        const summaryMessage: Message = {
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
    markImportant(messageId: string): void {
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
    clear(roomId: string): void {
        this.windows.delete(roomId);
        log.info(`Cleared memory for room ${roomId}`);
    }

    /**
     * Get total token count for a room's messages.
     */
    getTokenCount(roomId: string): number {
        const window = this.windows.get(roomId);
        if (!window) return 0;

        return window.messages.reduce((sum, msg) => {
            return sum + estimateTokens(msg.content) + estimateTokens(msg.sender.name) + 10; // overhead
        }, 0);
    }

    // ── Private Helpers ──────────────────────────────────

    /**
     * Auto-detect important messages based on heuristics.
     */
    private isAutoImportant(message: Message): boolean {
        const content = message.content.toLowerCase();

        // Messages with @mentions are important
        if (message.mentions.length > 0) return true;

        // Messages containing decision keywords
        const decisionKeywords = ['决定', '确定', '选择', 'decide', 'decision', 'choose'];
        if (decisionKeywords.some(kw => content.includes(kw))) return true;

        // Messages containing task keywords
        const taskKeywords = ['任务', '完成', '实现', 'task', 'implement', 'complete'];
        if (taskKeywords.some(kw => content.includes(kw))) return true;

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
    private generateSummary(messages: Message[]): string {
        if (messages.length === 0) return '';

        const lines: string[] = [];
        lines.push(`共 ${messages.length} 条消息，时间范围：${messages[0].timestamp.toLocaleString()} - ${messages[messages.length - 1].timestamp.toLocaleString()}`);

        // Group by sender
        const bySender = new Map<string, number>();
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
    private extractKeywords(text: string): string[] {
        // Remove common words and count frequency
        const stopWords = new Set(['的', '了', '是', '在', '我', '你', '他', '她', '它', '们', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for']);
        const words = text.toLowerCase().match(/[\u4e00-\u9fa5]+|[a-z]+/g) ?? [];
        const freq = new Map<string, number>();

        for (const word of words) {
            if (word.length < 2 || stopWords.has(word)) continue;
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
    serialize(): object {
        const data: Record<string, unknown> = {};
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
    deserialize(data: Record<string, unknown>): void {
        for (const [roomId, windowData] of Object.entries(data)) {
            const wd = windowData as {
                messages: Message[];
                importantIds: string[];
                compressed: boolean;
                compressionSummary?: string;
            };

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
