// ── Colony: Session Record ───────────────────────────────
// Data model + storage for session lifecycle management.
// Replaces the flat sessions.json with a structured session chain.

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/Logger.js';
import type { SupportedCLI } from '../types.js';

const log = new Logger('SessionRecord');

const DATA_DIR = process.env.COLONY_DATA_DIR || path.join(process.cwd(), '.data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');

// ── Types ────────────────────────────────────────────────

export interface SessionRecord {
    /** CLI session ID (used for --resume) */
    id: string;
    /** Agent that owns this session */
    agentId: string;
    /** Room this session belongs to */
    roomId: string;
    /** Which CLI is being used */
    cli: SupportedCLI;
    /** Position in the session chain (0-indexed) */
    chainIndex: number;
    /** Session lifecycle status */
    status: 'active' | 'sealed';
    /** Cumulative token usage for this session */
    tokenUsage: {
        input: number;
        output: number;
        cacheRead: number;
        cacheCreation: number;
        cumulative: number;
        /** Token length of the current context window (latest turn) */
        currentContextLength: number;
    };
    /** Context window limit for this CLI */
    contextLimit: number;
    /** Number of invocations in this session */
    invocationCount: number;
    /** Timestamps */
    createdAt: string;
    sealedAt?: string;
    /** Last time this session was used for an invocation */
    lastUsedAt?: string;
    /** Link to previous session in the chain */
    previousSessionId?: string;
    /** Digest summary (populated after seal) */
    digest?: string;
}

// ── Known context limits per CLI ─────────────────────────

const DEFAULT_CONTEXT_LIMITS: Record<SupportedCLI, number> = {
    claude: 200_000,
    gemini: 1_000_000,
    codex: 200_000,
};

export function getContextLimit(cli: SupportedCLI, override?: number): number {
    return override ?? DEFAULT_CONTEXT_LIMITS[cli] ?? 200_000;
}

// ── Session Store ────────────────────────────────────────

export class SessionStore {
    private sessionsDir: string;

    constructor(dataDir?: string) {
        this.sessionsDir = path.join(dataDir ?? DATA_DIR, 'sessions');
        this.ensureDir();
    }

    private ensureDir(): void {
        if (!fs.existsSync(this.sessionsDir)) {
            fs.mkdirSync(this.sessionsDir, { recursive: true });
        }
    }

    /**
     * Get the file path for a session chain (per agent per room).
     */
    private chainPath(agentId: string, roomId: string): string {
        return path.join(this.sessionsDir, `${agentId}-${roomId}.json`);
    }

    /**
     * Load all sessions for an agent in a room (the session chain).
     */
    getChain(agentId: string, roomId: string): SessionRecord[] {
        const filePath = this.chainPath(agentId, roomId);
        try {
            const data = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(data) as SessionRecord[];
        } catch {
            return [];
        }
    }

    /**
     * Get the most recently used active session for an agent in a room.
     */
    getActive(agentId: string, roomId: string): SessionRecord | null {
        const chain = this.getChain(agentId, roomId);
        const actives = chain.filter(s => s.status === 'active');
        if (actives.length === 0) return null;
        // Return the most recently used active session
        return actives.sort((a, b) => {
            const tA = a.lastUsedAt ?? a.createdAt;
            const tB = b.lastUsedAt ?? b.createdAt;
            return tB.localeCompare(tA);
        })[0];
    }

    /**
     * Get a specific active session by its session ID.
     */
    getBySessionId(agentId: string, roomId: string, sessionId: string): SessionRecord | null {
        const chain = this.getChain(agentId, roomId);
        return chain.find(s => s.id === sessionId && s.status === 'active') ?? null;
    }

    /**
     * Save the entire chain for an agent in a room.
     */
    private saveChain(agentId: string, roomId: string, chain: SessionRecord[]): void {
        this.ensureDir();
        const filePath = this.chainPath(agentId, roomId);
        fs.writeFileSync(filePath, JSON.stringify(chain, null, 2));
    }

