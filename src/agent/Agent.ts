// ── Colony: Agent Runtime ────────────────────────────────
// Core agent loop: receives routed messages, assembles context,
// invokes LLM via CLI (which handles tool execution natively).

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Logger } from '../utils/Logger.js';
import { EventBus } from '../utils/EventBus.js';
import { SkillManager } from './skills/SkillManager.js';
import { ModelRouter } from '../llm/ModelRouter.js';
import { ContextAssembler } from '../memory/ContextAssembler.js';
import { ShortTermMemory } from '../memory/ShortTermMemory.js';
import { ChatRoomManager } from '../conversation/ChatRoomManager.js';
import { SessionStore, getContextLimit } from '../session/SessionRecord.js';
import { TranscriptWriter } from '../session/TranscriptWriter.js';
import { logHealth, getHealthStatus } from '../session/ContextHealthBar.js';
import { SessionSealer, DEFAULT_SEAL_CONFIG } from '../session/SessionSealer.js';
import { DigestGenerator } from '../session/DigestGenerator.js';
import { SessionBootstrap } from '../session/SessionBootstrap.js';
import { MemoryClassifier } from '../memory/MemoryClassifier.js';
import { deleteSession } from '../llm/CLIInvoker.js';
import type {
    AgentConfig,
    AgentStatus,
    Message,
} from '../types.js';

const log = new Logger('Agent');

interface AgentEventMap {
    'status_change': { agentId: string; status: AgentStatus };
    'message_sent': Message;
}

export class Agent {
    readonly id: string;
    readonly name: string;
    readonly config: AgentConfig;
    readonly events = new EventBus<AgentEventMap>();

    private modelRouter: ModelRouter;
    private status: AgentStatus = 'idle';
    private messageQueue: Message[] = [];
    private processing = false;
    private lastProcessedTime = 0;

    // Session management
    private sessionStore: SessionStore;
    private transcriptWriter: TranscriptWriter;
    private sessionSealer: SessionSealer;
    private digestGenerator: DigestGenerator;
    private sessionBootstrap: SessionBootstrap;

    // Memory system
    private contextAssembler: ContextAssembler;
    private shortTermMemory: ShortTermMemory;
    private chatRoomManager: ChatRoomManager;
    private memoryClassifier = new MemoryClassifier();

    // Track active invocations per room
    private activeInvocations = new Map<string, AbortController>();

    constructor(
        config: AgentConfig,
        modelRouter: ModelRouter,
        contextAssembler: ContextAssembler,
        shortTermMemory: ShortTermMemory,
        chatRoomManager: ChatRoomManager,
        globalSkillManager: SkillManager
    ) {
        this.id = config.id;
        this.name = config.name;
        this.config = config;
        this.modelRouter = modelRouter;
        this.contextAssembler = contextAssembler;
        this.shortTermMemory = shortTermMemory;
        this.chatRoomManager = chatRoomManager;
        this.sessionStore = new SessionStore();
        this.transcriptWriter = new TranscriptWriter();
        this.sessionSealer = new SessionSealer({
            strategy: config.session?.strategy,
            thresholds: config.session?.thresholds ? {
                warn: config.session.thresholds.warn ?? DEFAULT_SEAL_CONFIG.thresholds.warn,
                seal: config.session.thresholds.seal ?? DEFAULT_SEAL_CONFIG.thresholds.seal,
            } : undefined,
        });
        this.digestGenerator = new DigestGenerator(this.transcriptWriter);
        this.sessionBootstrap = new SessionBootstrap();

        // Load and register this agent's specific skills
        const skillManager = new SkillManager();
        // Use all discovered metadata from the global manager to load local skills
        (skillManager as any).allMetadata = globalSkillManager.getAllMetadata();
        if (config.skills && config.skills.length > 0) {
            skillManager.loadSkills(config.skills);
        }

        this.contextAssembler.registerAgent(config, skillManager);
    }

    // ── Public API ───────────────────────────────────────

    getStatus(): AgentStatus {
        return this.status;
    }

