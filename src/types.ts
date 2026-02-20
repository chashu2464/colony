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
    skills: string[];
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

export interface AssembleOptions {
    agentId: string;
    roomId: string;
    currentMessage: Message;
    tokenBudget: number;
    includeHistory?: boolean;
    includeLongTerm?: boolean;
    chatRoom: ChatRoom;
}
