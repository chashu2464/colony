// ── Colony: Context Scheduler ────────────────────────────
// Manages memory sharing, cross-session transfer, and lifecycle.

import { Logger } from '../utils/Logger.js';
import type { Message, Participant } from '../types.js';
import type { ShortTermMemory } from './ShortTermMemory.js';
import type {
    ContextScheduler as IContextScheduler,
    SharingPolicy,
    SessionSnapshot,
} from './types.js';

const log = new Logger('ContextScheduler');

export class ContextScheduler implements IContextScheduler {
    private policies = new Map<string, SharingPolicy>();
    private shortTermMemory: ShortTermMemory;
    private archivedSessions = new Map<string, SessionSnapshot>();

    constructor(shortTermMemory: ShortTermMemory) {
        this.shortTermMemory = shortTermMemory;
    }

    /**
     * Set memory sharing policy for a room.
     */
    setPolicy(roomId: string, policy: SharingPolicy): void {
        this.policies.set(roomId, policy);
        log.info(`Set sharing policy for room ${roomId}: ${policy.mode}`);
    }

    /**
     * Get memory sharing policy for a room.
     */
    getPolicy(roomId: string): SharingPolicy {
        return this.policies.get(roomId) ?? { mode: 'shared' };
    }

    /**
     * Get shared memory for an agent in a room.
     * Applies sharing policy to filter messages.
     */
    getSharedMemory(agentId: string, roomId: string): Message[] {
        const policy = this.getPolicy(roomId);
        const allMessages = this.shortTermMemory.get(roomId);

        switch (policy.mode) {
            case 'isolated':
                // Agent only sees messages sent to/from them
                return allMessages.filter(m =>
                    m.sender.id === agentId || m.mentions.includes(agentId)
                );

            case 'shared':
                // Agent sees all messages in the room
                return allMessages;

            case 'selective':
                // Apply selective rules
                return this.applySelectivePolicy(agentId, allMessages, policy);

            default:
                return allMessages;
        }
    }

    /**
     * Export a session snapshot for cross-session transfer.
     */
    async exportSession(roomId: string): Promise<SessionSnapshot> {
        const messages = this.shortTermMemory.get(roomId);

        // Generate summary
        const summary = this.generateSessionSummary(messages);

        // Extract key decisions (messages marked as important or containing decision keywords)
        const keyDecisions = messages.filter(m =>
            this.isKeyDecision(m)
        );

        // Extract participants
        const participantMap = new Map<string, Participant>();
        for (const msg of messages) {
            participantMap.set(msg.sender.id, msg.sender);
        }

        const snapshot: SessionSnapshot = {
            roomId,
            summary,
            keyDecisions,
            participants: Array.from(participantMap.values()),
            createdAt: messages[0]?.timestamp ?? new Date(),
            archivedAt: new Date(),
        };

        log.info(`Exported session snapshot for room ${roomId}: ${keyDecisions.length} key decisions`);
        return snapshot;
    }

    /**
     * Import a session snapshot into a new room.
     */
    async importSession(snapshot: SessionSnapshot, newRoomId: string): Promise<void> {
        // Create a synthetic message with the session summary
        const summaryMessage: Message = {
            id: `import-${Date.now()}`,
            roomId: newRoomId,
            sender: { id: 'system', type: 'human', name: 'System' },
            content: `[从会话 ${snapshot.roomId} 导入]\n\n${snapshot.summary}\n\n关键决策：\n${snapshot.keyDecisions.map(d => `- ${d.sender.name}: ${d.content}`).join('\n')}`,
            mentions: [],
            timestamp: new Date(),
        };

        this.shortTermMemory.add(newRoomId, summaryMessage);
        log.info(`Imported session snapshot into room ${newRoomId}`);
    }

    /**
     * Archive a session (move to archived storage).
     */
    async archiveSession(roomId: string): Promise<void> {
        const snapshot = await this.exportSession(roomId);
        this.archivedSessions.set(roomId, snapshot);
        log.info(`Archived session ${roomId}`);
    }

    /**
     * Index session to long-term memory (placeholder for future Hindsight integration).
     */
    async indexToLongTerm(roomId: string): Promise<void> {
        const messages = this.shortTermMemory.get(roomId);

        // TODO: Integrate with Hindsight to store important messages
        // For now, just log
        log.info(`Indexed ${messages.length} messages from room ${roomId} to long-term memory (placeholder)`);
    }

