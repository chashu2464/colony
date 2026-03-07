// ── Colony: Discord Manager ──────────────────────────────
// Main entry point for Discord integration.

import * as fs from 'fs';
import * as yaml from 'yaml';
import { Logger } from '../utils/Logger.js';
import { DiscordBot } from './DiscordBot.js';
import { DiscordBridge } from './DiscordBridge.js';
import { NotificationManager } from './NotificationManager.js';
import { ChannelSessionMapper } from './ChannelSessionMapper.js';
import type { Colony } from '../Colony.js';
import type { DiscordConfig } from './types.js';

const log = new Logger('DiscordManager');

export class DiscordManager {
    private bot: DiscordBot;
    private bridge: DiscordBridge;
    private notifications: NotificationManager;
    private mapper: ChannelSessionMapper;
    private config: DiscordConfig;
    private colony: Colony;

    constructor(colony: Colony, configPath?: string) {
        // Load configuration
        const path = configPath || 'config/discord.yaml';
        this.config = this.loadConfig(path);
        this.colony = colony;

        // Initialize components
        this.mapper = new ChannelSessionMapper();
        this.bot = new DiscordBot(this.config, colony, this.mapper);
        this.bridge = new DiscordBridge(this.bot, colony, this.mapper);
        this.notifications = new NotificationManager(this.bot, this.config);

        log.info('Discord manager initialized');
    }

    /**
     * Load Discord configuration.
     */
    private loadConfig(path: string): DiscordConfig {
        try {
            const content = fs.readFileSync(path, 'utf-8');
            const config = yaml.parse(content) as DiscordConfig;

            // Substitute environment variables
            if (config.bot.token.startsWith('${') && config.bot.token.endsWith('}')) {
                const envVar = config.bot.token.slice(2, -1);
                config.bot.token = process.env[envVar] || '';
            }

            if (!config.bot.token) {
                throw new Error('Discord bot token not configured');
            }

            return config;
        } catch (error) {
            log.error('Failed to load Discord configuration:', error);
            throw error;
        }
    }

    /**
     * Start Discord integration.
     */
    async start(): Promise<void> {
        log.info('Starting Discord integration...');
        await this.mapper.load();

        // Prune orphan mappings (sessions that no longer exist)
        const existingIds = new Set(this.colony.chatRoomManager.listRooms().map((r: any) => r.id as string));
        const pruned = await this.mapper.pruneOrphans(existingIds);
        if (pruned > 0) {
            log.warn(`Pruned ${pruned} orphan channel mappings on startup`);
        }

        await this.bot.start();
        log.info('Discord integration started');
    }

    /**
     * Stop Discord integration.
     */
    async stop(): Promise<void> {
        log.info('Stopping Discord integration...');
        await this.bot.stop();
        log.info('Discord integration stopped');
    }

    /**
     * Get notification manager.
     */
    getNotificationManager(): NotificationManager {
        return this.notifications;
    }

    /**
     * Get bridge.
     */
    getBridge(): DiscordBridge {
        return this.bridge;
    }

    /**
     * Get bot.
     */
    getBot(): DiscordBot {
        return this.bot;
    }

    /**
     * Get mapper.
     */
    getMapper(): ChannelSessionMapper {
        return this.mapper;
    }
}
