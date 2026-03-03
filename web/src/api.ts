// ── Colony: API Client ───────────────────────────────────

const API_BASE = 'http://localhost:3001/api';

export interface Session {
    id: string;
    name: string;
    participants: Participant[];
    createdAt: string;
    messageCount: number;
    isPaused?: boolean;
}

export interface Participant {
    id: string;
    type: 'agent' | 'human';
    name: string;
    description?: string;
    sessionHealth?: {
        fillRatio: number;
        tokensUsed: number;
        contextLimit: number;
        label: string;
    };
}

export interface Message {
    id: string;
    roomId: string;
    sender: Participant;
    content: string;
    mentions: string[];
    timestamp: string;
    metadata?: {
        isMonologue?: boolean;
        isPending?: boolean;
        toolCalls?: any[];
        error?: string;
        attachments?: { type: string; url: string }[];
        [key: string]: unknown;
    };
}

export interface AgentInfo {
    id: string;
    name: string;
    description?: string;
    status: string;
    model: string;
}

// ── Sessions ──

export async function fetchSessions(): Promise<Session[]> {
    const res = await fetch(`${API_BASE}/sessions`);
    const data = await res.json();
    return data.sessions;
}

export async function createSession(name: string, agentIds?: string[], workingDir?: string): Promise<Session> {
    const res = await fetch(`${API_BASE}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, agentIds, workingDir }),
    });
    const data = await res.json();
    return data.session;
}

export async function joinSession(sessionId: string, participant: Participant): Promise<void> {
    await fetch(`${API_BASE}/sessions/${sessionId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant }),
    });
}

export async function stopSession(sessionId: string): Promise<void> {
    await fetch(`${API_BASE}/sessions/${sessionId}/stop`, { method: 'POST' });
}

export async function deleteSession(sessionId: string): Promise<boolean> {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}`, { method: 'DELETE' });
    const data = await res.json();
    return data.deleted;
}

export async function fetchMessages(sessionId: string, limit?: number): Promise<Message[]> {
    const url = limit
        ? `${API_BASE}/sessions/${sessionId}/messages?limit=${limit}`
        : `${API_BASE}/sessions/${sessionId}/messages`;
    const res = await fetch(url);
    const data = await res.json();
    return data.messages;
}

export async function sendMessage(
    sessionId: string,
    senderId: string,
    content: string,
    mentions?: string[],
    metadata?: Message['metadata']
): Promise<Message> {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId, content, mentions, metadata }),
    });
    const data = await res.json();
    return data.message;
}

// ── Agents ──

export async function fetchAgents(): Promise<AgentInfo[]> {
    const res = await fetch(`${API_BASE}/agents`);
    const data = await res.json();
    return data.agents;
}

// ── Status ──

export async function fetchStatus(): Promise<{
    agents: AgentInfo[];
    rooms: Session[];
    rateLimits: Record<string, unknown>;
}> {
    const res = await fetch(`${API_BASE}/status`);
    return res.json();
}
