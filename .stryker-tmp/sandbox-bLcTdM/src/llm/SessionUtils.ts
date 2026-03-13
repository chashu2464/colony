// @ts-nocheck
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = process.env.COLONY_DATA_DIR || path.join(process.cwd(), '.data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

export interface SessionRecord {
    sessionId: string;
    cli: string;
    updatedAt: string;
}

export function loadSessions(): Record<string, SessionRecord> {
    try {
        if (!fs.existsSync(SESSIONS_FILE)) return {};
        return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
    } catch {
        return {};
    }
}

export function saveSession(name: string, sessionId: string, cli: string): void {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const sessions = loadSessions();
    sessions[name] = { sessionId, cli, updatedAt: new Date().toISOString() };
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}

export function getSession(name: string): SessionRecord | null {
    return loadSessions()[name] ?? null;
}

export function deleteSession(name: string): void {
    const sessions = loadSessions();
    if (sessions[name]) {
        delete sessions[name];
        fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
    }
}
