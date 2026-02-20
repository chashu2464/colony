// ── Colony: Discord Bridge ───────────────────────────────
// Bridges messages between Colony and Discord.

import { Logger } from '../utils/Logger.js';
import type { DiscordBot } from './DiscordBot.js';
import type { Colony } from '../Colony.js';
import type { Message } from '../types.js';

const log = new Logger('DiscordBridge');

export class DiscordBridge {
    private bot: DiscordBot;
    private colony: Colony;
    private sessionChannels = new Map<string, string>(); // sessionId -> channelId

    constructor(bot: DiscordBot, colony: Colony) {
        this.bot = bot;
        this.colony = colony;

        this.setupColonyListeners();
    }

    /**
     * Setup listeners for Colony events.
     */
    private setupColonyListeners(): void {
        // Listen for messages from Colony
        this.colony.messageBus.events.on('message', (message: Message) => {
            this.handleColonyMessage(message);
        });

        log.info('Discord bridge initialized');
    }

    /**
     * Handle messages from Colony and forward to Discord.
     */
    private async handleColonyMessage(message: Message): Promise<void> {
        // Only forward agent messages
        if (message.sender.type !== 'agent') {
            return;
        }

        // Find Discord channel for this session
        const channelId = this.sessionChannels.get(message.roomId);
        if (channelId) {
            // Send to mapped channel
            const formatted = this.formatMessage(message);
            await this.bot.sendToDiscord(channelId, formatted);
            return;
        }

        // Otherwise, send to all users in this room
        const sessions = this.bot.getUserSessionsForRoom(message.roomId);
        if (sessions.length > 0) {
            const formatted = this.formatMessage(message);
            for (const session of sessions) {
                await this.bot.sendToDiscord(session.channelId, formatted);
            }
        }
    }

    /**
     * Format Colony message for Discord.
     */
    private formatMessage(message: Message): string {
        const sender = message.sender.name;
        const content = message.content;

        // Format with Discord markdown
        return `💬 **${sender}**:\n${content}`;
    }

    /**
     * Map a session to a Discord channel.
     */
    mapSessionToChannel(sessionId: string, channelId: string): void {
        this.sessionChannels.set(sessionId, channelId);
        log.info(`Mapped session ${sessionId} to Discord channel ${channelId}`);
    }

    /**
     * Unmap a session from Discord channel.
     */
    unmapSession(sessionId: string): void {
        this.sessionChannels.delete(sessionId);
        log.info(`Unmapped session ${sessionId} from Discord`);
    }
}
