"use strict";
// ── Colony: Chat Room Manager ────────────────────────────
// Creates, manages, and switches chat rooms/sessions.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatRoomManager = void 0;
const Logger_js_1 = require("../utils/Logger.js");
const ChatRoom_js_1 = require("./ChatRoom.js");
const SessionRecord_js_1 = require("../session/SessionRecord.js");
const TranscriptWriter_js_1 = require("../session/TranscriptWriter.js");
const log = new Logger_js_1.Logger('ChatRoomManager');
class ChatRoomManager {
    rooms = new Map();
    messageBus;
    agentRegistry;
    sessionManager;
    constructor(messageBus, agentRegistry, sessionManager) {
        this.messageBus = messageBus;
        this.agentRegistry = agentRegistry;
        this.sessionManager = sessionManager;
    }
    /**
     * Create a new chat room with specified agents.
     * @param workingDir - Optional working directory for CLI tools
     */
    createRoom(name, agentIds, workingDir) {
        const room = new ChatRoom_js_1.ChatRoom(name, this.messageBus, undefined, workingDir);
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
            if (agent)
                room.addAgent(agent);
        }
        log.info(`Room created: "${name}" with ${agents.length} agents`);
        return room;
    }
    /**
     * Get a room by ID.
     */
    getRoom(roomId) {
        return this.rooms.get(roomId);
    }
    /**
     * Get rooms by exact name (case-insensitive).
     */
    getRoomByName(name) {
        if (!name)
            return [];
        const target = name.toLowerCase();
        return Array.from(this.rooms.values()).filter(r => r.name?.toLowerCase() === target);
    }
    /**
     * List all rooms.
     */
    listRooms() {
        return Array.from(this.rooms.values()).map(r => r.getInfo());
    }
    /**
     * Delete a room.
     */
    async deleteRoom(roomId) {
        const room = this.rooms.get(roomId);
        if (!room)
            return false;
        room.destroy();
        this.rooms.delete(roomId);
        // 1. Delete main room session file
        await this.sessionManager.deleteSession(roomId);
        // 2. Delete workflow state associated with the room
        await this.sessionManager.deleteWorkflow(roomId);
        // 3. Cascade delete agent session chains (per-agent-per-room files)
        const sessionStore = new SessionRecord_js_1.SessionStore();
        sessionStore.deleteByRoom(roomId);
        // 4. Cascade delete transcript directories
        const transcriptWriter = new TranscriptWriter_js_1.TranscriptWriter();
        transcriptWriter.deleteByRoom(roomId);
        log.info(`Room deleted: ${roomId}`);
        return true;
    }
    /**
     * Save the current state of a room.
     */
    async saveRoom(roomId) {
        const room = this.rooms.get(roomId);
        if (!room)
            throw new Error(`Room not found: ${roomId}`);
        await this.sessionManager.saveSession(roomId, room.serialize());
        log.info(`Room saved: ${roomId}`);
    }
    /**
     * Restore a room from saved state.
     */
    async restoreRoom(roomId) {
        const data = await this.sessionManager.loadSession(roomId);
        if (!data) {
            log.warn(`No saved session for room: ${roomId}`);
            return null;
        }
        const roomData = data;
        const room = new ChatRoom_js_1.ChatRoom(roomData.name, this.messageBus, roomData.id, roomData.workingDir);
        this.rooms.set(room.id, room);
        // Set up auto-save on message
        room.setAutoSaveCallback(async (roomId) => {
            await this.saveRoom(roomId);
        });
        // Re-add agents
        for (const agentId of roomData.agentIds) {
            const agent = this.agentRegistry.get(agentId);
            if (agent)
                room.addAgent(agent);
        }
        // Re-add humans
        for (const human of roomData.humanParticipants) {
            room.addHuman(human);
        }
        // Restore default agent
        if (roomData.defaultAgentId) {
            try {
                room.setDefaultAgent(roomData.defaultAgentId);
            }
            catch (err) {
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
    async restoreAllSessions() {
        const sessionIds = await this.sessionManager.listSessions();
        log.info(`Restoring ${sessionIds.length} saved sessions...`);
        for (const sessionId of sessionIds) {
            try {
                await this.restoreRoom(sessionId);
            }
            catch (err) {
                log.error(`Failed to restore session ${sessionId}:`, err);
            }
        }
        log.info(`Restored ${this.rooms.size} sessions`);
    }
    /**
     * Add a human to a room.
     */
    joinRoom(roomId, participant) {
        const room = this.rooms.get(roomId);
        if (!room)
            throw new Error(`Room not found: ${roomId}`);
        room.addHuman(participant);
    }
    /**
     * Stop a chat room (abort agent threads)
     */
    stopRoom(roomId) {
        const room = this.rooms.get(roomId);
        if (!room)
            throw new Error(`Room not found: ${roomId}`);
        const agents = room.getAgents();
        for (const agent of agents) {
            if (typeof agent.abortRoomInvocation === 'function') {
                agent.abortRoomInvocation(roomId);
            }
        }
        log.info(`Aborted threads for room: ${roomId}`);
    }
}
exports.ChatRoomManager = ChatRoomManager;
//# sourceMappingURL=ChatRoomManager.js.map