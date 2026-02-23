"use strict";
// ── Colony: Agent Runtime ────────────────────────────────
// Core agent loop: receives routed messages, assembles context,
// invokes LLM via CLI (which handles tool execution natively).
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
exports.Agent = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const Logger_js_1 = require("../utils/Logger.js");
const EventBus_js_1 = require("../utils/EventBus.js");
const SkillManager_js_1 = require("./skills/SkillManager.js");
const log = new Logger_js_1.Logger('Agent');
class Agent {
    id;
    name;
    config;
    events = new EventBus_js_1.EventBus();
    modelRouter;
    status = 'idle';
    messageQueue = [];
    processing = false;
    lastProcessedTime = 0;
    // Per-room session IDs for conversation isolation
    roomSessions = new Map();
    // Memory system
    contextAssembler;
    shortTermMemory;
    chatRoomManager;
    // Track active invocations per room
    activeInvocations = new Map();
    constructor(config, modelRouter, contextAssembler, shortTermMemory, chatRoomManager) {
        this.id = config.id;
        this.name = config.name;
        this.config = config;
        this.modelRouter = modelRouter;
        this.contextAssembler = contextAssembler;
        this.shortTermMemory = shortTermMemory;
        this.chatRoomManager = chatRoomManager;
        // Register this agent with the context assembler
        // Note: SkillManager is still used for context assembly (skill descriptions)
        // but actual skill execution is handled by CLI
        const skillManager = new SkillManager_js_1.SkillManager();
        this.contextAssembler.registerAgent(config, skillManager);
    }
    // ── Public API ───────────────────────────────────────
    getStatus() {
        return this.status;
    }
    /**
     * Cancel any active invocation for the given room.
     */
    abortRoomInvocation(roomId) {
        const controller = this.activeInvocations.get(roomId);
        if (controller) {
            log.info(`[${this.name}] Aborting invocation for room ${roomId}`);
            controller.abort();
            this.activeInvocations.delete(roomId);
            this.setStatus('idle');
        }
    }
    /**
     * Receive a message that has been routed to this agent.
     * The ChatRoom has already decided this agent should handle this message
     * (via @mention or default agent fallback).
     */
    async receiveMessage(message) {
        // Don't process own messages
        if (message.sender.id === this.id)
            return;
        const isMentioned = message.mentions.includes(this.id);
        log.info(`[${this.name}] Received routed message from ${message.sender.name}${isMentioned ? ' (@mentioned)' : ' (default)'}`);
        // Add message to short-term memory
        this.shortTermMemory.add(message.roomId, message);
        this.messageQueue.push(message);
        await this.processQueue();
    }
    /**
     * Set the session ID for a specific room.
     */
    setRoomSession(roomId, sessionId) {
        this.roomSessions.set(roomId, sessionId);
    }
    // ── Internal Processing ──────────────────────────────
    async processQueue() {
        if (this.processing)
            return;
        this.processing = true;
        try {
            while (this.messageQueue.length > 0) {
                // Ensure at least 1s cooldown since last message finished
                const now = Date.now();
                const elapsed = now - this.lastProcessedTime;
                if (elapsed < 1000) {
                    const delay = 1000 - elapsed;
                    log.info(`[${this.name}] Cooling down for ${delay}ms before processing next message...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
                const message = this.messageQueue.shift();
                try {
                    await this.handleMessage(message);
                }
                catch (error) {
                    log.error(`[${this.name}] Error handling message ${message.id}:`, error);
                }
                finally {
                    this.lastProcessedTime = Date.now();
                }
            }
        }
        finally {
            this.processing = false;
        }
    }
    /**
     * Maximum follow-up rounds when skills return data that needs
     * to be fed back to the LLM (e.g. get_messages → send_message).
     */
    static MAX_FOLLOW_UP_ROUNDS = 3;
    async handleMessage(message) {
        this.setStatus('thinking');
        try {
            const sessionName = `agent-${this.id}-room-${message.roomId}`;
            let round = 0;
            // Retrieve the ChatRoom instance
            const chatRoom = this.chatRoomManager.getRoom(message.roomId);
            if (!chatRoom) {
                log.error(`[${this.name}] ChatRoom ${message.roomId} not found for message processing.`);
                this.setStatus('error');
                return;
            }
            // Setup working directory and skills symlinks if needed
            const workingDir = chatRoom.workingDir;
            if (workingDir) {
                await this.ensureSkillsSymlinks(workingDir);
            }
            // Use ContextAssembler to build the initial prompt
            let currentPrompt = await this.contextAssembler.assemble({
                agentId: this.id,
                roomId: message.roomId,
                currentMessage: message,
                tokenBudget: 8000, // Adjust based on model context window
                includeHistory: true,
                includeLongTerm: true, // ✅ Enable long-term memory (Mem0)
                chatRoom: chatRoom, // Pass the chatRoom instance
            });
            while (round < Agent.MAX_FOLLOW_UP_ROUNDS) {
                round++;
                const existingSession = this.roomSessions.get(message.roomId);
                log.info(`[${this.name}] Invoking LLM (round ${round}) for message from ${message.sender.name}...`);
                const controller = new AbortController();
                this.activeInvocations.set(message.roomId, controller);
                try {
                    const result = await this.modelRouter.invoke(this.config.model.primary, currentPrompt, {
                        sessionName,
                        sessionId: existingSession ?? undefined,
                        cwd: workingDir, // Set working directory for CLI
                        signal: controller.signal,
                        env: {
                            COLONY_AGENT_ID: this.id,
                            COLONY_ROOM_ID: message.roomId,
                            COLONY_API: process.env.COLONY_API ?? 'http://localhost:3001',
                        },
                    }, this.config.model.fallback);
                    // ── Log full raw LLM response for debugging ──
                    log.info(`[${this.name}] ── LLM Response round ${round} (${result.text.length} chars) ──`);
                    log.info(`[${this.name}] ${result.text}`);
                    log.info(`[${this.name}] ── End Response ──`);
                    // Save session ID for this room
                    if (result.sessionId) {
                        this.roomSessions.set(message.roomId, result.sessionId);
                    }
                    // Check if CLI executed any tools
                    const toolCalls = result.toolCalls || [];
                    const hasSendMessage = toolCalls.some(t => t.name === 'send-message' ||
                        t.name === 'send_message');
                    if (hasSendMessage || toolCalls.length === 0) {
                        // Agent has spoken or no tools were called - done
                        await this.storeToLongTermMemory(message, result.text);
                        break;
                    }
                    // Tools were called but no send-message
                    // This shouldn't happen in normal flow, but handle it gracefully
                    log.warn(`[${this.name}] Tools called but no send-message: ${toolCalls.map(t => t.name).join(', ')}`);
                    break;
                }
                finally {
                    this.activeInvocations.delete(message.roomId);
                }
            }
        }
        catch (err) {
            log.error(`[${this.name}] Error handling message:`, err);
            this.setStatus('error');
            const errMsg = err.message ?? '';
            if (errMsg.toLowerCase().includes('aborted')) {
                log.info(`[${this.name}] Invocation was aborted for room ${message.roomId}`);
                this.setStatus('idle');
                return;
            }
            if (errMsg.includes('exhausted') || errMsg.includes('rate')) {
                log.warn(`[${this.name}] Agent hit rate limit on model: ${this.config.model.primary}`);
                this.setStatus('rate_limited');
            }
            return;
        }
        this.setStatus('idle');
    }
    /**
     * Store important context to long-term memory.
     */
    async storeToLongTermMemory(message, response) {
        const longTermMemory = this.contextAssembler.longTermMemory;
        if (!longTermMemory) {
            return; // Long-term memory not enabled
        }
        try {
            // Combine user message and agent response for context
            const conversationContext = `用户 (${message.sender.name}): ${message.content}\n\n${this.name}: ${response}`;
            await longTermMemory.retain({
                content: conversationContext,
                context: message,
                metadata: {
                    type: 'conversation',
                    agentId: this.id,
                    roomId: message.roomId,
                    tags: [this.name, message.sender.name],
                },
                timestamp: new Date(),
            });
            log.debug(`[${this.name}] Stored conversation to long-term memory`);
        }
        catch (error) {
            log.error(`[${this.name}] Failed to store to long-term memory:`, error);
        }
    }
    /**
     * Ensure skills symlinks exist in the working directory.
     * Creates .claude/skills and .gemini/skills pointing to Colony's skills directory.
     */
    async ensureSkillsSymlinks(workingDir) {
        const colonySkillsDir = path.join(process.cwd(), 'skills');
        // Check if Colony skills directory exists
        if (!fs.existsSync(colonySkillsDir)) {
            log.warn(`Colony skills directory not found: ${colonySkillsDir}`);
            return;
        }
        // Ensure working directory exists
        if (!fs.existsSync(workingDir)) {
            log.warn(`Working directory does not exist: ${workingDir}`);
            return;
        }
        // Create symlinks for both Claude and Gemini
        for (const cliDir of ['.claude', '.gemini']) {
            const targetDir = path.join(workingDir, cliDir);
            const skillsLink = path.join(targetDir, 'skills');
            try {
                // Create CLI directory if it doesn't exist
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }
                // Check if symlink already exists and is valid
                if (fs.existsSync(skillsLink)) {
                    const stats = fs.lstatSync(skillsLink);
                    if (stats.isSymbolicLink()) {
                        const linkTarget = fs.readlinkSync(skillsLink);
                        if (path.resolve(workingDir, linkTarget) === colonySkillsDir) {
                            // Symlink already correct
                            continue;
                        }
                        // Remove incorrect symlink
                        fs.unlinkSync(skillsLink);
                    }
                    else {
                        log.warn(`${skillsLink} exists but is not a symlink, skipping`);
                        continue;
                    }
                }
                // Create symlink
                fs.symlinkSync(colonySkillsDir, skillsLink, 'dir');
                log.info(`Created skills symlink: ${skillsLink} -> ${colonySkillsDir}`);
            }
            catch (error) {
                log.error(`Failed to create skills symlink for ${cliDir}:`, error);
            }
        }
    }
    setStatus(status) {
        if (this.status === status)
            return;
        this.status = status;
        this.events.emit('status_change', { agentId: this.id, status });
    }
}
exports.Agent = Agent;
