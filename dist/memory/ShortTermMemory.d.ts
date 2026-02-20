import type { Message } from '../types.js';
import type { ShortTermMemory as IShortTermMemory, ShortTermConfig } from './types.js';
export declare class ShortTermMemory implements IShortTermMemory {
    private windows;
    private config;
    constructor(config?: Partial<ShortTermConfig>);
    /**
     * Add a message to the room's conversation window.
     */
    add(roomId: string, message: Message): void;
    /**
     * Get recent messages from the room (up to limit).
     */
    get(roomId: string, limit?: number): Message[];
    /**
     * Get all messages from the room.
     */
    getAll(roomId: string): Message[];
    /**
     * Compress old messages in the room to save tokens.
     * Strategy:
     * 1. Keep recent N messages intact
     * 2. Keep all important messages intact
     * 3. Compress the rest into a summary
     */
    compress(roomId: string): Promise<void>;
    /**
     * Mark a message as important (will be preserved during compression).
     */
    markImportant(messageId: string): void;
    /**
     * Clear all messages from a room.
     */
    clear(roomId: string): void;
    /**
     * Get total token count for a room's messages.
     */
    getTokenCount(roomId: string): number;
    /**
     * Auto-detect important messages based on heuristics.
     */
    private isAutoImportant;
    /**
     * Generate a simple summary of messages.
     * In the future, this could use an LLM for better summaries.
     */
    private generateSummary;
    /**
     * Simple keyword extraction (frequency-based).
     */
    private extractKeywords;
    /**
     * Serialize memory state for persistence.
     */
    serialize(): object;
    /**
     * Restore memory state from serialized data.
     */
    deserialize(data: Record<string, unknown>): void;
}
