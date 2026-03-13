// @ts-nocheck
// ── Colony: Chat Room Manager ────────────────────────────
// Creates, manages, and switches chat rooms/sessions.

import { Logger } from '../utils/Logger.js';
import { ChatRoom } from './ChatRoom.js';
import { MessageBus } from './MessageBus.js';
import { SessionManager } from './SessionManager.js';
import { SessionStore } from '../session/SessionRecord.js';
import { TranscriptWriter } from '../session/TranscriptWriter.js';
import type { AgentRegistry } from '../agent/AgentRegistry.js';
import type { ChatRoomInfo, Participant, Message } from '../types.js';

const log = new Logger('ChatRoomManager');

export class ChatRoomManager {
    private rooms = new Map<string, ChatRoom>();
    private messageBus: MessageBus;
    private agentRegistry: AgentRegistry;
    private sessionManager: SessionManager;

    constructor(
        messageBus: MessageBus,
        agentRegistry: AgentRegistry,
        sessionManager: SessionManager
    ) {
        this.messageBus = messageBus;
        this.agentRegistry = agentRegistry;
        this.sessionManager = sessionManager;
    }

    /**
     * Create a new chat room with specified agents.
     * @param workingDir - Optional working directory for CLI tools
     */
    createRoom(name: string, agentIds?: string[], workingDir?: string): ChatRoom {
        const room = new ChatRoom(name, this.messageBus, undefined, workingDir);
        this.rooms.set(room.id, room);

        // Set up auto-save on message
        room.setAutoSaveCallback(async (roomId) => {
            await this.saveRoom(roomId);
        });

        // Add specified agents (or all agents if none specified)
        const agents = agentIds
            ? agentIds.map(id => this.agentRegistry.getByIdOrName(id)).filter(Boolean)
            : this.agentRegistry.getAll();

        for (const agent of agents) {
            if (agent) room.addAgent(agent);
        }

        log.info(`Room created: "${name}" with ${agents.length} agents`);
        return room;
    }

    /**
     * Get a room by ID.
     */
    getRoom(roomId: string): ChatRoom | undefined {
        return this.rooms.get(roomId);
    }

    /**
     * Get rooms by exact name (case-insensitive).
     */
    getRoomByName(name: string): ChatRoom[] {
        if (!name) return [];
        const target = name.toLowerCase();
        return Array.from(this.rooms.values()).filter(r => r.name?.toLowerCase() === target);
    }

    /**
     * List all rooms.
     */
    listRooms(): ChatRoomInfo[] {
        return Array.from(this.rooms.values()).map(r => r.getInfo());
    }

    /**
     * Delete a room.
     */
    async deleteRoom(roomId: string): Promise<boolean> {
        const room = this.rooms.get(roomId);
        if (!room) return false;
        room.destroy();
        this.rooms.delete(roomId);

        // 1. Delete main room session file
        await this.sessionManager.deleteSession(roomId);

        // 2. Delete workflow state associated with the room
        await this.sessionManager.deleteWorkflow(roomId);

        // 3. Cascade delete agent session chains (per-agent-per-room files)
        const sessionStore = new SessionStore();
        sessionStore.deleteByRoom(roomId);

        // 4. Cascade delete transcript directories
        const transcriptWriter = new TranscriptWriter();
        transcriptWriter.deleteByRoom(roomId);

        log.info(`Room deleted: ${roomId}`);
        return true;
    }

    /**
     * Save the current state of a room.
     */
    async saveRoom(roomId: string): Promise<void> {
        const room = this.rooms.get(roomId);
        if (!room) throw new Error(`Room not found: ${roomId}`);
        await this.sessionManager.saveSession(roomId, room.serialize());
        log.info(`Room saved: ${roomId}`);
    }

