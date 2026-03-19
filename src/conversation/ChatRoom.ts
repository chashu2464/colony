// ── Colony: Chat Room ────────────────────────────────────
// A chat room where agents and humans communicate.
// Layered message routing:
//   1. Explicit @mention → route to specified agent(s)
//   2. No @mention → route to the default agent
//   3. Non-routed agents can fetch messages via get_messages skill

import { randomUUID as uuid } from 'crypto';
import { Logger } from '../utils/Logger.js';
import { MessageBus } from './MessageBus.js';
import { MentionRouter } from './MentionRouter.js';
import type { Agent } from '../agent/Agent.js';
import type { Message, Participant, ChatRoomInfo } from '../types.js';

const log = new Logger('ChatRoom');

export class ChatRoom {
    readonly id: string;
    readonly name: string;
    readonly createdAt: Date;
    readonly workingDir?: string;

    private agents = new Map<string, Agent>();
    private agentsByName = new Map<string, Agent>();  // name → agent for @name routing
    private humanParticipants = new Map<string, Participant>();
    private messageHistory: Message[] = [];
    private messageBus: MessageBus;
    private unsubscribers: (() => void)[] = [];
    private defaultAgentId: string | null = null;
    private autoSaveCallback?: (roomId: string) => Promise<void>;
    private isPaused: boolean = false;
    private mentionRouter: MentionRouter;

    constructor(name: string, messageBus: MessageBus, id?: string, workingDir?: string, mentionRouter?: MentionRouter) {
        this.id = id ?? uuid();
        this.name = name;
        this.createdAt = new Date();
        this.messageBus = messageBus;
        this.workingDir = workingDir;
        this.mentionRouter = mentionRouter ?? MentionRouter.fromDefaultConfig();

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

        // Auto-detect default agent from config
        if (agent.config.isDefault) {
            this.setDefaultAgent(agent.id);
        }

        log.info(`Agent "${agent.name}" joined room "${this.name}"`);
    }

    /**
     * Get all active agents in this room.
     */
    getAgents(): Agent[] {
        return Array.from(this.agents.values());
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
     *
     * Special handling: 'colony-system' is a system role that can send messages
     * to any room without being a participant.
     */
    sendHumanMessage(senderId: string, content: string, mentions?: string[], metadata?: Message['metadata']): Message {
        let sender = this.humanParticipants.get(senderId);

        // Allow colony-system to send messages without being a participant
        if (!sender && senderId === 'colony-system') {
            sender = {
                id: 'colony-system',
                type: 'human',
                name: 'Colony System'
            };
        }

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
            ...(metadata ? { metadata } : {}),
        };

        this.messageBus.publish(message);
        return message;
    }

    /**
     * Send a message as an agent into this room (used by CLI skill scripts).
     * The agent must belong to this room.
     */
    sendAgentMessage(agentId: string, content: string, mentions?: string[], metadata?: Message['metadata']): Message {
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
            metadata: {
                skillInvocation: true,
                ...metadata,
            },
        };