    /**
     * Clean up old sessions.
     */
    async cleanup(olderThan: Date): Promise<void> {
        let cleaned = 0;

        for (const [roomId, snapshot] of this.archivedSessions.entries()) {
            if (snapshot.archivedAt < olderThan) {
                this.archivedSessions.delete(roomId);
                cleaned++;
            }
        }

        log.info(`Cleaned up ${cleaned} archived sessions older than ${olderThan.toISOString()}`);
    }

    // ── Private Helpers ──────────────────────────────────

    /**
     * Apply selective sharing policy.
     */
    private applySelectivePolicy(agentId: string, messages: Message[], policy: SharingPolicy): Message[] {
        if (!policy.rules || policy.rules.length === 0) {
            return messages; // No rules, default to shared
        }

        // Find rules that apply to this agent
        const applicableRules = policy.rules.filter(rule =>
            rule.to.includes(agentId) || rule.to.includes('*')
        );

        if (applicableRules.length === 0) {
            // No rules apply, agent sees only their own messages
            return messages.filter(m =>
                m.sender.id === agentId || m.mentions.includes(agentId)
            );
        }

        // Collect allowed sender IDs based on rules
        const allowedSenders = new Set<string>();
        for (const rule of applicableRules) {
            allowedSenders.add(rule.from);
        }

        // Filter messages
        return messages.filter(m => {
            // Agent always sees their own messages and mentions
            if (m.sender.id === agentId || m.mentions.includes(agentId)) {
                return true;
            }

            // Check if sender is allowed by rules
            if (allowedSenders.has(m.sender.id) || allowedSenders.has('*')) {
                // TODO: Apply scope filtering (e.g., only 'decisions')
                return true;
            }

            return false;
        });
    }

    /**
     * Generate a summary of a session.
     */
    private generateSessionSummary(messages: Message[]): string {
        if (messages.length === 0) return '空会话';

        const lines: string[] = [];
        lines.push(`会话包含 ${messages.length} 条消息`);

        // Time range
        const start = messages[0].timestamp;
        const end = messages[messages.length - 1].timestamp;
        lines.push(`时间范围：${start.toLocaleString()} - ${end.toLocaleString()}`);

        // Participants
        const participants = new Set(messages.map(m => m.sender.name));
        lines.push(`参与者：${Array.from(participants).join(', ')}`);

        // Key topics (simple keyword extraction)
        const allContent = messages.map(m => m.content).join(' ');
        const keywords = this.extractKeywords(allContent, 5);
        if (keywords.length > 0) {
            lines.push(`主要话题：${keywords.join(', ')}`);
        }

        return lines.join('\n');
    }

    /**
     * Check if a message is a key decision.
     */
    private isKeyDecision(message: Message): boolean {
        const content = message.content.toLowerCase();
        const decisionKeywords = ['决定', '确定', '选择', '采用', 'decide', 'decision', 'choose', 'adopt'];
        return decisionKeywords.some(kw => content.includes(kw));
    }

    /**
     * Extract top N keywords from text.
     */
    private extractKeywords(text: string, topN: number): string[] {
        const stopWords = new Set(['的', '了', '是', '在', '我', '你', '他', '她', '它', '们', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for']);
        const words = text.toLowerCase().match(/[\u4e00-\u9fa5]+|[a-z]+/g) ?? [];
        const freq = new Map<string, number>();

        for (const word of words) {
            if (word.length < 2 || stopWords.has(word)) continue;
            freq.set(word, (freq.get(word) ?? 0) + 1);
        }

        return Array.from(freq.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, topN)
            .map(([word]) => word);
    }

    // ── Serialization ────────────────────────────────────

    /**
     * Serialize scheduler state.
     */
    serialize(): object {
        return {
            policies: Array.from(this.policies.entries()),
            archivedSessions: Array.from(this.archivedSessions.entries()),
        };
    }

    /**
     * Restore scheduler state.
     */
    deserialize(data: { policies: [string, SharingPolicy][]; archivedSessions: [string, SessionSnapshot][] }): void {
        this.policies = new Map(data.policies);
        this.archivedSessions = new Map(data.archivedSessions);
        log.info(`Restored ${this.policies.size} policies and ${this.archivedSessions.size} archived sessions`);
    }
}
