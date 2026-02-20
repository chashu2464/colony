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
     */
    createRoom(name: string, agentIds?: string[]): ChatRoom;
    /**
     * Get a room by ID.
     */
    getRoom(roomId: string): ChatRoom | undefined;
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
}
