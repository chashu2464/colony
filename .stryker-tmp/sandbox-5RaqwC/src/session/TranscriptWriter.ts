// @ts-nocheck
// ── Colony: Transcript Writer ────────────────────────────
// Records every CLI invocation's input/output to JSONL files.
// Path: .data/transcripts/{agentId}-{roomId}/{sessionId}.jsonl

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/Logger.js';
import type { ToolUseEvent } from '../types.js';

const log = new Logger('TranscriptWriter');

const DATA_DIR = process.env.COLONY_DATA_DIR || path.join(process.cwd(), '.data');

// ── Types ────────────────────────────────────────────────

export interface TranscriptEntry {
    /** Sequential index within this session */
    invocationIndex: number;
    /** When this invocation happened */
    timestamp: string;
    /** The prompt sent to the CLI */
    prompt: string;
    /** The text response from the CLI */
    response: string;
    /** Tool calls made during this invocation */
    toolCalls: ToolUseEvent[];
    /** Token usage for this invocation */
    tokenUsage?: { input: number; output: number };
}

// ── Writer ───────────────────────────────────────────────

export class TranscriptWriter {
    private baseDir: string;

    constructor(dataDir?: string) {
        this.baseDir = path.join(dataDir ?? DATA_DIR, 'transcripts');
    }

    /**
     * Get the directory for transcripts of an agent-room pair.
     */
    private transcriptDir(agentId: string, roomId: string): string {
        return path.join(this.baseDir, `${agentId}-${roomId}`);
    }

    /**
     * Get the file path for a specific session's transcript.
     */
    private transcriptPath(agentId: string, roomId: string, sessionId: string): string {
        return path.join(this.transcriptDir(agentId, roomId), `${sessionId}.jsonl`);
    }

    /**
     * Append an invocation record to the transcript.
     */
    append(
        agentId: string,
        roomId: string,
        sessionId: string,
        entry: TranscriptEntry
    ): void {
        const dir = this.transcriptDir(agentId, roomId);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const filePath = this.transcriptPath(agentId, roomId, sessionId);
        const line = JSON.stringify(entry) + '\n';
        fs.appendFileSync(filePath, line);

        log.debug(`Transcript appended: ${agentId}/${sessionId} invocation #${entry.invocationIndex}`);
    }

    /**
     * Read all entries from a session transcript.
     */
    read(agentId: string, roomId: string, sessionId: string): TranscriptEntry[] {
        const filePath = this.transcriptPath(agentId, roomId, sessionId);
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            return content
                .split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line) as TranscriptEntry);
        } catch {
            return [];
        }
    }

    /**
     * Read transcript as a human-readable summary string (for digest generation).
     */
    readAsText(agentId: string, roomId: string, sessionId: string, maxChars?: number): string {
        const entries = this.read(agentId, roomId, sessionId);
        if (entries.length === 0) return '';

        const lines: string[] = [];
        for (const entry of entries) {
            lines.push(`--- Invocation #${entry.invocationIndex} (${entry.timestamp}) ---`);
            lines.push(`Prompt: ${entry.prompt.substring(0, 500)}${entry.prompt.length > 500 ? '...' : ''}`);
            lines.push(`Response: ${entry.response}`);
            if (entry.toolCalls.length > 0) {
                lines.push(`Tools: ${entry.toolCalls.map(t => t.name).join(', ')}`);
            }
            lines.push('');
        }

        const text = lines.join('\n');
        if (maxChars && text.length > maxChars) {
            return text.substring(0, maxChars) + '\n\n[... 记录已截断 ...]';
        }
        return text;
    }

    /**
     * List all session IDs that have transcripts for an agent-room pair.
     */
    listSessions(agentId: string, roomId: string): string[] {
        const dir = this.transcriptDir(agentId, roomId);
        try {
            return fs.readdirSync(dir)
                .filter(f => f.endsWith('.jsonl'))
                .map(f => f.replace('.jsonl', ''));
        } catch {
            return [];
        }
    }

    /**
     * Search across all transcripts for an agent-room pair.
     */
    search(agentId: string, roomId: string, query: string, maxResults = 10): Array<{
        sessionId: string;
        invocationIndex: number;
        matchLine: string;
    }> {
        const sessionIds = this.listSessions(agentId, roomId);
        const results: Array<{ sessionId: string; invocationIndex: number; matchLine: string }> = [];
        const queryLower = query.toLowerCase();

        for (const sessionId of sessionIds) {
            if (results.length >= maxResults) break;
            const entries = this.read(agentId, roomId, sessionId);
            for (const entry of entries) {
                if (results.length >= maxResults) break;
                const combined = `${entry.prompt}\n${entry.response}`.toLowerCase();
                if (combined.includes(queryLower)) {
                    // Find the matching line
                    const allLines = `${entry.prompt}\n${entry.response}`.split('\n');
                    const matchLine = allLines.find(l => l.toLowerCase().includes(queryLower)) ?? '';
                    results.push({
                        sessionId,
                        invocationIndex: entry.invocationIndex,
                        matchLine: matchLine.substring(0, 200),
                    });
                }
            }
        }

        return results;
    }

    /**
     * Delete all transcripts associated with a room.
     */
    deleteByRoom(roomId: string): void {
        if (!fs.existsSync(this.baseDir)) return;
        const dirs = fs.readdirSync(this.baseDir);
        const suffix = `-${roomId}`;
        for (const dirName of dirs) {
            if (dirName.endsWith(suffix)) {
                const dirPath = path.join(this.baseDir, dirName);
                if (fs.statSync(dirPath).isDirectory()) {
                    try {
                        fs.rmSync(dirPath, { recursive: true, force: true });
                        log.info(`Deleted transcript directory: ${dirName}`);
                    } catch (err) {
                        log.error(`Failed to delete transcript directory ${dirName}:`, err);
                    }
                }
            }
        }
    }
}
