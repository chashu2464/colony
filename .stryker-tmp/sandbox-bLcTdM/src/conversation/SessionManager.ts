// @ts-nocheck
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
     * List all saved session IDs (excludes agent-specific chain files).
     */
    async listSessions(): Promise<string[]> {
        const files = fs.readdirSync(this.dataDir);
        // Room sessions are saved as [uuid].json
        // Agent files are saved as [agentId]-[uuid].json
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i;
        return files
            .filter(f => uuidRegex.test(f))
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

    /**
     * Delete workflow state associated with a session (room).
     */
    async deleteWorkflow(sessionId: string): Promise<void> {
        // Workflow files are stored in .data/workflows/${sessionId}.json
        const dataDirBase = path.dirname(this.dataDir);
        const workflowFile = path.join(dataDirBase, 'workflows', `${sessionId}.json`);
        if (fs.existsSync(workflowFile)) {
            try {
                fs.unlinkSync(workflowFile);
                log.debug(`Workflow state deleted: ${sessionId}`);
            } catch (err) {
                log.error(`Failed to delete workflow state ${sessionId}:`, err);
            }
        }
    }

    private sessionPath(sessionId: string): string {
        return path.join(this.dataDir, `${sessionId}.json`);
    }
}
