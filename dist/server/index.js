"use strict";
// ── Colony: HTTP + WebSocket Server ──────────────────────
// REST API for session/agent management + WebSocket for real-time events.
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createColonyServer = createColonyServer;
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const fs = __importStar(require("fs"));
const ws_1 = require("ws");
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const Logger_js_1 = require("../utils/Logger.js");
const SessionRecord_js_1 = require("../session/SessionRecord.js");
const TranscriptWriter_js_1 = require("../session/TranscriptWriter.js");
const workflow_js_1 = require("./routes/workflow.js");
const log = new Logger_js_1.Logger('Server');
function createColonyServer(options) {
    const { colony, port = 3001 } = options;
    const app = (0, express_1.default)();
    const server = (0, http_1.createServer)(app);
    const wss = new ws_1.WebSocketServer({ server });
    app.use((0, cors_1.default)());
    app.use(express_1.default.json({ limit: '10mb' }));
    // ── Workflow Events ───────────────────────────────
    app.use('/api/workflow', (0, workflow_js_1.createWorkflowRouter)(colony.chatRoomManager));
    // Set of connected WebSocket clients
    const clients = new Set();
    // ── WebSocket ─────────────────────────────────────
    wss.on('connection', (ws) => {
        clients.add(ws);
        log.info(`WebSocket client connected (total: ${clients.size})`);
        ws.on('close', () => {
            clients.delete(ws);
            log.debug(`WebSocket client disconnected (total: ${clients.size})`);
        });
    });
    function broadcast(event) {
        const data = JSON.stringify(event);
        for (const ws of clients) {
            if (ws.readyState === ws_1.WebSocket.OPEN) {
                ws.send(data);
            }
        }
    }
    // Wire Colony events to WebSocket broadcast
    colony.messageBus.events.on('message', (message) => {
        broadcast({ type: 'message', data: message });
    });
    colony.messageBus.events.on('colony_event', (event) => {
        if (event.type !== 'message') {
            broadcast(event);
        }
    });
    // Wire agent status changes to WebSocket broadcast
    for (const agent of colony.agentRegistry.getAll()) {
        agent.events.on('status_change', ({ agentId, status }) => {
            broadcast({
                type: 'agent_status',
                agentId,
                status,
            });
        });
    }
    // ── REST: Sessions ────────────────────────────────
    // List all active rooms
    app.get('/api/sessions', (_req, res) => {
        const rooms = colony.chatRoomManager.listRooms();
        res.json({ sessions: rooms });
    });
    // List all saved sessions (persisted to disk)
    app.get('/api/sessions/saved', async (_req, res) => {
        try {
            const sessionIds = await colony.sessionManager.listSessions();
            const sessions = [];
            for (const id of sessionIds) {
                const data = await colony.sessionManager.loadSession(id);
                if (data) {
                    sessions.push(data);
                }
            }
            res.json({ sessions });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // Create a new room
    app.post('/api/sessions', (req, res) => {
        const { name, agentIds, workingDir } = req.body;
        if (!name) {
            res.status(400).json({ error: 'name is required' });
            return;
        }
        // Use colony.createSession() so Discord channel sync hook fires for Web-created sessions.
        const sessionId = colony.createSession(name, agentIds, workingDir);
        const room = colony.chatRoomManager.getRoom(sessionId);
        res.json({ session: room.getInfo() });
    });
    // Get a single room
    app.get('/api/sessions/:id', (req, res) => {
        const room = colony.chatRoomManager.getRoom(req.params.id);
        if (!room) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        res.json({ session: room.getInfo() });
    });
    // Get messages for a room
    app.get('/api/sessions/:id/messages', (req, res) => {
        const room = colony.chatRoomManager.getRoom(req.params.id);
        if (!room) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
        const messages = room.getMessages(limit);
        res.json({ messages });
    });
    // Send a message to a room
    app.post('/api/sessions/:id/messages', (req, res) => {
        const room = colony.chatRoomManager.getRoom(req.params.id);
        if (!room) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        const { senderId, content, mentions, metadata } = req.body;
        if (!senderId || !content) {
            res.status(400).json({ error: 'senderId and content are required' });
            return;
        }
        // Validate mentions: humans can only mention one agent at a time
        if (mentions && mentions.length > 1) {
            res.status(400).json({ error: 'You can only mention one agent at a time' });
            return;
        }
        try {
            const message = room.sendHumanMessage(senderId, content, mentions, metadata);
            res.json({ message });
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    // Send a message as an agent (used by CLI skill scripts)
    app.post('/api/sessions/:id/agent-messages', (req, res) => {
        const room = colony.chatRoomManager.getRoom(req.params.id);
        if (!room) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        const { agentId, content, mentions, metadata } = req.body;
        if (!agentId || !content) {
            res.status(400).json({ error: 'agentId and content are required' });
            return;
        }
        try {
            log.info(`Received agent message request for room ${req.params.id} from agent ${agentId}`);
            const message = room.sendAgentMessage(agentId, content, mentions, metadata);
            res.json({ message });
        }
        catch (err) {
            log.error(`Failed to send agent message in room ${req.params.id}:`, err);
            res.status(400).json({ error: err.message });
        }
    });
    // ── Session History API (used by get-session-history skill) ──────────
    const sessionStore = new SessionRecord_js_1.SessionStore();
    const transcriptWriter = new TranscriptWriter_js_1.TranscriptWriter();
    // GET /api/sessions/:id/agents/:agentId/history — list all sessions
    app.get('/api/sessions/:id/agents/:agentId/history', (req, res) => {
        const { id: roomId, agentId } = req.params;
        const chain = sessionStore.getChain(agentId, roomId);
        res.json({
            agentId,
            roomId,
            sessions: chain.map(s => ({
                id: s.id,
                chainIndex: s.chainIndex,
                status: s.status,
                invocationCount: s.invocationCount,
                tokenUsage: s.tokenUsage,
                contextLimit: s.contextLimit,
                fillRatio: s.contextLimit > 0 ? s.tokenUsage.currentContextLength / s.contextLimit : 0,
                createdAt: s.createdAt,
                sealedAt: s.sealedAt,
                digest: s.digest,
            })),
        });
    });
    // GET /api/sessions/:id/agents/:agentId/history/search?q=... — search transcripts
    app.get('/api/sessions/:id/agents/:agentId/history/search', (req, res) => {
        const { id: roomId, agentId } = req.params;
        const query = req.query.q;
        if (!query) {
            res.status(400).json({ error: 'q parameter is required' });
            return;
        }
        const results = transcriptWriter.search(agentId, roomId, query);
        res.json({ query, results });
    });
    // GET /api/sessions/:id/agents/:agentId/history/:sessionId?page=N — read transcript
    app.get('/api/sessions/:id/agents/:agentId/history/:sessionId', (req, res) => {
        const { id: roomId, agentId, sessionId } = req.params;
        const page = parseInt(req.query.page ?? '0', 10);
        const pageSize = 20;
        const entries = transcriptWriter.read(agentId, roomId, sessionId);
        const slice = entries.slice(page * pageSize, (page + 1) * pageSize);
        res.json({
            sessionId,
            page,
            pageSize,
            total: entries.length,
            hasMore: (page + 1) * pageSize < entries.length,
            entries: slice,
        });
    });
    // Join a room as a human
    app.post('/api/sessions/:id/join', (req, res) => {
        const { participant } = req.body;
        if (!participant?.id || !participant?.name) {
            res.status(400).json({ error: 'participant with id and name is required' });
            return;
        }
        try {
            colony.chatRoomManager.joinRoom(req.params.id, {
                ...participant,
                type: 'human',
            });
            res.json({ ok: true });
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    // Delete a room
    app.delete('\/api\/sessions\/:id', async (req, res) => {
        try {
            const force = req.query.force === 'true';
            // Check worktree status first
            const worktreeStatus = colony.chatRoomManager.checkWorktreeStatus(req.params.id);
            if (worktreeStatus.exists && !worktreeStatus.canSafelyDelete && !force) {
                // Return warning that requires user confirmation
                res.status(409).json({
                    error: 'Worktree has uncommitted changes',
                    worktreeStatus,
                    requiresConfirmation: true
                });
                return;
            }
            const deleted = await colony.deleteSession(req.params.id, force);
            res.json({ deleted });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // Check worktree status for a session
    app.get('/api/sessions/:id/worktree-status', (req, res) => {
        try {
            const status = colony.chatRoomManager.checkWorktreeStatus(req.params.id);
            res.json({ status });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // Update session agents
    app.patch('\/api\/sessions\/:id\/agents', async (req, res) => {
        const { agentIds } = req.body;
        if (!agentIds || !Array.isArray(agentIds)) {
            res.status(400).json({ error: 'agentIds array is required' });
            return;
        }
        try {
            await colony.updateSessionAgents(req.params.id, agentIds);
            const room = colony.chatRoomManager.getRoom(req.params.id);
            res.json({ session: room?.getInfo() });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // Restore a saved session
    app.post('\/api\/sessions\/:id\/restore', async (req, res) => {
        try {
            const room = await colony.chatRoomManager.restoreRoom(req.params.id);
            if (!room) {
                res.status(404).json({ error: 'Session not found' });
                return;
            }
            res.json({ session: room.getInfo() });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // Save a session manually
    app.post('/api/sessions/:id/save', async (req, res) => {
        try {
            await colony.chatRoomManager.saveRoom(req.params.id);
            res.json({ ok: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // Stop a session
    app.post('/api/sessions/:id/stop', (req, res) => {
        try {
            colony.chatRoomManager.stopRoom(req.params.id);
            res.json({ ok: true });
        }
        catch (err) {
            res.status(404).json({ error: err.message });
        }
    });
    // ── REST: Agents ──────────────────────────────────
    // List all agents
    app.get('/api/agents', (_req, res) => {
        const agents = colony.agentRegistry.getStatusSummary();
        res.json({ agents });
    });
    // ── REST: Status ──────────────────────────────────
    // Overall status
    app.get('/api/status', (_req, res) => {
        res.json(colony.getStatus());
    });
    // ── REST: Scheduler ───────────────────────────────
    // Schedule a new task
    app.post('/api/scheduler/tasks', async (req, res) => {
        const { agentId, roomId, prompt, mode, delayMs, repeatIntervalMs, maxExecutions } = req.body;
        if (!agentId || !roomId || !prompt || !mode || !delayMs) {
            res.status(400).json({ error: 'agentId, roomId, prompt, mode, and delayMs are required' });
            return;
        }
        if (mode !== 'once' && mode !== 'repeat') {
            res.status(400).json({ error: 'mode must be "once" or "repeat"' });
            return;
        }
        if (mode === 'repeat' && !repeatIntervalMs) {
            res.status(400).json({ error: 'repeatIntervalMs is required for repeat mode' });
            return;
        }
        try {
            const result = await colony.schedulerService.scheduleNewTask({
                agentId,
                roomId,
                prompt,
                mode,
                delayMs,
                repeatIntervalMs,
                maxExecutions
            });
            res.json(result);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // Get a task by ID
    app.get('/api/scheduler/tasks/:taskId', (req, res) => {
        const task = colony.schedulerService.getTask(req.params.taskId);
        if (!task) {
            res.status(404).json({ error: 'Task not found' });
            return;
        }
        res.json({ task });
    });
    // List tasks (optionally filtered by agentId or roomId)
    app.get('/api/scheduler/tasks', (req, res) => {
        const { agentId, roomId } = req.query;
        const tasks = colony.schedulerService.listTasks(agentId, roomId);
        res.json({ tasks });
    });
    // Cancel a task
    app.delete('/api/scheduler/tasks/:taskId', async (req, res) => {
        try {
            const cancelled = await colony.schedulerService.cancelTask(req.params.taskId);
            if (!cancelled) {
                res.status(404).json({ error: 'Task not found' });
                return;
            }
            res.json({ ok: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // ── REST: Memory ──────────────────────────────────
    // Store a memory to long-term storage (Mem0)
    app.post('/api/memory/retain', async (req, res) => {
        const { content, metadata } = req.body;
        if (!content) {
            res.status(400).json({ error: 'content is required' });
            return;
        }
        if (!metadata || !metadata.agentId || !metadata.roomId) {
            res.status(400).json({ error: 'metadata.agentId and metadata.roomId are required' });
            return;
        }
        try {
            // Get long-term memory instance from colony
            const longTermMemory = colony.longTermMemory;
            if (!longTermMemory) {
                res.status(503).json({ error: 'Long-term memory not enabled' });
                return;
            }
            // Store the memory
            const memoryId = await longTermMemory.retain({
                content,
                metadata,
                timestamp: new Date(),
            });
            res.json({ success: true, memoryId });
        }
        catch (err) {
            log.error('Failed to store memory:', err);
            res.status(500).json({ error: err.message });
        }
    });
    // ── Static files (frontend) ───────────────────────
    const webDistPath = path_1.default.join(process.cwd(), 'web', 'dist');
    if (fs.existsSync(webDistPath)) {
        app.use(express_1.default.static(webDistPath));
        // SPA fallback — Express v5 uses {*path} instead of *
        app.get('{*path}', (_req, res) => {
            res.sendFile(path_1.default.join(webDistPath, 'index.html'));
        });
        log.info(`Serving frontend from ${webDistPath}`);
    }
    else {
        log.warn('Frontend not built yet. Run: npm run build:web');
    }
    // ── Start ─────────────────────────────────────────
    function start() {
        return new Promise((resolve) => {
            server.listen(port, () => {
                log.info(`Colony server running at http://localhost:${port}`);
                log.info(`WebSocket available at ws://localhost:${port}`);
                resolve();
            });
        });
    }
    return { app, server, wss, start };
}
//# sourceMappingURL=index.js.map