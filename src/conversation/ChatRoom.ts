// ── Colony: Chat Room ────────────────────────────────────
// A chat room where agents and humans communicate.
// Layered message routing:
//   1. Explicit @mention → route to specified agent(s)
//   2. No @mention → route to the default agent
//   3. Non-routed agents can fetch messages via get_messages skill

import { randomUUID as uuid } from 'crypto';
import { Logger } from '../utils/Logger.js';
import { MessageBus } from './MessageBus.js';
import type { Agent } from '../agent/Agent.js';
import type { Message, Participant, ChatRoomInfo } from '../types.js';

const log = new Logger('ChatRoom');

export class ChatRoom {
    readonly id: string;
    readonly name: string;
    readonly createdAt: Date;

    private agents = new Map<string, Agent>();
    private agentsByName = new Map<string, Agent>();  // name → agent for @name routing
    private humanParticipants = new Map<string, Participant>();
    private messageHistory: Message[] = [];
    private messageBus: MessageBus;
    private unsubscribers: (() => void)[] = [];
    private defaultAgentId: string | null = null;
    private autoSaveCallback?: (roomId: string) => Promise<void>;

    constructor(name: string, messageBus: MessageBus, id?: string) {
        this.id = id ?? uuid();
        this.name = name;
        this.createdAt = new Date();
        this.messageBus = messageBus;

        // Subscribe to messages on this room via the bus
        const unsub = this.messageBus.subscribe(this.id, (message) => {
            this.onMessage(message);
        });
        this.unsubscribers.push(unsub);

        log.info(`ChatRoom created: "${name}" (${this.id})`);
    }

    // ── Participant Management ───────────────────────────

    /**
     * Add an agent to this room.
     */
    addAgent(agent: Agent): void {
        if (this.agents.has(agent.id)) return;
        this.agents.set(agent.id, agent);
        this.agentsByName.set(agent.name, agent);

        // Wire the agent's sendMessage handler to publish through the bus
        agent.setSendMessageHandler((roomId, message) => {
            if (roomId === this.id) {
                this.messageBus.publish(message);
            }
        });

        // Wire the agent's getMessages handler for passive visibility
        agent.setGetMessagesHandler((roomId, limit) => {
            if (roomId === this.id) {
                return this.getMessages(limit);
            }
            return [];
        });

        // Auto-detect default agent from config
        if (agent.config.isDefault) {
            this.setDefaultAgent(agent.id);
        }

        log.info(`Agent "${agent.name}" joined room "${this.name}"`);
    }

    /**
     * Remove an agent from this room.
     */
    removeAgent(agentId: string): void {
        const agent = this.agents.get(agentId);
        if (agent) {
            this.agentsByName.delete(agent.name);
        }
        this.agents.delete(agentId);
        if (this.defaultAgentId === agentId) {
            this.defaultAgentId = null;
        }
    }

    /**
     * Set the default agent for this room (receives messages when no @ is used).
     */
    setDefaultAgent(agentId: string): void {
        if (!this.agents.has(agentId)) {
            throw new Error(`Agent "${agentId}" is not in this room`);
        }
        this.defaultAgentId = agentId;
        log.info(`Default agent for room "${this.name}": ${agentId}`);
    }

    /**
     * Add a human participant.
     */
    addHuman(participant: Participant): void {
        this.humanParticipants.set(participant.id, participant);
        log.info(`Human "${participant.name}" joined room "${this.name}"`);
    }

    /**
     * Remove a human participant.
     */
    removeHuman(participantId: string): void {
        this.humanParticipants.delete(participantId);
    }

    // ── Mention Resolution ──────────────────────────────

    /**
     * Resolve a mention string to an agent.
     * Matches by name first (e.g. @开发者), then by ID (e.g. @developer).
     */
    private resolveAgentMention(mention: string): Agent | undefined {
        return this.agentsByName.get(mention) ?? this.agents.get(mention);
    }

    /**
     * Parse @mentions from message content text.
     * Extracts all @xxx tokens and resolves them to agent IDs.
     */
    private parseMentionsFromContent(content: string): string[] {
        const mentionRegex = /@(\S+)/g;
        const resolved: string[] = [];
        let match;
        while ((match = mentionRegex.exec(content)) !== null) {
            const agent = this.resolveAgentMention(match[1]);
            if (agent) {
                resolved.push(agent.id);
            }
        }
        return resolved;
    }

    // ── Messaging ────────────────────────────────────────

    /**
     * Send a message from a human into this room (publishes through bus).
     * The `mentions` param can contain agent names OR IDs — both work.
     */
    sendHumanMessage(senderId: string, content: string, mentions?: string[]): Message {
        const sender = this.humanParticipants.get(senderId);
        if (!sender) {
            throw new Error(`Human "${senderId}" is not in this room`);
        }

        // Resolve mentions: use provided list, or auto-parse from content
        let resolvedMentionIds: string[] = [];
        if (mentions && mentions.length > 0) {
            // Resolve each mention by name or ID
            for (const m of mentions) {
                const agent = this.resolveAgentMention(m);
                if (agent) resolvedMentionIds.push(agent.id);
            }
        }
        // Also parse from content to catch any @name in the text
        const parsedFromContent = this.parseMentionsFromContent(content);
        // Merge & deduplicate
        resolvedMentionIds = [...new Set([...resolvedMentionIds, ...parsedFromContent])];

        const message: Message = {
            id: uuid(),
            roomId: this.id,
            sender,
            content,
            mentions: resolvedMentionIds,
            timestamp: new Date(),
        };

        this.messageBus.publish(message);
        return message;
    }