    /**
     * Restore a room from saved state.
     */
    async restoreRoom(roomId: string): Promise<ChatRoom | null> {
        const data = await this.sessionManager.loadSession(roomId);
        if (!data) {
            log.warn(`No saved session for room: ${roomId}`);
            return null;
        }

        const roomData = data as {
            id: string;
            name: string;
            createdAt: string;
            agentIds: string[];
            humanParticipants: Participant[];
            messages: Message[];
            defaultAgentId: string | null;
            isPaused?: boolean;
            workingDir?: string;
        };

        const room = new ChatRoom(roomData.name, this.messageBus, roomData.id, roomData.workingDir);
        this.rooms.set(room.id, room);

        // Set up auto-save on message
        room.setAutoSaveCallback(async (roomId) => {
            await this.saveRoom(roomId);
        });

        // Re-add agents
        for (const agentId of roomData.agentIds) {
            const agent = this.agentRegistry.get(agentId);
            if (agent) room.addAgent(agent);
        }

        // Re-add humans
        for (const human of roomData.humanParticipants) {
            room.addHuman(human);
        }

        // Restore default agent
        if (roomData.defaultAgentId) {
            try {
                room.setDefaultAgent(roomData.defaultAgentId);
            } catch (err) {
                log.warn(`Failed to restore default agent ${roomData.defaultAgentId}:`, err);
            }
        }

        // Restore paused state
        if (roomData.isPaused) {
            room.setPausedState(true);
        }

        // Restore message history
        if (roomData.messages && roomData.messages.length > 0) {
            room.restoreMessages(roomData.messages);
            log.info(`Restored ${roomData.messages.length} messages for room "${roomData.name}"`);
        }

        log.info(`Room restored: "${roomData.name}" (${room.id})`);
        return room;
    }

    /**
     * Restore all saved sessions on startup.
     */
    async restoreAllSessions(): Promise<void> {
        const sessionIds = await this.sessionManager.listSessions();
        log.info(`Restoring ${sessionIds.length} saved sessions...`);

        for (const sessionId of sessionIds) {
            try {
                await this.restoreRoom(sessionId);
            } catch (err) {
                log.error(`Failed to restore session ${sessionId}:`, err);
            }
        }

        log.info(`Restored ${this.rooms.size} sessions`);
    }

    /**
     * Add a human to a room.
     */
    joinRoom(roomId: string, participant: Participant): void {
        const room = this.rooms.get(roomId);
        if (!room) throw new Error(`Room not found: ${roomId}`);
        room.addHuman(participant);
    }

    /**
     * Update agents in a room.
     * @param roomId - Room ID to update
     * @param agentIds - New list of agent names or IDs
     */
    updateRoomAgents(roomId: string, agentIds: string[]): void {
        const room = this.rooms.get(roomId);
        if (!room) throw new Error(`Room not found: ${roomId}`);

        const currentAgents = room.getAgents();
        const newAgents = agentIds
            .map(id => this.agentRegistry.getByIdOrName(id))
            .filter((a): a is any => a !== undefined);

        // 1. Remove agents not in the new list
        for (const agent of currentAgents) {
            if (!newAgents.find(a => a.id === agent.id)) {
                // Terminate pending work
                if (typeof agent.abortRoomInvocation === 'function') {
                    agent.abortRoomInvocation(roomId);
                }
                room.removeAgent(agent.id);
                log.info(`Agent "${agent.name}" removed from room ${roomId}`);
            }
        }

        // 2. Add agents not in the current list
        for (const agent of newAgents) {
            if (!currentAgents.find(a => a.id === agent.id)) {
                room.addAgent(agent);
                log.info(`Agent "${agent.name}" added to room ${roomId}`);
            }
        }

        // 3. Ensure a default agent exists if list is not empty
        const info = room.getInfo();
        const activeAgents = info.participants.filter(p => p.type === 'agent');
        if (activeAgents.length > 0) {
            const currentDefault = room.getDefaultAgentId();
            if (!currentDefault || !activeAgents.find(p => p.id === currentDefault)) {
                room.setDefaultAgent(activeAgents[0].id);
                log.info(`Room ${roomId} default agent updated to: ${activeAgents[0].name}`);
            }
        }

        log.info(`Updated agents for room ${roomId}. New count: ${activeAgents.length}`);
    }

    /**
     * Stop a chat room (abort agent threads)
     */
    stopRoom(roomId: string): void {
        const room = this.rooms.get(roomId);
        if (!room) throw new Error(`Room not found: ${roomId}`);
        const agents = room.getAgents();
        for (const agent of agents) {
            if (typeof agent.abortRoomInvocation === 'function') {
                agent.abortRoomInvocation(roomId);
            }
        }
        log.info(`Aborted threads for room: ${roomId}`);
    }
}
