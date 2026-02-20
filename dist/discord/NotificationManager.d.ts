import type { DiscordBot } from './DiscordBot.js';
import type { DiscordConfig, NotificationEvent } from './types.js';
export declare class NotificationManager {
    private bot;
    private config;
    constructor(bot: DiscordBot, config: DiscordConfig);
    /**
     * Send a notification to Discord.
     */
    notify(event: NotificationEvent): Promise<void>;
    /**
     * Format notification for Discord.
     */
    private formatNotification;
    /**
     * Get emoji for event type.
     */
    private getEmojiForEvent;
    /**
     * Get title for event type.
     */
    private getEventTitle;
}
