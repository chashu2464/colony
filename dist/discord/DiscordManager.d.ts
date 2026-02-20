import { DiscordBot } from './DiscordBot.js';
import { DiscordBridge } from './DiscordBridge.js';
import { NotificationManager } from './NotificationManager.js';
import type { Colony } from '../Colony.js';
export declare class DiscordManager {
    private bot;
    private bridge;
    private notifications;
    private config;
    constructor(colony: Colony, configPath?: string);
    /**
     * Load Discord configuration.
     */
    private loadConfig;
    /**
     * Start Discord integration.
     */
    start(): Promise<void>;
    /**
     * Stop Discord integration.
     */
    stop(): Promise<void>;
    /**
     * Get notification manager.
     */
    getNotificationManager(): NotificationManager;
    /**
     * Get bridge.
     */
    getBridge(): DiscordBridge;
    /**
     * Get bot.
     */
    getBot(): DiscordBot;
}
