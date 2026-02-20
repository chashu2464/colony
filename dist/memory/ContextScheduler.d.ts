import type { Message } from '../types.js';
import type { ShortTermMemory } from './ShortTermMemory.js';
import type { ContextScheduler as IContextScheduler, SharingPolicy, SessionSnapshot } from './types.js';
export declare class ContextScheduler implements IContextScheduler {
    private policies;
    private shortTermMemory;
    private archivedSessions;
    constructor(shortTermMemory: ShortTermMemory);
    /**
     * Set memory sharing policy for a room.
     */
    setPolicy(roomId: string, policy: SharingPolicy): void;
    /**
     * Get memory sharing policy for a room.
     */
    getPolicy(roomId: string): SharingPolicy;
    /**
     * Get shared memory for an agent in a room.
     * Applies sharing policy to filter messages.
     */
    getSharedMemory(agentId: string, roomId: string): Message[];
    /**
     * Export a session snapshot for cross-session transfer.
     */
    exportSession(roomId: string): Promise<SessionSnapshot>;
    /**
     * Import a session snapshot into a new room.
     */
    importSession(snapshot: SessionSnapshot, newRoomId: string): Promise<void>;
    /**
     * Archive a session (move to archived storage).
     */
    archiveSession(roomId: string): Promise<void>;
    /**
     * Index session to long-term memory (placeholder for future Hindsight integration).
     */
    indexToLongTerm(roomId: string): Promise<void>;
    /**
     * Clean up old sessions.
     */
    cleanup(olderThan: Date): Promise<void>;
    /**
     * Apply selective sharing policy.
     */
    private applySelectivePolicy;
    /**
     * Generate a summary of a session.
     */
    private generateSessionSummary;
    /**
     * Check if a message is a key decision.
     */
    private isKeyDecision;
    /**
     * Extract top N keywords from text.
     */
    private extractKeywords;
    /**
     * Serialize scheduler state.
     */
    serialize(): object;
    /**
     * Restore scheduler state.
     */
    deserialize(data: {
        policies: [string, SharingPolicy][];
        archivedSessions: [string, SessionSnapshot][];
    }): void;
}