    /**
     * Create a new session record (active).
     */
    create(params: {
        id: string;
        agentId: string;
        roomId: string;
        cli: SupportedCLI;
        contextLimit?: number;
        previousSessionId?: string;
    }): SessionRecord {
        const chain = this.getChain(params.agentId, params.roomId);
        const chainIndex = chain.length;

        const record: SessionRecord = {
            id: params.id,
            agentId: params.agentId,
            roomId: params.roomId,
            cli: params.cli,
            chainIndex,
            status: 'active',
            tokenUsage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, cumulative: 0, currentContextLength: 0 },
            contextLimit: getContextLimit(params.cli, params.contextLimit),
            invocationCount: 0,
            createdAt: new Date().toISOString(),
            previousSessionId: params.previousSessionId,
        };

        chain.push(record);
        this.saveChain(params.agentId, params.roomId, chain);

        log.info(`Created session ${record.id} (chain #${chainIndex}) for ${params.agentId} in room ${params.roomId}`);
        return record;
    }

    /**
     * Update token usage for a specific session (by session ID) after an invocation.
     */
    updateUsage(agentId: string, roomId: string, usage: { input: number; output: number; cacheRead?: number; cacheCreation?: number }, sessionId?: string): SessionRecord | null {
        const chain = this.getChain(agentId, roomId);
        let target: SessionRecord | undefined;
        if (sessionId) {
            target = chain.find(s => s.id === sessionId);
        }
        if (!target) {
            target = chain.filter(s => s.status === 'active')
                .sort((a, b) => (b.lastUsedAt ?? b.createdAt).localeCompare(a.lastUsedAt ?? a.createdAt))[0];
        }
        if (!target) return null;

        target.tokenUsage.input += usage.input;
        target.tokenUsage.output += usage.output;
        target.tokenUsage.cacheRead += usage.cacheRead ?? 0;
        target.tokenUsage.cacheCreation += usage.cacheCreation ?? 0;
        // cumulative tracks all tokens processed in this session
        target.tokenUsage.cumulative += usage.input + (usage.cacheRead ?? 0) + (usage.cacheCreation ?? 0);
        // currentContextLength tracks the size of the latest prompt
        target.tokenUsage.currentContextLength = usage.input + (usage.cacheRead ?? 0) + (usage.cacheCreation ?? 0);
        target.invocationCount += 1;
        target.lastUsedAt = new Date().toISOString();

        this.saveChain(agentId, roomId, chain);
        return target;
    }

    /**
     * Seal a session (mark as sealed, stop resuming it).
     * If sessionId is provided, seal that specific session. Otherwise seal the most recent active.
     */
    seal(agentId: string, roomId: string, sessionId?: string): SessionRecord | null {
        const chain = this.getChain(agentId, roomId);
        let active: SessionRecord | undefined;
        if (sessionId) {
            active = chain.find(s => s.id === sessionId && s.status === 'active');
        }
        if (!active) {
            active = chain.filter(s => s.status === 'active')
                .sort((a, b) => (b.lastUsedAt ?? b.createdAt).localeCompare(a.lastUsedAt ?? a.createdAt))[0];
        }
        if (!active) return null;

        active.status = 'sealed';
        active.sealedAt = new Date().toISOString();

        this.saveChain(agentId, roomId, chain);
        log.info(`Sealed session ${active.id} (chain #${active.chainIndex}) — ${active.invocationCount} invocations, ${active.tokenUsage.cumulative} tokens`);
        return active;
    }

    /**
     * Store digest for a sealed session.
     */
    setDigest(agentId: string, roomId: string, sessionId: string, digest: string): void {
        const chain = this.getChain(agentId, roomId);
        const session = chain.find(s => s.id === sessionId);
        if (session) {
            session.digest = digest;
            this.saveChain(agentId, roomId, chain);
        }
    }

    /**
     * Delete all session chains associated with a room.
     */
    deleteByRoom(roomId: string): void {
        if (!fs.existsSync(this.sessionsDir)) return;
        const files = fs.readdirSync(this.sessionsDir);
        const suffix = `-${roomId}.json`;
        for (const file of files) {
            if (file.endsWith(suffix)) {
                const filePath = path.join(this.sessionsDir, file);
                try {
                    fs.unlinkSync(filePath);
                    log.info(`Deleted session chain: ${file}`);
                } catch (err) {
                    log.error(`Failed to delete session chain ${file}:`, err);
                }
            }
        }
    }
}
