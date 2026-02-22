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
    app.use(express.json());

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
        const room = colony.chatRoomManager.createRoom(name, agentIds, workingDir);
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
        const { senderId, content, mentions } = req.body as {
            senderId: string;
            content: string;
            mentions?: string[];
        };
        if (!senderId || !content) {
            res.status(400).json({ error: 'senderId and content are required' });
            return;
        }

        try {
            const message = room.sendHumanMessage(senderId, content, mentions);
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
        const { agentId, content, mentions } = req.body as {
            agentId: string;
            content: string;
            mentions?: string[];
        };
        if (!agentId || !content) {
            res.status(400).json({ error: 'agentId and content are required' });
            return;
        }

        try {
            const message = room.sendAgentMessage(agentId, content, mentions);
            res.json({ message });
        } catch (err) {
            res.status(400).json({ error: (err as Error).message });
        }
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
    app.delete('/api/sessions/:id', async (req, res) => {
        try {
            const deleted = await colony.chatRoomManager.deleteRoom(req.params.id);
            res.json({ deleted });
        } catch (err) {
            res.status(500).json({ error: (err as Error).message });
        }
    });

    // Restore a saved session
    app.post('/api/sessions/:id/restore', async (req, res) => {
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

    // Pause a session
    app.post('/api/sessions/:id/pause', (req, res) => {
        try {
            colony.chatRoomManager.pauseRoom(req.params.id);
            res.json({ ok: true });
        } catch (err) {
            res.status(404).json({ error: (err as Error).message });
        }
    });

    // Resume a session
    app.post('/api/sessions/:id/resume', (req, res) => {
        try {
            colony.chatRoomManager.resumeRoom(req.params.id);
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
