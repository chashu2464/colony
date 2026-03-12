// ── Scheduler Types ──────────────────────────────────────
// Types for delayed and repeated task execution

export interface ScheduledTask {
    id: string;
    agentId: string;
    roomId: string;
    prompt: string;
    mode: 'once' | 'repeat';
    delayMs: number;
    repeatIntervalMs?: number;
    createdAt: number;
    nextExecutionAt: number;
    executionCount: number;
    maxExecutions?: number;
    status: 'pending' | 'running' | 'completed' | 'cancelled';
}

export interface ScheduleTaskRequest {
    agentId: string;
    roomId: string;
    prompt: string;
    mode: 'once' | 'repeat';
    delayMs: number;
    repeatIntervalMs?: number;
    maxExecutions?: number;
}

export interface ScheduleTaskResponse {
    taskId: string;
    nextExecutionAt: number;
}
