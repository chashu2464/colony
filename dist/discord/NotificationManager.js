"use strict";
// ── Colony: Notification Manager ─────────────────────────
// Manages notifications to Discord.
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationManager = void 0;
const Logger_js_1 = require("../utils/Logger.js");
const log = new Logger_js_1.Logger('NotificationManager');
class NotificationManager {
    bot;
    config;
    constructor(bot, config) {
        this.bot = bot;
        this.config = config;
    }
    /**
     * Send a notification to Discord.
     */
    async notify(event) {
        if (!this.config.notifications?.enabled) {
            return;
        }
        // Check if this event type is enabled
        if (!this.config.notifications.events.includes(event.type)) {
            return;
        }
        // Get notification channel
        const channelId = this.config.channels?.notifications;
        if (!channelId) {
            log.warn('No notification channel configured');
            return;
        }
        // Format notification
        const formatted = this.formatNotification(event);
        // Send to Discord
        try {
            await this.bot.sendToDiscord(channelId, formatted);
            log.info(`Sent notification: ${event.type} for session ${event.sessionId}`);
        }
        catch (error) {
            log.error('Failed to send notification:', error);
        }
    }
    /**
     * Format notification for Discord.
     */
    formatNotification(event) {
        const emoji = this.getEmojiForEvent(event.type);
        const timestamp = event.timestamp.toLocaleString();
        let message = `${emoji} **${this.getEventTitle(event.type)}**\n`;
        message += `Session: **${event.sessionName}** (\`${event.sessionId}\`)\n\n`;
        message += `${event.message}\n\n`;
        if (event.details) {
            message += `**Details:**\n`;
            for (const [key, value] of Object.entries(event.details)) {
                message += `• ${key}: ${value}\n`;
            }
            message += `\n`;
        }
        message += `_${timestamp}_`;
        return message;
    }
    /**
     * Get emoji for event type.
     */
    getEmojiForEvent(type) {
        switch (type) {
            case 'milestone_completed':
                return '🎉';
            case 'task_finished':
                return '✅';
            case 'error_occurred':
                return '❌';
            case 'agent_response':
                return '💬';
            default:
                return '📢';
        }
    }
    /**
     * Get title for event type.
     */
    getEventTitle(type) {
        switch (type) {
            case 'milestone_completed':
                return 'Milestone Completed';
            case 'task_finished':
                return 'Task Finished';
            case 'error_occurred':
                return 'Error Occurred';
            case 'agent_response':
                return 'Agent Response';
            default:
                return 'Notification';
        }
    }
}
exports.NotificationManager = NotificationManager;
//# sourceMappingURL=NotificationManager.js.map