    /**
     * Cancel any active invocation for the given room.
     */
    abortRoomInvocation(roomId: string): void {
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
    async receiveMessage(message: Message): Promise<void> {
        // Don't process own messages
        if (message.sender.id === this.id) return;

        const isMentioned = message.mentions.includes(this.id);
        log.info(`[${this.name}] Received routed message from ${message.sender.name}${isMentioned ? ' (@mentioned)' : ' (default)'}`);

        // Add message to short-term memory
        this.shortTermMemory.add(message.roomId, message);

        this.messageQueue.push(message);
        await this.processQueue();
    }

    /**
     * Get the session health status for a specific room.
     * Returns a default empty health object if there is no active session.
     */
    getSessionHealth(roomId: string) {
        const activeSession = this.sessionStore.getActive(this.id, roomId);
        if (!activeSession) {
            return {
                fillRatio: 0,
                tokensUsed: 0,
                contextLimit: getContextLimit(this.config.model.primary, this.config.session?.contextLimit),
                invocationCount: 0,
                label: '🟢 healthy',
                chainIndex: 0,
            };
        }
        return getHealthStatus(activeSession);
    }

    /**
     * Set the session ID for a specific room.
     */
    setRoomSession(roomId: string, sessionId: string): void {
        // Create or update the session record in SessionStore
        const existing = this.sessionStore.getActive(this.id, roomId);
        if (!existing) {
            this.sessionStore.create({
                id: sessionId,
                agentId: this.id,
                roomId,
                cli: this.config.model.primary,
            });
        }
    }

    // ── Internal Processing ──────────────────────────────

    private async processQueue(): Promise<void> {
        if (this.processing) return;
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

                const message = this.messageQueue.shift()!;
                try {
                    await this.handleMessage(message);
                } catch (error) {
                    log.error(`[${this.name}] Error handling message ${message.id}:`, error);
                } finally {
                    this.lastProcessedTime = Date.now();
                }
            }
        } finally {
            this.processing = false;
        }
    }

    /**
     * Maximum follow-up rounds when skills return data that needs
     * to be fed back to the LLM (e.g. get_messages → send_message).
     */
    private static readonly MAX_FOLLOW_UP_ROUNDS = 5;

    /**
     * Keep per-room session isolation while avoiding per-room auth isolation.
     * Room-scoped CLAUDE_CONFIG_DIR breaks auth if the directory has no login state.
     */
    private resolveClaudeConfigDir(sessionConfigDir: string): string {
        if (process.env.COLONY_CLAUDE_AUTH_CONFIG_DIR) {
            return process.env.COLONY_CLAUDE_AUTH_CONFIG_DIR;
        }

        const inheritedClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
        if (inheritedClaudeConfigDir) {
            const normalizePath = (value: string): string => (
                path.resolve(value).replace(/\\/g, '/').replace(/\/$/, '')
            );
            const normalizedSessionRoot = normalizePath(path.join(process.cwd(), '.data/sessions'));
            const normalizedSessionDir = normalizePath(sessionConfigDir);
            const normalizedInheritedDir = normalizePath(inheritedClaudeConfigDir);

            const isRoomIsolatedDir = normalizedInheritedDir.startsWith(`${normalizedSessionRoot}/`)
                || normalizedInheritedDir === normalizedSessionDir;

            if (!isRoomIsolatedDir) {
                return inheritedClaudeConfigDir;
            }

            log.warn(`[${this.name}] Ignoring room-scoped CLAUDE_CONFIG_DIR (${inheritedClaudeConfigDir}) to preserve shared Claude auth.`);
        }

        return path.join(os.homedir(), '.claude');
    }

    private async handleMessage(message: Message): Promise<void> {
        this.setStatus('thinking');

        // Retrieve the ChatRoom instance outside try-catch to allow error logging
        const chatRoom = this.chatRoomManager.getRoom(message.roomId);
        if (!chatRoom) {
            log.error(`[${this.name}] ChatRoom ${message.roomId} not found for message processing.`);
            this.setStatus('error');
            return;
        }

        try {
            const sessionName = `agent-${this.id}-room-${message.roomId}`;
            let round = 0;

            // Setup working directory
            const workingDir = chatRoom.workingDir || process.cwd();
            await this.ensureSkillsSymlinks(workingDir);

            // Setup environment isolation for CLI (BUG-CONCURRENCY-001)
            // Use room-specific config directory to avoid sharing session cache across rooms
            const sessionConfigDir = path.join(process.cwd(), '.data/sessions', message.roomId);
            if (!fs.existsSync(sessionConfigDir)) {
                fs.mkdirSync(sessionConfigDir, { recursive: true });
            }
            const claudeConfigDir = this.resolveClaudeConfigDir(sessionConfigDir);

            // Use ContextAssembler to build the initial prompt
            let currentPrompt = await this.contextAssembler.assemble({
                agentId: this.id,
                roomId: message.roomId,
                currentMessage: message,
                tokenBudget: 32000, // Increased budget for better context retention
                includeHistory: true,
                includeLongTerm: true, // ✅ Enable long-term memory (Mem0)
                chatRoom: chatRoom, // Pass the chatRoom instance
            });

            while (round < Agent.MAX_FOLLOW_UP_ROUNDS) {
                round++;

                const activeSession = this.sessionStore.getActive(this.id, message.roomId);

                // ── Phase 2: Check if session needs sealing ──
                let promptForThisRound = currentPrompt;
                if (activeSession) {
                    const action = this.sessionSealer.shouldTakeAction(activeSession);
                    if (action.type === 'seal') {
                        log.info(`[${this.name}] Sealing session ${activeSession.id} (${(action.fillRatio * 100).toFixed(1)}%)`);
                        const sealed = this.sessionStore.seal(this.id, message.roomId, activeSession.id);
                        if (sealed) {
                            activeSession.status = 'sealed'; // Invalidate active state so a new session is started

                            // Delete CLI session cache to force creation of a new session
                            deleteSession(sessionName);

                            // Generate digest asynchronously (don't block the current invoke)
                            this.digestGenerator.generate(sealed).then(digest => {
                                this.sessionStore.setDigest(this.id, message.roomId, sealed.id, digest);
                                log.info(`[${this.name}] Digest stored for session ${sealed.id}`);
                            }).catch(err => {
                                log.error(`[${this.name}] Failed to generate digest:`, err);
                            });

                            // Inject bootstrap preamble: new session starts fresh (no --resume)
                            // Create a placeholder new record — it will get real ID after first invoke
                            promptForThisRound = this.sessionBootstrap.injectInto(currentPrompt, {
                                ...activeSession,
                                chainIndex: activeSession.chainIndex + 1,
                                id: 'pending',
                                status: 'active',
                                tokenUsage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, cumulative: 0, currentContextLength: 0 },
                                invocationCount: 0,
                                createdAt: new Date().toISOString(),
                                previousSessionId: activeSession.id,
                            }, sealed);
                        }
                    } else if (action.type === 'warn') {
                        log.warn(`[${this.name}] Context at ${(action.fillRatio * 100).toFixed(1)}% — approaching seal threshold`);
                    }
                }

                const existingSession = activeSession?.status === 'active' ? activeSession.id : undefined;

                log.info(`[${this.name}] Invoking LLM (round ${round}) for message from ${message.sender.name}...`);

                // Send a pending placeholder message — will be updated in-place
                const pendingMsg = chatRoom.sendAgentMessage(this.id, `正在思考...`, [], {
                    isMonologue: true,
                    isPending: true,
                });
                const pendingId = pendingMsg.id;

                const controller = new AbortController();
                this.activeInvocations.set(message.roomId, controller);

                try {
                    const result = await this.modelRouter.invoke(
                        this.config.model.primary,
                        promptForThisRound,
                        {
                            sessionName,
                            sessionId: existingSession ?? undefined,
                            cwd: workingDir, // Set working directory for CLI
                            signal: controller.signal,
                            security: { skipPermissions: true, bypassSandbox: true }, // Allow CLI to execute bash skills (send-message, etc.)
                            attachments: message.metadata?.attachments,
                            env: {
                                COLONY_AGENT_ID: this.id,
                                COLONY_ROOM_ID: message.roomId,
                                COLONY_API: process.env.COLONY_API ?? 'http://localhost:3001',
                                ...(process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN ? { CLAUDE_CODE_SESSION_ACCESS_TOKEN: process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN } : {}),
                                // Room-isolated session cache for CLI state.
                                XDG_CONFIG_HOME: sessionConfigDir,
                                // Keep Claude auth shared (global or explicit override) to avoid room-scoped login loss.
                                CLAUDE_CONFIG_DIR: claudeConfigDir,
                            },
                        },
                        this.config.model.fallback,
                        {
                            onStatusUpdate: (statusMsg: string) => {
                                // Update the pending message with status (e.g. "429, switching...")
                                chatRoom.updateMessage(pendingId, statusMsg, { isPending: true, isMonologue: true });
                            },
                        }
                    );

                    // ── Log full raw LLM response for debugging ──
                    log.info(`[${this.name}] ── LLM Response round ${round} (${result.text.length} chars) ──`);
                    log.info(`[${this.name}] ${result.text}`);
                    log.info(`[${this.name}] ── End Response ──`);

                    // Save session ID to SessionStore
                    if (result.sessionId) {
                        const actualCli = result.actualModel ?? this.config.model.primary;
                        // Look up by exact session ID first, then fall back to any active
                        let existing = this.sessionStore.getBySessionId(this.id, message.roomId, result.sessionId);
                        if (!existing) {
                            // New session ID (either first invocation or fallback model created one)
                            existing = this.sessionStore.create({
                                id: result.sessionId,
                                agentId: this.id,
                                roomId: message.roomId,
                                cli: actualCli,
                            });
                        }

                        // Record transcript entry
                        this.transcriptWriter.append(this.id, message.roomId, result.sessionId, {
                            invocationIndex: (existing?.invocationCount ?? 0) + 1,
                            timestamp: new Date().toISOString(),
                            prompt: currentPrompt.substring(0, 2000),
                            response: result.text,
                            toolCalls: result.toolCalls,
                            tokenUsage: result.tokenUsage,
                        });

                        // Update token usage for this specific session and log context health
                        if (result.tokenUsage) {
                            const updated = this.sessionStore.updateUsage(this.id, message.roomId, result.tokenUsage, result.sessionId);
                            if (updated) {
                                logHealth(this.name, updated);
                            }
                        }
                    }

                    // Update pending message with actual response content
                    if (result.text || (result.toolCalls && result.toolCalls.length > 0)) {
                        chatRoom.updateMessage(pendingId, result.text || '(Silent Execution)', {
                            isMonologue: true,
                            isPending: false,
                            toolCalls: result.toolCalls || [],
                        });
                    } else {
                        // No content — just clear pending state
                        chatRoom.updateMessage(pendingId, '(无输出)', { isMonologue: true, isPending: false });
                    }

                    // Check if CLI executed any tools successfully
                    const toolCalls = result.toolCalls || [];
                    const hasSendMessage = toolCalls.some(t => {
                        const name = t.name?.toLowerCase() ?? '';
                        const input = t.input ?? {};

                        // If we have result info, and it's an error, this wasn't a successful send
                        if (t.isError === true) return false;

                        // 1. Direct name match
                        if (name === 'send-message' || name === 'send_message') return true;
                        // 2. CLI 'Skill' wrapper — check known input field variants
                        if (name === 'skill' || name === 'activate_skill') {
                            const skillName = (input.name ?? input.skill ?? input.skill_name ?? '') as string;
                            if (skillName.includes('send-message') || skillName.includes('send_message')) return true;
                        }
                        // 3. Bash/shell tool executing handler.sh
                        if (name === 'bash' || name === 'shell' || name === 'run_shell_command') {
                            const cmd = (input.command ?? input.cmd ?? input.script ?? '') as string;
                            if (cmd.includes('send-message') || cmd.includes('handler.sh')) return true;
                        }
                        // 4. Fallback: deep search the entire input JSON for send-message
                        try {
                            const inputStr = JSON.stringify(input).toLowerCase();
                            if (inputStr.includes('send-message') || inputStr.includes('send_message')) return true;
                        } catch { /* ignore */ }
                        return false;
                    });

                    if (!hasSendMessage && toolCalls.length > 0) {
                        log.debug(`[${this.name}] Tool call details: ${JSON.stringify(toolCalls.map(t => ({ name: t.name, input: t.input })))}`);
                    }

                    if (hasSendMessage) {
                        // Agent has spoken - done with this message
                        // Note: Agent now uses 'remember' skill to actively store important memories
                        break;
                    }

                    if (toolCalls.length === 0) {
                        // No tools called AND no message sent?
                        // This usually means the LLM just gave a text response without using send-message.
                        // We'll consider this done to avoid infinite loops, though ideally they should speak.
                        break;
                    }

                    // Tools were called but no send-message. 
                    // Continue to next round to let LLM see tool outputs and potentially speak.
                    log.info(`[${this.name}] Tools called (${toolCalls.map(t => t.name).join(', ')}), continuing to round ${round + 1}...`);

                    const failedTools = toolCalls.filter(t => t.isError).map(t => t.name);

                    // --- Re-assemble prompt with identity and context for continuation rounds (BUG-CONTEXT-001) ---
                    // This ensures the agent maintains its identity and room awareness even in deep tool-call loops.
                    const identity = this.contextAssembler.buildIdentitySection(this.config);
                    const workflow = await this.contextAssembler.buildWorkflowStageSection(message.roomId, this.id);
                    const participants = this.contextAssembler.buildParticipantsSection(chatRoom);

                    let systemHint = '';
                    if (failedTools.length > 0) {
                        systemHint = `[系统提示] 你在上一轮执行的以下工具失败了：${failedTools.join(', ')}。请根据工具执行结果分析原因并尝试重试。注意：如果你之前调用了 send-message 但失败了，用户并没有收到你的消息，你必须再次调用成功的 send-message 才能完成任务。`;
                    } else {
                        // Tell the agent why it's being re-invoked
                        systemHint = `[系统提示] 你在上一轮执行了以下工具：${toolCalls.map(t => t.name).join(', ')}，但没有调用 send-message 发送回复。用户看不到你的内心独白，你必须调用 send-message 工具将你的分析结果或回复发送出去。请现在就调用 send-message。`;
                    }

                    currentPrompt = [identity, workflow, participants, systemHint].filter(Boolean).join('\n\n');
                    continue;
                } catch (innerErr) {
                    const innerErrMsg = (innerErr as Error).message ?? '';

                    // ONLY check the signal itself — don't match error text to avoid
                    // false positives from CLI errors that contain the word 'aborted'.
                    if (controller.signal.aborted) {
                        // Clear stale session so next message starts fresh
                        // Session aborted — don't delete, let it resume next time
                        chatRoom.updateMessage(pendingId, `⏹️ 已停止执行`, { isMonologue: true, isPending: false });
                        this.setStatus('idle');
                        return;
                    }

                    if (innerErrMsg.includes('exhausted') || innerErrMsg.includes('rate') || innerErrMsg.includes('429') || innerErrMsg.includes('capacity')) {
                        chatRoom.updateMessage(pendingId, `⚠️ 模型调用受限: ${innerErrMsg}`, { isMonologue: true, isPending: false, error: innerErrMsg });
                        this.setStatus('rate_limited');
                        return;
                    }

                    // Other errors — update pending and re-throw to outer catch
                    chatRoom.updateMessage(pendingId, `❌ 调用出错: ${innerErrMsg}`, { isMonologue: true, isPending: false, error: innerErrMsg });
                    throw innerErr;
                } finally {
                    this.activeInvocations.delete(message.roomId);
                }
            }
        } catch (err) {
            log.error(`[${this.name}] Error handling message:`, err);
            this.setStatus('error');

            const errMsg = (err as Error).message ?? '';
            chatRoom?.sendAgentMessage(this.id, `❌ 调用出错: ${errMsg}`, [], {
                isMonologue: true,
                error: errMsg,
            } as any);
            return;
        }

        this.setStatus('idle');
    }

    /**
     * Store important context to long-term memory.
     */
    private async storeToLongTermMemory(message: Message, response: string): Promise<void> {
        const longTermMemory = (this.contextAssembler as any).longTermMemory;
        if (!longTermMemory) {
            return; // Long-term memory not enabled
        }

        // Run classification and storage in background
        Promise.resolve().then(async () => {
            try {
                // Classify the memory
                const classification = this.memoryClassifier.classify(message, response);

                // Combine user message and agent response for context
                const conversationContext = `用户 (${message.sender.name}): ${message.content}\n\n${this.name}: ${response}`;

                // Get current workflow stage if in workflow
                const workflowStage = await this.getCurrentWorkflowStage(message.roomId);

                await longTermMemory.retain({
                    content: conversationContext,
                    context: message,
                    metadata: {
                        type: 'conversation' as const,
                        subtype: classification.subtype,
                        importance: classification.importance,
                        agentId: this.id,
                        roomId: message.roomId,
                        tags: [this.name, message.sender.name],
                        participants: [message.sender.id, this.id],
                        workflowStage,
                    },
                    timestamp: new Date(),
                });

                log.debug(`[${this.name}] Stored conversation to long-term memory (subtype: ${classification.subtype}, importance: ${classification.importance})`);
            } catch (error) {
                log.error(`[${this.name}] Failed to store to long-term memory:`, error);
            }
        });
    }

    /**
     * Helper to get current workflow stage for a room.
     */
    private async getCurrentWorkflowStage(roomId: string): Promise<number | undefined> {
        try {
            const workflowDir = path.join(process.cwd(), '.data/workflows');
            const workflowFile = path.join(workflowDir, `${roomId}.json`);
            if (!fs.existsSync(workflowFile)) return undefined;

            const data = fs.readFileSync(workflowFile, 'utf8');
            const workflow = JSON.parse(data);
            return workflow.current_stage;
        } catch (error) {
            log.warn(`Failed to read workflow stage for room ${roomId}:`, error);
            return undefined;
        }
    }

    /**
     * Ensure skills symlinks exist in the working directory.
     * Creates .claude/skills, .gemini/skills, and .codex/skills pointing to Colony's skills directory.
     */
    private async ensureSkillsSymlinks(workingDir: string): Promise<void> {
        const colonySkillsDir = path.join(process.cwd(), 'skills');

        // Check if Colony skills directory exists
        if (!fs.existsSync(colonySkillsDir)) {
            throw new Error(`Colony skills directory not found: ${colonySkillsDir}. Cannot provide skills to agents.`);
        }

        // Ensure working directory exists
        if (!fs.existsSync(workingDir)) {
            throw new Error(`Working directory does not exist: ${workingDir}. Cannot setup agent workspace.`);
        }

        // Create symlinks for all supported CLIs (Claude, Gemini, Codex)
        for (const cliDir of ['.claude', '.gemini', '.codex']) {
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
                        const absoluteTarget = path.resolve(path.dirname(skillsLink), linkTarget);

                        // Compare real paths to handle normalization differences
                        if (fs.realpathSync(absoluteTarget) === fs.realpathSync(colonySkillsDir)) {
                            // Symlink already correct
                            continue;
                        }
                        // Remove incorrect symlink
                        fs.unlinkSync(skillsLink);
                    } else {
                        log.warn(`${skillsLink} exists but is not a symlink, skipping`);
                        continue;
                    }
                }

                // Create symlink
                fs.symlinkSync(colonySkillsDir, skillsLink, 'dir');
                log.info(`Created skills symlink: ${skillsLink} -> ${colonySkillsDir}`);
            } catch (error) {
                log.error(`Failed to create skills symlink for ${cliDir}:`, error);
                throw new Error(`Cannot create skills symlink for ${cliDir}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    private setStatus(status: AgentStatus): void {
        if (this.status === status) return;
        this.status = status;
        this.events.emit('status_change', { agentId: this.id, status });
    }
}
