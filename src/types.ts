// ── Colony: Type definitions ──────────────────────────────
// Central type definitions for the Colony multi-agent system.

import type { ChatRoom } from './conversation/ChatRoom.js';

// ── Agent Types ──────────────────────────────────────────

export interface AgentConfig {
    id: string;
    name: string;
    model: {
        primary: SupportedCLI;
        fallback?: SupportedCLI[];
    };
    personality: string;
    rules?: string[];
    /** If true, this agent receives messages when nobody is explicitly @mentioned. */
    isDefault?: boolean;
}

export type SupportedCLI = 'claude' | 'gemini' | 'codex';

export type AgentStatus =
    | 'idle'
    | 'thinking'
    | 'executing_skill'
    | 'rate_limited'
    | 'error'
    | 'offline';

// ── Message Types ────────────────────────────────────────

export interface Message {
    id: string;
    roomId: string;
    sender: Participant;
    content: string;
    mentions: string[];
    timestamp: Date;
    metadata?: MessageMetadata;
}

export interface MessageMetadata {
    skillInvocation?: boolean;
    tokenUsage?: { input: number; output: number };
    model?: SupportedCLI;
}

export interface Participant {
    id: string;
    type: 'agent' | 'human';
    name: string;
}

// ── LLM Types ────────────────────────────────────────────

export interface InvokeOptions {
    sessionId?: string;
    sessionName?: string;
    idleTimeoutMs?: number;
    env?: Record<string, string>;
    cwd?: string; // Working directory for CLI process
    signal?: AbortSignal;
    onToken?: (token: string) => void;
    onToolUse?: (tool: ToolUseEvent) => void;
    onError?: (error: Error) => void;
}

export interface InvokeResult {
    text: string;
    sessionId: string | null;
    tokenUsage?: { input: number; output: number };
    toolCalls: ToolUseEvent[];
}

export interface ToolUseEvent {
    name: string;
    input: Record<string, unknown>;
}

// ── Rate Limit Types ─────────────────────────────────────

export interface ModelQuota {
    model: SupportedCLI;
    requestsPerMinute: number;
    tokensPerMinute: number;
    tokensPerDay: number;
    currentUsage: {
        requests: number;
        tokens: number;
        dailyTokens: number;
    };
    windowStartedAt: Date;
    dailyStartedAt: Date;
}

// ── Skill Types ──────────────────────────────────────────

// SkillMetadata is defined in src/agent/skills/SkillLoader.ts
// and loaded from SKILL.md files at runtime.
// Re-export here for convenience.
export type { SkillMetadata } from './agent/skills/SkillLoader.js';

export interface SkillExecutionContext {
    agentId: string;
    roomId: string;
    sendMessage: (content: string, mentions?: string[]) => void;
    /** Retrieve recent messages from the current chat room. */
    getMessages: (limit?: number) => Message[];
}

export interface SkillResult {
    success: boolean;
    output?: string;
    error?: string;
}

// ── Chat Room Types ──────────────────────────────────────

export interface ChatRoomInfo {
    id: string;
    name: string;
    participants: Participant[];
    createdAt: Date;
    messageCount: number;
    isPaused?: boolean;
}

// ── Event Types ──────────────────────────────────────────

export type ColonyEvent =
    | { type: 'message'; data: Message }
    | { type: 'agent_status'; agentId: string; status: AgentStatus }
    | { type: 'rate_limit'; model: SupportedCLI; remaining: number; total: number }
    | { type: 'typing'; agentId: string; roomId: string }
    | { type: 'room_created'; room: ChatRoomInfo }
    | { type: 'room_deleted'; roomId: string }
    | { type: 'session_paused'; roomId: string }
    | { type: 'session_resumed'; roomId: string }
    | { type: 'milestone'; roomId: string; milestone: string };

// ── Context Assembly Types (for agent awareness) ─────────

export interface AssembleOptions {
    agentId: string;
    roomId: string;
    currentMessage: Message;
    tokenBudget: number;
    includeHistory?: boolean;
    includeLongTerm?: boolean;
    chatRoom: ChatRoom; // ChatRoom instance for participant awareness
}
