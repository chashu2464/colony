import type { ChatRoom } from './conversation/ChatRoom.js';
export interface AgentConfig {
    id: string;
    name: string;
    model: {
        primary: SupportedCLI;
        fallback?: SupportedCLI[];
    };
    description?: string;
    personality: string;
    rules?: string[];
    /** If true, this agent receives messages when nobody is explicitly @mentioned. */
    isDefault?: boolean;
}
export type SupportedCLI = 'claude' | 'gemini' | 'codex';
export type AgentStatus = 'idle' | 'thinking' | 'executing_skill' | 'rate_limited' | 'error' | 'offline';
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
    tokenUsage?: {
        input: number;
        output: number;
    };
    model?: SupportedCLI;
    isMonologue?: boolean;
    error?: string;
    toolCalls?: any[];
    attachments?: {
        type: string;
        url: string;
    }[];
    [key: string]: unknown;
}
export interface Participant {
    id: string;
    type: 'agent' | 'human';
    name: string;
    description?: string;
}
export interface AgentInfo {
    id: string;
    name: string;
    description?: string;
}
export interface InvokeOptions {
    sessionId?: string;
    sessionName?: string;
    idleTimeoutMs?: number;
    env?: Record<string, string>;
    cwd?: string;
    signal?: AbortSignal;
    onToken?: (token: string) => void;
    onToolUse?: (tool: ToolUseEvent) => void;
    onError?: (error: Error) => void;
}
export interface InvokeResult {
    text: string;
    sessionId: string | null;
    tokenUsage?: {
        input: number;
        output: number;
    };
    toolCalls: ToolUseEvent[];
}
export interface ToolUseEvent {
    name: string;
    input: Record<string, unknown>;
}
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
export interface ChatRoomInfo {
    id: string;
    name: string;
    participants: Participant[];
    createdAt: Date;
    messageCount: number;
    isPaused?: boolean;
}
export type ColonyEvent = {
    type: 'message';
    data: Message;
} | {
    type: 'agent_status';
    agentId: string;
    status: AgentStatus;
} | {
    type: 'rate_limit';
    model: SupportedCLI;
    remaining: number;
    total: number;
} | {
    type: 'typing';
    agentId: string;
    roomId: string;
} | {
    type: 'room_created';
    room: ChatRoomInfo;
} | {
    type: 'room_deleted';
    roomId: string;
} | {
    type: 'session_paused';
    roomId: string;
} | {
    type: 'session_resumed';
    roomId: string;
} | {
    type: 'milestone';
    roomId: string;
    milestone: string;
};
export interface AssembleOptions {
    agentId: string;
    roomId: string;
    currentMessage: Message;
    tokenBudget: number;
    includeHistory?: boolean;
    includeLongTerm?: boolean;
    chatRoom: ChatRoom;
}