    /**
     * Send a message as an agent into this room (used by CLI skill scripts).
     * The agent must belong to this room.
     */
    sendAgentMessage(agentId: string, content: string, mentions?: string[]): Message {
        const agent = this.agents.get(agentId);
        if (!agent) {
            throw new Error(`Agent "${agentId}" is not in this room`);
        }

        let resolvedMentionIds: string[] = [];
        if (mentions && mentions.length > 0) {
            for (const m of mentions) {
                const resolved = this.resolveAgentMention(m);
                if (resolved) resolvedMentionIds.push(resolved.id);
            }
        }
        const parsedFromContent = this.parseMentionsFromContent(content);
        resolvedMentionIds = [...new Set([...resolvedMentionIds, ...parsedFromContent])];

        const message: Message = {
            id: uuid(),
            roomId: this.id,
            sender: { id: agent.id, type: 'agent', name: agent.name },
            content,
            mentions: resolvedMentionIds,
            timestamp: new Date(),
            metadata: { skillInvocation: true },
        };

        this.messageBus.publish(message);
        return message;
    }

    /**
     * Layered message routing:
     *   Layer 1: If message has @mentions → route only to mentioned agents
     *   Layer 2: If no @mentions AND sender is human → route to the default agent
     *   Layer 3: Non-routed agents are NOT notified, but can use
     *            get_messages skill to pull the message history themselves
     *
     * IMPORTANT: Agent-sent messages without @mentions do NOT trigger the
     * default agent. This prevents infinite agent-to-agent loops.
     */
    private onMessage(message: Message): void {
        // Always add to history (all participants can access via get_messages)
        this.messageHistory.push(message);

        // Trigger auto-save callback if set
        if (this.autoSaveCallback) {
            this.autoSaveCallback(this.id).catch(err => {
                log.error(`Auto-save failed for room ${this.id}:`, err);
            });
        }

        const senderId = message.sender.id;
        const senderIsAgent = this.agents.has(senderId);

        // Re-resolve mentions from content (agent messages may contain @name)
        let mentionIds = [...message.mentions];
        const parsedFromContent = this.parseMentionsFromContent(message.content);
        for (const id of parsedFromContent) {
            if (!mentionIds.includes(id)) mentionIds.push(id);
        }

        if (mentionIds.length > 0) {
            // ── Layer 1: Explicit @mention routing ──
            for (const mentionedId of mentionIds) {
                if (mentionedId === senderId) continue;
                const agent = this.agents.get(mentionedId);
                if (agent) {
                    log.info(`Routing message to @${agent.name} in "${this.name}"`);
                    agent.receiveMessage(message).catch(err => {
                        log.error(`Error routing to agent "${agent.name}":`, err);
                    });
                }
            }
        } else if (!senderIsAgent) {
            // ── Layer 2: Default agent fallback (human messages only) ──
            if (this.defaultAgentId && this.defaultAgentId !== senderId) {
                const defaultAgent = this.agents.get(this.defaultAgentId);
                if (defaultAgent) {
                    log.info(`Routing to default agent @${defaultAgent.name} in "${this.name}"`);
                    defaultAgent.receiveMessage(message).catch(err => {
                        log.error(`Error routing to default agent "${defaultAgent.name}":`, err);
                    });
                }
            } else {
                log.debug(`No default agent set for room "${this.name}", message not routed`);
            }
        } else {
            // Agent-sent message with no @mentions → do not route to default
            log.debug(`Agent "${message.sender.name}" sent message without @mention, not routing to default`);
        }

        // Layer 3: Non-routed agents are NOT notified here.
        // They can use the get_messages skill to access messageHistory.
    }

    // ── Query ────────────────────────────────────────────

    getInfo(): ChatRoomInfo {
        const participants: Participant[] = [
            ...Array.from(this.agents.values()).map(a => ({
                id: a.id,
                type: 'agent' as const,
                name: a.name,
            })),
            ...Array.from(this.humanParticipants.values()),
        ];

        return {
            id: this.id,
            name: this.name,
            participants,
            createdAt: this.createdAt,
            messageCount: this.messageHistory.length,
        };
    }

    getMessages(limit?: number): Message[] {
        if (limit) {
            return this.messageHistory.slice(-limit);
        }
        return [...this.messageHistory];
    }

    getParticipantIds(): string[] {
        return [
            ...this.agents.keys(),
            ...this.humanParticipants.keys(),
        ];
    }

    getDefaultAgentId(): string | null {
        return this.defaultAgentId;
    }

    // ── Lifecycle ────────────────────────────────────────

    /**
     * Serialize room state for persistence.
     */
    serialize(): object {
        return {
            id: this.id,
            name: this.name,
            createdAt: this.createdAt.toISOString(),
            agentIds: Array.from(this.agents.keys()),
            humanParticipants: Array.from(this.humanParticipants.values()),
            messages: this.messageHistory,
            defaultAgentId: this.defaultAgentId,
        };
    }

    /**
     * Restore message history (used when loading from persistence).
     */
    restoreMessages(messages: Message[]): void {
        this.messageHistory = [...messages];
        log.info(`Restored ${messages.length} messages to room "${this.name}"`);
    }

    /**
     * Set auto-save callback (called after each message).
     */
    setAutoSaveCallback(callback: (roomId: string) => Promise<void>): void {
        this.autoSaveCallback = callback;
    }

    /**
     * Clean up subscriptions.
     */
    destroy(): void {
        for (const unsub of this.unsubscribers) {
            unsub();
        }
        this.messageBus.clearRoom(this.id);
        log.info(`ChatRoom destroyed: "${this.name}" (${this.id})`);
    }
}
