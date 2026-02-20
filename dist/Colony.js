"use strict";
// ── Colony: Main Entry Point ─────────────────────────────
// Bootstraps the multi-agent system: loads configs, creates agents,
// sets up message routing, and exposes the top-level API.
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
exports.Colony = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const yaml = __importStar(require("yaml"));
const Logger_js_1 = require("./utils/Logger.js");
const RateLimitManager_js_1 = require("./llm/RateLimitManager.js");
const ModelRouter_js_1 = require("./llm/ModelRouter.js");
const AgentRegistry_js_1 = require("./agent/AgentRegistry.js");
const MessageBus_js_1 = require("./conversation/MessageBus.js");
const ChatRoomManager_js_1 = require("./conversation/ChatRoomManager.js");
const SessionManager_js_1 = require("./conversation/SessionManager.js");
const index_js_1 = require("./memory/index.js");
const Mem0LongTermMemory_js_1 = require("./memory/Mem0LongTermMemory.js");
const index_js_2 = require("./discord/index.js");
const log = new Logger_js_1.Logger('Colony');
class Colony {
    messageBus;
    agentRegistry;
    chatRoomManager;
    rateLimitManager;
    sessionManager;
    shortTermMemory;
    longTermMemory;
    contextAssembler;
    contextScheduler;
    discordManager;
    modelRouter;
    constructor(options = {}) {
        const agentConfigDir = options.agentConfigDir ?? path.join(process.cwd(), 'config', 'agents');
        const skillsDir = options.skillsDir ?? path.join(process.cwd(), 'skills');
        const dataDir = options.dataDir ?? path.join(process.cwd(), '.data', 'sessions');
        const mem0ConfigPath = options.mem0ConfigPath ?? path.join(process.cwd(), 'config', 'mem0.yaml');
        const discordConfigPath = options.discordConfigPath ?? path.join(process.cwd(), 'config', 'discord.yaml');
        // Initialize memory system
        this.shortTermMemory = new index_js_1.ShortTermMemory({
            windowSize: 50,
            maxTokens: 4000,
            compressionThreshold: 0.8,
        });
        // Initialize long-term memory if enabled (async initialization deferred)
        if (options.enableLongTermMemory !== false && fs.existsSync(mem0ConfigPath)) {
            try {
                log.info('Loading Mem0 configuration...');
                // Load Mem0 configuration from YAML
                const configContent = fs.readFileSync(mem0ConfigPath, 'utf-8');
                const mem0Config = yaml.parse(configContent);
                this.longTermMemory = new Mem0LongTermMemory_js_1.Mem0LongTermMemory(mem0Config);
                log.info('Mem0 long-term memory created (will initialize on first use)');
            }
            catch (error) {
                log.error('Failed to load Mem0 configuration:', error);
                log.warn('Continuing without long-term memory');
            }
        }
        this.contextAssembler = new index_js_1.ContextAssembler(this.shortTermMemory, this.longTermMemory);
        this.contextScheduler = new index_js_1.ContextScheduler(this.shortTermMemory);
        // Initialize components
        this.rateLimitManager = new RateLimitManager_js_1.RateLimitManager();
        this.modelRouter = new ModelRouter_js_1.ModelRouter(this.rateLimitManager);
        this.agentRegistry = new AgentRegistry_js_1.AgentRegistry(this.modelRouter, this.contextAssembler, this.shortTermMemory, skillsDir);
        this.messageBus = new MessageBus_js_1.MessageBus();
        this.sessionManager = new SessionManager_js_1.SessionManager(dataDir);
        this.chatRoomManager = new ChatRoomManager_js_1.ChatRoomManager(this.messageBus, this.agentRegistry, this.sessionManager);
        // Load agent configs
        const agents = this.agentRegistry.loadFromDirectory(agentConfigDir);
        log.info(`Colony initialized with ${agents.length} agents`);
        // Initialize Discord integration if enabled
        if (options.enableDiscord !== false && fs.existsSync(discordConfigPath)) {
            try {
                log.info('Initializing Discord integration...');
                this.discordManager = new index_js_2.DiscordManager(this, discordConfigPath);
                log.info('Discord integration initialized');
            }
            catch (error) {
                log.error('Failed to initialize Discord:', error);
                log.warn('Continuing without Discord integration');
            }
        }
        // Forward rate limit events
        this.rateLimitManager.events.on('quota_exhausted', ({ model }) => {
            log.warn(`Quota exhausted for model: ${model}`);
            this.messageBus.events.emit('colony_event', {
                type: 'rate_limit',
                model,
                remaining: 0,
                total: 0,
            });
        });
    }
    /**
     * Initialize Colony (restore saved sessions and start Discord).
     */
    async initialize() {
        await this.chatRoomManager.restoreAllSessions();
        // Start Discord integration if enabled
        if (this.discordManager) {
            await this.discordManager.start();
        }
    }
    /**
     * Create a new chat session with agents.
     */
    createSession(name, agentIds) {
        const room = this.chatRoomManager.createRoom(name, agentIds);
        return room.id;
    }
    /**
     * Send a message from a human into a room.
     */
    sendMessage(roomId, senderId, content, mentions) {
        const room = this.chatRoomManager.getRoom(roomId);
        if (!room)
            throw new Error(`Room not found: ${roomId}`);
        room.sendHumanMessage(senderId, content, mentions);
    }
    /**
     * Add a human participant to a room.
     */
    joinSession(roomId, participant) {
        this.chatRoomManager.joinRoom(roomId, participant);
    }
    /**
     * Get status summary.
     */
    getStatus() {
        return {
            agents: this.agentRegistry.getStatusSummary(),
            rooms: this.chatRoomManager.listRooms(),
            rateLimits: this.rateLimitManager.getAllStatus(),
        };
    }
}
exports.Colony = Colony;
exports.default = Colony;
//# sourceMappingURL=Colony.js.map