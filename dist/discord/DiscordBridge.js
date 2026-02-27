"use strict";
// ── Colony: Discord Bridge ───────────────────────────────
// Bridges messages between Colony and Discord.
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscordBridge = void 0;
const Logger_js_1 = require("../utils/Logger.js");
const log = new Logger_js_1.Logger('DiscordBridge');
class DiscordBridge {
    bot;
    colony;
    sessionChannels = new Map(); // sessionId -> channelId
    constructor(bot, colony) {
        this.bot = bot;
        this.colony = colony;
        this.setupColonyListeners();
    }
    /**
     * Setup listeners for Colony events.
     */
    setupColonyListeners() {
        // Listen for messages from Colony
        this.colony.messageBus.events.on('message', (message) => {
            this.handleColonyMessage(message);
        });
        log.info('Discord bridge initialized');
    }
    /**
     * Handle messages from Colony and forward to Discord.
     */
    async handleColonyMessage(message) {
        // Only forward agent messages
        if (message.sender.type !== 'agent') {
            return;
        }
        // Skip monologue messages (thinking, tool calls, etc.) for Discord
        if (message.metadata?.isMonologue) {
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
    formatMessage(message) {
        const sender = message.sender.name;
        const content = message.content;
        // Format with Discord markdown
        return `💬 **${sender}**:\n${content}`;
    }
    /**
     * Map a session to a Discord channel.
     */
    mapSessionToChannel(sessionId, channelId) {
        this.sessionChannels.set(sessionId, channelId);
        log.info(`Mapped session ${sessionId} to Discord channel ${channelId}`);
    }
    /**
     * Unmap a session from Discord channel.
     */
    unmapSession(sessionId) {
        this.sessionChannels.delete(sessionId);
        log.info(`Unmapped session ${sessionId} from Discord`);
    }
}
exports.DiscordBridge = DiscordBridge;
//# sourceMappingURL=DiscordBridge.js.map