"use strict";
// ── Colony: Discord Manager ──────────────────────────────
// Main entry point for Discord integration.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscordManager = void 0;
const fs = __importStar(require("fs"));
const yaml = __importStar(require("yaml"));
const Logger_js_1 = require("../utils/Logger.js");
const DiscordBot_js_1 = require("./DiscordBot.js");
const DiscordBridge_js_1 = require("./DiscordBridge.js");
const NotificationManager_js_1 = require("./NotificationManager.js");
const log = new Logger_js_1.Logger('DiscordManager');
class DiscordManager {
    bot;
    bridge;
    notifications;
    config;
    constructor(colony, configPath) {
        // Load configuration
        const path = configPath || 'config/discord.yaml';
        this.config = this.loadConfig(path);
        // Initialize components
        this.bot = new DiscordBot_js_1.DiscordBot(this.config, colony);
        this.bridge = new DiscordBridge_js_1.DiscordBridge(this.bot, colony);
        this.notifications = new NotificationManager_js_1.NotificationManager(this.bot, this.config);
        log.info('Discord manager initialized');
    }
    /**
     * Load Discord configuration.
     */
    loadConfig(path) {
        try {
            const content = fs.readFileSync(path, 'utf-8');
            const config = yaml.parse(content);
            // Substitute environment variables
            if (config.bot.token.startsWith('${') && config.bot.token.endsWith('}')) {
                const envVar = config.bot.token.slice(2, -1);
                config.bot.token = process.env[envVar] || '';
            }
            if (!config.bot.token) {
                throw new Error('Discord bot token not configured');
            }
            return config;
        }
        catch (error) {
            log.error('Failed to load Discord configuration:', error);
            throw error;
        }
    }
    /**
     * Start Discord integration.
     */
    async start() {
        log.info('Starting Discord integration...');
        await this.bot.start();
        log.info('Discord integration started');
    }
    /**
     * Stop Discord integration.
     */
    async stop() {
        log.info('Stopping Discord integration...');
        await this.bot.stop();
        log.info('Discord integration stopped');
    }
    /**
     * Get notification manager.
     */
    getNotificationManager() {
        return this.notifications;
    }
    /**
     * Get bridge.
     */
    getBridge() {
        return this.bridge;
    }
    /**
     * Get bot.
     */
    getBot() {
        return this.bot;
    }
}
exports.DiscordManager = DiscordManager;
//# sourceMappingURL=DiscordManager.js.map