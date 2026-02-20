import type { DiscordBot } from './DiscordBot.js';
import type { Colony } from '../Colony.js';
export declare class DiscordBridge {
    private bot;
    private colony;
    private sessionChannels;
    constructor(bot: DiscordBot, colony: Colony);
    /**
     * Setup listeners for Colony events.
     */
    private setupColonyListeners;
    /**
     * Handle messages from Colony and forward to Discord.
     */
    private handleColonyMessage;
    /**
     * Format Colony message for Discord.
     */
    private formatMessage;
    /**
     * Map a session to a Discord channel.
     */
    mapSessionToChannel(sessionId: string, channelId: string): void;
    /**
     * Unmap a session from Discord channel.
     */
    unmapSession(sessionId: string): void;
}
