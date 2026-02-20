// ── Colony: Session Manager ──────────────────────────────
// Persists and restores chat room sessions to disk.

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/Logger.js';

const log = new Logger('SessionManager');

export class SessionManager {
    private dataDir: string;

    constructor(dataDir?: string) {
        this.dataDir = dataDir ?? path.join(process.cwd(), '.data', 'sessions');
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    /**
     * Save a session (room state) to disk.
     */
    async saveSession(sessionId: string, data: object): Promise<void> {
        const filePath = this.sessionPath(sessionId);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        log.debug(`Session saved: ${sessionId}`);
    }

    /**
     * Load a session from disk.
     */
    async loadSession(sessionId: string): Promise<object | null> {
        const filePath = this.sessionPath(sessionId);
        if (!fs.existsSync(filePath)) return null;

        try {
            const raw = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(raw) as object;
        } catch (err) {
            log.error(`Failed to load session ${sessionId}:`, err);
            return null;
        }
    }

    /**
     * List all saved session IDs.
     */
    async listSessions(): Promise<string[]> {
        const files = fs.readdirSync(this.dataDir);
        return files
            .filter(f => f.endsWith('.json'))
            .map(f => path.basename(f, '.json'));
    }

    /**
     * Delete a saved session.
     */
    async deleteSession(sessionId: string): Promise<boolean> {
        const filePath = this.sessionPath(sessionId);
        if (!fs.existsSync(filePath)) return false;
        fs.unlinkSync(filePath);
        log.debug(`Session deleted: ${sessionId}`);
        return true;
    }

    private sessionPath(sessionId: string): string {
        return path.join(this.dataDir, `${sessionId}.json`);
    }
}
