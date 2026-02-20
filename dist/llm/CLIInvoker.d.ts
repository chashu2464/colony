import type { SupportedCLI, InvokeOptions, InvokeResult } from '../types.js';
export declare class InvokeError extends Error {
    type: 'spawn_error' | 'exit_error' | 'timeout';
    cli: SupportedCLI;
    code: number | null;
    stderr: string;
    constructor(message: string, detail: {
        type: 'spawn_error' | 'exit_error' | 'timeout';
        cli: SupportedCLI;
        code?: number;
        stderr?: string;
    });
    get retryable(): boolean;
}
interface SessionRecord {
    sessionId: string;
    cli: SupportedCLI;
    updatedAt: string;
}
export declare function loadSessions(): Record<string, SessionRecord>;
export declare function saveSession(name: string, sessionId: string, cli: SupportedCLI): void;
export declare function getSession(name: string): SessionRecord | null;
export declare function invoke(cli: SupportedCLI, prompt: string, options?: InvokeOptions): Promise<InvokeResult>;
export {};
