import { ChatRoom } from './ChatRoom.js';
import { MessageBus } from './MessageBus.js';
import { SessionManager } from './SessionManager.js';
import type { AgentRegistry } from '../agent/AgentRegistry.js';
import type { ChatRoomInfo, Participant } from '../types.js';
export declare class ChatRoomManager {
    private rooms;
    private messageBus;
    private agentRegistry;
    private sessionManager;
    constructor(messageBus: MessageBus, agentRegistry: AgentRegistry, sessionManager: SessionManager);
    /**
     * Create a new chat room with specified agents.
     * @param workingDir - Optional working directory for CLI tools
     */
    createRoom(name: string, agentIds?: string[], workingDir?: string): ChatRoom;
    /**
     * Get a room by ID.
     */
    getRoom(roomId: string): ChatRoom | undefined;
    /**
     * Get rooms by exact name (case-insensitive).
     */
    getRoomByName(name: string): ChatRoom[];
    /**
     * List all rooms.
     */
    listRooms(): ChatRoomInfo[];
    /**
     * Delete a room.
     */
    deleteRoom(roomId: string): Promise<boolean>;
    /**
     * Save the current state of a room.
     */
    saveRoom(roomId: string): Promise<void>;
    /**
     * Restore a room from saved state.
     */
    restoreRoom(roomId: string): Promise<ChatRoom | null>;
    /**
     * Restore all saved sessions on startup.
     */
    restoreAllSessions(): Promise<void>;
    /**
     * Add a human to a room.
     */
    joinRoom(roomId: string, participant: Participant): void;
    /**
     * Pause a chat room.
     */
    pauseRoom(roomId: string): void;
    /**
     * Resume a chat room.
     */
    resumeRoom(roomId: string): void;
}
