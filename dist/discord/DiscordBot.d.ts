import type { DiscordConfig, UserSession } from './types.js';
import type { Colony } from '../Colony.js';
export declare class DiscordBot {
    private client;
    private config;
    private colony;
    private userSessions;
    private ready;
    private bridge?;
    constructor(config: DiscordConfig, colony: Colony);
    /**
     * Setup Discord event handlers.
     */
    private setupEventHandlers;
    /**
     * Handle incoming Discord messages.
     */
    private handleMessage;
    /**
     * Check if user has permission to use the bot.
     */
    private checkPermissions;
    /**
     * Handle command messages.
     */
    private handleCommand;
    /**
     * Command: Create a new session.
     */
    private cmdCreate;
    /**
     * Command: List all sessions.
     */
    private cmdList;
    /**
     * Command: Join a session.
     */
    private cmdJoin;
    /**
     * Command: Leave current session.
     */
    private cmdLeave;
    /**
     * Command: Show current session.
     */
    private cmdCurrent;
    /**
     * Command: Stop/Pause current session.
     */
    private cmdStop;
    /**
     * Command: Start/Resume current session.
     */
    private cmdStart;
    /**
     * Command: Show system status.
     */
    private cmdStatus;
    /**
     * Command: List all agents.
     */
    private cmdAgents;
    /**
     * Command: Delete a session.
     */
    private cmdDelete;
    /**
     * Command: Show help.
     */
    private cmdHelp;
    /**
     * Forward Discord message to Colony.
     */
    private forwardToColony;
    /**
     * Send a message to Discord channel.
     */
    sendToDiscord(channelId: string, content: string): Promise<void>;
    /**
     * Start the Discord bot.
     */
    start(): Promise<void>;
    /**
     * Stop the Discord bot.
     */
    stop(): Promise<void>;
    /**
     * Get user session.
     */
    getUserSession(userId: string): UserSession | undefined;
    /**
     * Get all user sessions for a room.
     */
    getUserSessionsForRoom(roomId: string): UserSession[];
    /**
     * Set bridge reference.
     */
    setBridge(bridge: any): void;
}
