// ── Colony: CLI Invoker ──────────────────────────────────
// TypeScript refactor of invoke.js — unified LLM CLI adapter.
// Supports Claude, Gemini, and CodeX CLIs via spawn.

import { spawn, execSync } from 'child_process';
import { createInterface } from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/Logger.js';
import type { SupportedCLI, InvokeOptions, InvokeResult, ToolUseEvent } from '../types.js';

const log = new Logger('CLIInvoker');

// ── Structured Error ─────────────────────────────────────

export class InvokeError extends Error {
    type: 'spawn_error' | 'exit_error' | 'timeout';
    cli: SupportedCLI;
    code: number | null;
    stderr: string;

    constructor(
        message: string,
        detail: { type: 'spawn_error' | 'exit_error' | 'timeout'; cli: SupportedCLI; code?: number; stderr?: string }
    ) {
        super(message);
        this.name = 'InvokeError';
        this.type = detail.type;
        this.cli = detail.cli;
        this.code = detail.code ?? null;
        this.stderr = detail.stderr ?? '';
    }

    get retryable(): boolean {
        return this.type !== 'spawn_error';
    }
}

// ── Session Storage ──────────────────────────────────────

const DATA_DIR = process.env.COLONY_DATA_DIR || path.join(process.cwd(), '.data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

interface SessionRecord {
    sessionId: string;
    cli: SupportedCLI;
    updatedAt: string;
}

function ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadSessions(): Record<string, SessionRecord> {
    try {
        return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8')) as Record<string, SessionRecord>;
    } catch {
        return {};
    }
}

export function saveSession(name: string, sessionId: string, cli: SupportedCLI): void {
    ensureDataDir();
    const sessions = loadSessions();
    sessions[name] = { sessionId, cli, updatedAt: new Date().toISOString() };
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}

export function getSession(name: string): SessionRecord | null {
    return loadSessions()[name] ?? null;
}

// ── CLI Configurations ───────────────────────────────────

interface CLIConfigEntry {
    buildArgs: (prompt: string, sessionId: string | null) => string[];
    extractText: (event: Record<string, unknown>) => string | null;
    extractSessionId: (event: Record<string, unknown>) => string | null;
    extractToolUse: (event: Record<string, unknown>) => ToolUseEvent | null;
    extractTokenUsage: (event: Record<string, unknown>) => { input: number; output: number } | null;
}

const CLI_CONFIG: Record<SupportedCLI, CLIConfigEntry> = {
    claude: {
        buildArgs: (prompt, sessionId) => {
            const args = [
                '-p', prompt,
                '--output-format', 'stream-json',
                '--verbose',
                '--dangerously-skip-permissions',
            ];
            if (sessionId) args.push('--resume', sessionId);
            return args;
        },
        extractText: (event) => {
            if (event.type !== 'assistant') return null;
            const content = (event.message as Record<string, unknown>)?.content;
            if (!Array.isArray(content)) return null;
            return content
                .filter((b: Record<string, unknown>) => b.type === 'text')
                .map((b: Record<string, unknown>) => b.text as string)
                .join('');
        },
        extractSessionId: (event) => {
            if ((event.type === 'system' || event.type === 'result') && event.session_id) {
                return event.session_id as string;
            }
            return null;
        },
        extractToolUse: (event) => {
            if (event.type !== 'assistant') return null;
            const content = (event.message as Record<string, unknown>)?.content;
            if (!Array.isArray(content)) return null;
            const toolBlock = content.find((b: Record<string, unknown>) => b.type === 'tool_use');
            if (!toolBlock) return null;
            return {
                name: (toolBlock as Record<string, unknown>).name as string,
                input: (toolBlock as Record<string, unknown>).input as Record<string, unknown>,
            };
        },
        extractTokenUsage: (event) => {
            if (event.type === 'result' && event.usage) {
                const usage = event.usage as Record<string, number>;
                return { input: usage.input_tokens ?? 0, output: usage.output_tokens ?? 0 };
            }
            return null;
        },
    },

    gemini: {
        buildArgs: (prompt, sessionId) => {
            const args = ['-p', prompt, '--output-format', 'stream-json', '--yolo'];
            if (sessionId) args.push('--resume', sessionId);
            return args;
        },
        extractText: (event) => {
            if (event.type === 'message' && event.role === 'assistant') {
                return (event.content as string) ?? null;
            }
            return null;
        },
        extractSessionId: (event) => {
            if (event.type === 'init' && event.session_id) {
                return event.session_id as string;
            }
            return null;
        },
        extractToolUse: (event) => {
            if (event.type === 'tool_use') {
                return {
                    name: event.tool_name as string,
                    input: (event.parameters ?? {}) as Record<string, unknown>,
                };
            }
            return null;
        },
        extractTokenUsage: (event) => {
            if (event.type === 'result' && (event.usage || event.stats)) {
                const usage = (event.usage ?? event.stats) as Record<string, number>;
                return { input: usage.input_tokens ?? 0, output: usage.output_tokens ?? 0 };
            }
            return null;
        },
    },

    codex: {
        buildArgs: (prompt, sessionId) => {
            const args = ['-p', prompt, '--output-format', 'stream-json', '--yolo'];
            if (sessionId) args.push('--resume', sessionId);
            return args;
        },
        extractText: (event) => {
            if (event.type === 'message' && event.role === 'assistant') {
                return (event.content as string) ?? null;
            }
            return null;
        },
        extractSessionId: (event) => {
            if ((event.type === 'init' || event.type === 'system') && event.session_id) {
                return event.session_id as string;
            }
            return null;
        },
        extractToolUse: (event) => {
            if (event.type === 'tool_call') {
                return {
                    name: event.name as string,
                    input: (event.arguments ?? {}) as Record<string, unknown>,
                };
            }
            return null;
        },
        extractTokenUsage: (event) => {
            if (event.type === 'result' && event.usage) {
                const usage = event.usage as Record<string, number>;
                return { input: usage.input_tokens ?? 0, output: usage.output_tokens ?? 0 };
            }
            return null;
        },
    },
};

// ── Core Invoke Function ─────────────────────────────────

export async function invoke(
    cli: SupportedCLI,
    prompt: string,
    options: InvokeOptions = {}
): Promise<InvokeResult> {
    const config = CLI_CONFIG[cli];
    if (!config) {
        throw new InvokeError(
            `Unsupported CLI: "${cli}", available: ${Object.keys(CLI_CONFIG).join(', ')}`,
            { type: 'spawn_error', cli }
        );
    }

    const idleTimeoutMs = options.idleTimeoutMs ?? 5 * 60 * 1000;

    // Resolve session ID
    let sessionId = options.sessionId ?? null;
    if (!sessionId && options.sessionName) {
        const saved = getSession(options.sessionName);
        if (saved && saved.cli === cli) {
            sessionId = saved.sessionId;
            log.debug(`Resuming session "${options.sessionName}" → ${sessionId}`);
        }
    }

    // Find CLI binary
    let cliPath: string;
    try {
        cliPath = execSync(`which ${cli}`, { encoding: 'utf-8' }).trim();
    } catch {
        throw new InvokeError(`CLI "${cli}" not found in PATH`, { type: 'spawn_error', cli });
    }

    const args = config.buildArgs(prompt, sessionId);
    log.info(`Invoking ${cli}`, { sessionId: sessionId ?? 'new', cwd: options.cwd ?? 'default' });

    return new Promise<InvokeResult>((resolve, reject) => {
        let settled = false;
        let childExitCode: number | null = null;
        let rlClosed = false;

        const child = spawn(cliPath, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, ...options.env },
            cwd: options.cwd, // Set working directory
        });

        const textChunks: string[] = [];
        let capturedSessionId: string | null = null;
        let stderr = '';
        let tokenUsage: { input: number; output: number } | undefined;
        const toolCalls: ToolUseEvent[] = [];

        // ── Idle timeout ───────────────────────────────────
        let lastActivity = Date.now();
        const resetActivity = () => { lastActivity = Date.now(); };

        child.stdout.on('data', resetActivity);
        child.stderr.on('data', resetActivity);

        const idleChecker = setInterval(() => {
            if (Date.now() - lastActivity > idleTimeoutMs) {
                clearInterval(idleChecker);
                child.kill('SIGTERM');
                setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 5000);
                settle(
                    'reject',
                    new InvokeError(
                        `${cli} timeout (${Math.round(idleTimeoutMs / 1000)}s idle)`,
                        { type: 'timeout', cli, stderr }
                    )
                );
            }
        }, 5000);

        // ── Process cleanup ────────────────────────────────
        const cleanup = () => { if (!child.killed) child.kill('SIGTERM'); };
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);

        const removeCleanupListeners = () => {
            process.off('SIGINT', cleanup);
            process.off('SIGTERM', cleanup);
        };

        // ── AbortSignal ────────────────────────────────────
        const onAbort = () => {
            if (settled) return;
            child.kill('SIGTERM');
            setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 2000);
            settle('reject', new InvokeError('Invocation aborted', { type: 'exit_error', cli, stderr }));
        };
        if (options.signal) {
            if (options.signal.aborted) {
                onAbort();
                return;
            }
            options.signal.addEventListener('abort', onAbort);
        }

        // ── Settle logic ───────────────────────────────────
        function settle(action: 'resolve' | 'reject', value: InvokeResult | InvokeError): void {
            if (settled) return;
            settled = true;
            clearInterval(idleChecker);
            removeCleanupListeners();
            if (options.signal) {
                options.signal.removeEventListener('abort', onAbort);
            }
            if (action === 'resolve') resolve(value as InvokeResult);
            else reject(value as InvokeError);
        }

        // ── Parse stdout line by line ──────────────────────
        const rl = createInterface({ input: child.stdout });

        rl.on('line', (line) => {
            if (!line.trim()) return;
            let event: Record<string, unknown>;
            try { event = JSON.parse(line) as Record<string, unknown>; } catch { return; }

            const sid = config.extractSessionId(event);
            if (sid) capturedSessionId = sid;

            const text = config.extractText(event);
            if (text) {
                textChunks.push(text);
                options.onToken?.(text);
            }

            const toolUse = config.extractToolUse(event);
            if (toolUse) {
                toolCalls.push(toolUse);
                options.onToolUse?.(toolUse);
            }

            const usage = config.extractTokenUsage(event);
            if (usage) {
                tokenUsage = usage;
            }
        });

        // ── Collect stderr ─────────────────────────────────
        child.stderr.on('data', (d) => { stderr += d.toString(); });

        // ── Finalize ───────────────────────────────────────
        function tryFinalize(): void {
            if (childExitCode === null || !rlClosed) return;

            if (childExitCode !== 0) {
                settle(
                    'reject',
                    new InvokeError(
                        `${cli} exited with code ${childExitCode}${stderr ? ': ' + stderr.trim() : ''}`,
                        { type: 'exit_error', cli, code: childExitCode, stderr }
                    )
                );
                return;
            }

            const finalSessionId = capturedSessionId || sessionId;
            if (options.sessionName && finalSessionId) {
                saveSession(options.sessionName, finalSessionId, cli);
            }

            settle('resolve', {
                text: textChunks.join(''),
                sessionId: finalSessionId,
                tokenUsage,
                toolCalls,
            });
        }

        rl.on('close', () => {
            rlClosed = true;
            tryFinalize();
        });

        child.on('close', (code) => {
            childExitCode = code ?? 1;
            tryFinalize();
        });

        child.on('error', (err) => {
            options.onError?.(err);
            settle(
                'reject',
                new InvokeError(`Failed to start ${cli}: ${err.message}`, {
                    type: 'spawn_error',
                    cli,
                })
            );
        });
    });
}
