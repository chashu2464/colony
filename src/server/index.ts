// ── Colony: HTTP + WebSocket Server ──────────────────────
// REST API for session/agent management + WebSocket for real-time events.

import express from 'express';
import { createServer } from 'http';
import * as fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import path from 'path';
import { Logger } from '../utils/Logger.js';
import { Colony } from '../Colony.js';
import type { ColonyEvent, Message, Participant } from '../types.js';
import { SessionStore } from '../session/SessionRecord.js';
import { TranscriptWriter } from '../session/TranscriptWriter.js';
import { createWorkflowRouter } from './routes/workflow.js';

const log = new Logger('Server');

export interface ServerOptions {
    port?: number;
    colony: Colony;
}

export function createColonyServer(options: ServerOptions) {
    const { colony, port = 3001 } = options;
    const app = express();
    const server = createServer(app);
    const wss = new WebSocketServer({ server });

    app.use(cors());
    app.use(express.json({ limit: '10mb' }));

    // ── Workflow Events ───────────────────────────────
    app.use('/api/workflow', createWorkflowRouter(colony.chatRoomManager));

    // Set of connected WebSocket clients
    const clients = new Set<WebSocket>();

    // ── WebSocket ─────────────────────────────────────

    wss.on('connection', (ws) => {
        clients.add(ws);
        log.info(`WebSocket client connected (total: ${clients.size})`);

        ws.on('close', () => {
            clients.delete(ws);
            log.debug(`WebSocket client disconnected (total: ${clients.size})`);
        });
    });

    function broadcast(event: ColonyEvent) {
        const data = JSON.stringify(event);
        for (const ws of clients) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(data);
            }
        }
    }

    // Wire Colony events to WebSocket broadcast
    colony.messageBus.events.on('message', (message: Message) => {
        broadcast({ type: 'message', data: message });
    });

    colony.messageBus.events.on('colony_event', (event: ColonyEvent) => {
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
        } catch (err) {
            res.status(500).json({ error: (err as Error).message });
        }
    });

    // Create a new room
    app.post('/api/sessions', (req, res) => {
        const { name, agentIds, workingDir } = req.body as { name: string; agentIds?: string[]; workingDir?: string };
        if (!name) {
            res.status(400).json({ error: 'name is required' });
            return;
        }
        // Use colony.createSession() so Discord channel sync hook fires for Web-created sessions.
        const sessionId = colony.createSession(name, agentIds, workingDir);
        const room = colony.chatRoomManager.getRoom(sessionId)!;
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
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
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
        const { senderId, content, mentions, metadata } = req.body as {
            senderId: string;
            content: string;
            mentions?: string[];
            metadata?: Message['metadata'];
        };
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
        } catch (err) {
            res.status(400).json({ error: (err as Error).message });
        }
    });

    // Send a message as an agent (used by CLI skill scripts)
    app.post('/api/sessions/:id/agent-messages', (req, res) => {
        const room = colony.chatRoomManager.getRoom(req.params.id);
        if (!room) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        const { agentId, content, mentions, metadata } = req.body as {
            agentId: string;
            content: string;
            mentions?: string[];
            metadata?: Record<string, any>;
        };
        if (!agentId || !content) {
            res.status(400).json({ error: 'agentId and content are required' });
            return;
        }

        try {
            log.info(`Received agent message request for room ${req.params.id} from agent ${agentId}`);
            const message = room.sendAgentMessage(agentId, content, mentions, metadata);
            res.json({ message });
        } catch (err) {
            log.error(`Failed to send agent message in room ${req.params.id}:`, err);
            res.status(400).json({ error: (err as Error).message });
        }
    });

    // ── Session History API (used by get-session-history skill) ──────────

    const sessionStore = new SessionStore();
    const transcriptWriter = new TranscriptWriter();

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
        const query = req.query.q as string;
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
        const page = parseInt(req.query.page as string ?? '0', 10);
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
        const { participant } = req.body as { participant: Participant };
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
        } catch (err) {
            res.status(400).json({ error: (err as Error).message });
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
        } catch (err) {
            res.status(500).json({ error: (err as Error).message });
        }
    });

    // Check worktree status for a session
    app.get('/api/sessions/:id/worktree-status', (req, res) => {
        try {
            const status = colony.chatRoomManager.checkWorktreeStatus(req.params.id);
            res.json({ status });
        } catch (err) {
            res.status(500).json({ error: (err as Error).message });
        }
    });

    // Update session agents
    app.patch('\/api\/sessions\/:id\/agents', async (req, res) => {
        const { agentIds } = req.body as { agentIds: string[] };
        if (!agentIds || !Array.isArray(agentIds)) {
            res.status(400).json({ error: 'agentIds array is required' });
            return;
        }
        try {
            await colony.updateSessionAgents(req.params.id, agentIds);
            const room = colony.chatRoomManager.getRoom(req.params.id);
            res.json({ session: room?.getInfo() });
        } catch (err) {
            res.status(500).json({ error: (err as Error).message });
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
        } catch (err) {
            res.status(500).json({ error: (err as Error).message });
        }
    });

    // Save a session manually
    app.post('/api/sessions/:id/save', async (req, res) => {
        try {
            await colony.chatRoomManager.saveRoom(req.params.id);
            res.json({ ok: true });
        } catch (err) {
            res.status(500).json({ error: (err as Error).message });
        }
    });

    // Stop a session
    app.post('/api/sessions/:id/stop', (req, res) => {
        try {
            colony.chatRoomManager.stopRoom(req.params.id);
            res.json({ ok: true });
        } catch (err) {
            res.status(404).json({ error: (err as Error).message });
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
        } catch (err) {
            res.status(500).json({ error: (err as Error).message });
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
        const tasks = colony.schedulerService.listTasks(
            agentId as string | undefined,
            roomId as string | undefined
        );
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
        } catch (err) {
            res.status(500).json({ error: (err as Error).message });
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
        } catch (err) {
            log.error('Failed to store memory:', err);
            res.status(500).json({ error: (err as Error).message });
        }
    });

    // ── Static files (frontend) ───────────────────────
    const webDistPath = path.join(process.cwd(), 'web', 'dist');
    if (fs.existsSync(webDistPath)) {
        app.use(express.static(webDistPath));
        // SPA fallback — Express v5 uses {*path} instead of *
        app.get('{*path}', (_req, res) => {
            res.sendFile(path.join(webDistPath, 'index.html'));
        });
        log.info(`Serving frontend from ${webDistPath}`);
    } else {
        log.warn('Frontend not built yet. Run: npm run build:web');
    }

    // ── Start ─────────────────────────────────────────

    function start(): Promise<void> {
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
