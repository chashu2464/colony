// @ts-nocheck
// ── Colony: Discord Bridge ───────────────────────────────
// Bridges messages between Colony and Discord.

import { Logger } from '../utils/Logger.js';
import type { DiscordBot } from './DiscordBot.js';
import type { Colony } from '../Colony.js';
import type { Message } from '../types.js';
import type { ChannelSessionMapper } from './ChannelSessionMapper.js';

const log = new Logger('DiscordBridge');

export class DiscordBridge {
    private bot: DiscordBot;
    private colony: Colony;
    private mapper: ChannelSessionMapper;

    constructor(bot: DiscordBot, colony: Colony, mapper: ChannelSessionMapper) {
        this.bot = bot;
        this.colony = colony;
        this.mapper = mapper;

        this.setupColonyListeners();
    }

    /**
     * Setup listeners for Colony events.
     */
    private setupColonyListeners(): void {
        // Listen for messages from Colony
        this.colony.messageBus.events.on('message', (message: Message) => {
            this.handleColonyMessage(message)
                .catch(err => log.error('Failed to forward Colony message to Discord:', err));
        });

        log.info('Discord bridge initialized');
    }

    /**
     * Handle messages from Colony and forward to Discord.
     */
    private async handleColonyMessage(message: Message): Promise<void> {
        log.debug(`Handling Colony message: ${message.id} from ${message.sender.name} (${message.sender.type}) in room ${message.roomId}`);

        // Skip monologue messages (thinking, tool calls, etc.) for Discord
        if (message.metadata?.isMonologue) {
            log.debug(`Skipping monologue message: ${message.id}`);
            return;
        }

        // Skip human messages that originated from Discord (prevent echo loop)
        if (message.sender.type === 'human' && message.metadata?.fromDiscord) {
            log.debug(`Skipping Discord-originated message: ${message.id}`);
            return;
        }

        // Find Discord channel for this session
        const channelId = this.mapper.getChannelBySession(message.roomId);
        if (channelId) {
            // Send to mapped channel
            log.info(`Forwarding message ${message.id} to Discord channel ${channelId}`);
            const formatted = this.formatMessage(message);
            await this.bot.sendToDiscord(channelId, formatted);
            log.info(`Message ${message.id} forwarded to Discord successfully`);
            return;
        }

        log.warn(`No Discord channel mapping found for session ${message.roomId}`);

        // Fallback: send agent messages to legacy user session channels
        if (message.sender.type !== 'agent') {
            log.debug(`Message ${message.id} is not from agent, skipping legacy fallback`);
            return; // Only forward agent messages over legacy path
        }
        const sessions = this.bot.getUserSessionsForRoom(message.roomId);
        if (sessions.length > 0) {
            log.info(`Using legacy fallback: forwarding message ${message.id} to ${sessions.length} user session(s)`);
            const formatted = this.formatMessage(message);
            for (const session of sessions) {
                await this.bot.sendToDiscord(session.channelId, formatted);
            }
        } else {
            log.warn(`No legacy user sessions found for room ${message.roomId}, message ${message.id} not forwarded to Discord`);
        }
    }

    /**
     * Format Colony message for Discord.
     */
    private formatMessage(message: Message): string {
        const sender = message.sender.name;
        const content = message.content;
        const icon = message.sender.type === 'agent' ? '💬' : '👤';

        return `${icon} **${sender}**:\n${content}`;
    }
}