        this.messageBus.publish(message);
        return message;
    }

    /**
     * Send a system notification message into this room.
     */
    sendSystemMessage(content: string, mentions?: string[], metadata?: Message['metadata']): Message {
        let resolvedMentionIds: string[] = [];
        if (mentions && mentions.length > 0) {
            for (const m of mentions) {
                const agent = this.resolveAgentMention(m);
                if (agent) resolvedMentionIds.push(agent.id);
            }
        }

        const message: Message = {
            id: uuid(),
            roomId: this.id,
            sender: { id: 'system', type: 'human', name: 'System' },
            content,
            mentions: resolvedMentionIds,
            timestamp: new Date(),
            metadata: {
                isSystem: true,
                ...metadata,
            },
        };

        this.messageBus.publish(message);
        return message;
    }

    /**
     * Update an existing message in-place (used for thinking → response replacement).
     */
    updateMessage(messageId: string, content: string, metadata?: Partial<Message['metadata']>): void {
        const msg = this.messageHistory.find(m => m.id === messageId);
        if (!msg) {
            log.warn(`updateMessage: message ${messageId} not found`);
            return;
        }
        msg.content = content;
        if (metadata) {
            msg.metadata = { ...msg.metadata, ...metadata };
        }
        // Emit update event (NOT a new message — frontend replaces in place)
        this.messageBus.emitColonyEvent({
            type: 'message_updated',
            data: { ...msg },
        });
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

        // Skip agent routing for human-in-loop responses
        if (message.metadata?.humanInputResponse) {
            log.info(`Received human-in-loop response, skipping agent routing`);
            return;
        }

        const senderId = message.sender.id;
        const senderIsAgent = this.agents.has(senderId);

        // Agent messages: only use explicit mentions array (from send-message skill param)
        // Human messages: also parse inline @name from message content
        let mentionIds = [...message.mentions];
        if (!senderIsAgent) {
            const parsedFromContent = this.parseMentionsFromContent(message.content);
            for (const id of parsedFromContent) {
                if (!mentionIds.includes(id)) mentionIds.push(id);
            }
        }

        const routed = this.mentionRouter.route(
            message,
            mentionIds,
            (mention) => this.resolveAgentMention(mention)?.id ?? null
        );
        mentionIds = routed.mentionIds;
        if (routed.routingHint) {
            message.metadata = {
                ...message.metadata,
                routingHint: routed.routingHint,
            };
        }

        if (mentionIds.length > 0) {
            // ── Layer 1: Explicit @mention routing ──
            // Both agents and humans: only route to the FIRST mentioned agent (prevent fan-out)
            const otherIds = mentionIds.filter(id => id !== senderId);
            const agentOnlyIds = otherIds.filter(id => this.agents.has(id));
            const routeTargets = agentOnlyIds.slice(0, 1);  // skip user mentions, pick first agent

            for (const mentionedId of routeTargets) {
                const agent = this.agents.get(mentionedId);
                if (agent) {
                    log.info(`Routing message to @${agent.name} in "${this.name}"`);
                    agent.receiveMessage(message).catch(err => {
                        log.error(`Error routing to agent "${agent.name}":`, err);
                    });
                }
            }

            if (agentOnlyIds.length > 1) {
                log.warn(`${senderIsAgent ? 'Agent' : 'Human'} "${message.sender.name}" mentioned ${agentOnlyIds.length} agents, only routing to first one`);
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
                description: a.config.description,
                sessionHealth: a.getSessionHealth(this.id),
            })),
            ...Array.from(this.humanParticipants.values()),
        ];

        return {
            id: this.id,
            name: this.name,
            participants,
            createdAt: this.createdAt,
            messageCount: this.messageHistory.length,
            isPaused: this.isPaused,
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

    getIsPaused(): boolean {
        return this.isPaused;
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
            isPaused: this.isPaused,
            workingDir: this.workingDir,
        };
    }

    /**
     * Restore message history (used when loading from persistence).
     * Cleans up any pending messages that were left in an incomplete state.
     */
    restoreMessages(messages: Message[]): void {
        // Clean up any pending messages from previous session
        const cleanedMessages = messages.map(msg => {
            if (msg.metadata?.isPending) {
                log.warn(`Cleaning up stale pending message ${msg.id} from ${msg.sender.name}`);
                return {
                    ...msg,
                    content: msg.content || '(执行被中断)',
                    metadata: {
                        ...msg.metadata,
                        isPending: false,
                        error: 'Session was interrupted',
                    },
                };
            }
            return msg;
        });

        this.messageHistory = cleanedMessages;
        log.info(`Restored ${messages.length} messages to room "${this.name}"`);
    }

    /**
     * Set paused state (used when loading from persistence).
     */
    setPausedState(isPaused: boolean): void {
        this.isPaused = isPaused;
    }

    /**
     * Pause the chat room.
     */
    pause(): void {
        if (!this.isPaused) {
            this.isPaused = true;
            this.messageBus.emitColonyEvent({ type: 'session_paused', roomId: this.id });

            // Abort any ongoing LLM invocations for all agents in this room
            for (const agent of this.agents.values()) {
                if (typeof agent.abortRoomInvocation === 'function') {
                    agent.abortRoomInvocation(this.id);
                }
            }

            if (this.autoSaveCallback) {
                this.autoSaveCallback(this.id).catch(err => {
                    log.error(`Auto-save failed on pause for room ${this.id}:`, err);
                });
            }
            log.info(`ChatRoom paused: "${this.name}" (${this.id})`);
        }
    }

    /**
     * Resume the chat room.
     */
    resume(): void {
        if (this.isPaused) {
            this.isPaused = false;
            this.messageBus.emitColonyEvent({ type: 'session_resumed', roomId: this.id });
            if (this.autoSaveCallback) {
                this.autoSaveCallback(this.id).catch(err => {
                    log.error(`Auto-save failed on resume for room ${this.id}:`, err);
                });
            }
            log.info(`ChatRoom resumed: "${this.name}" (${this.id})`);
        }
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
