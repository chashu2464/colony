// ── Colony: CLI Invoker ──────────────────────────────────
// TypeScript refactor of invoke.js — unified LLM CLI adapter.
// Supports Claude, Gemini, and CodeX CLIs via spawn.

import { spawn, execSync } from 'child_process';
import { createInterface } from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { Logger } from '../utils/Logger.js';
import type { SupportedCLI, InvokeOptions, InvokeResult, ToolUseEvent } from '../types.js';

const log = new Logger('CLIInvoker');

// ── Utilities for Attachments ─────────────────────────────

/**
 * Saves a base64 image data to a temporary file.
 */
function saveTempImage(base64Data: string, index: number): string {
    const tempDir = path.join(os.tmpdir(), 'colony-attachments');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    // Extract MIME type and data
    // Format is usually: data:image/png;base64,iVBORw...
    const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) throw new Error('Invalid base64 image format');

    const ext = matches[1];
    const data = matches[2];
    const filename = `${crypto.randomUUID()}-${index}.${ext}`;
    const filepath = path.join(tempDir, filename);

    fs.writeFileSync(filepath, Buffer.from(data, 'base64'));
    return filepath;
}

/**
 * Deletes temporary files.
 */
function cleanupTempFiles(files: string[]): void {
    for (const file of files) {
        try {
            if (fs.existsSync(file)) fs.unlinkSync(file);
        } catch (err) {
            log.warn(`Failed to cleanup temp file ${file}:`, err);
        }
    }
}

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

// ── Global CLI Concurrency Limiter ───────────────────────
// Prevents too many CLI processes from running simultaneously,
// which could cause OOM kills (each gemini/claude CLI is heavy).

const MAX_CONCURRENT_CLI = 2;
let activeCLICount = 0;
const cliWaiters: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

async function acquireCLISlot(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
        throw new InvokeError('Invocation aborted while waiting for CLI slot', { type: 'exit_error', cli: 'gemini' });
    }
    if (activeCLICount < MAX_CONCURRENT_CLI) {
        activeCLICount++;
        log.debug(`CLI slot acquired (${activeCLICount}/${MAX_CONCURRENT_CLI} active)`);
        return;
    }
    log.info(`CLI slot full (${activeCLICount}/${MAX_CONCURRENT_CLI}), queuing...`);
    return new Promise<void>((resolve, reject) => {
        const waiter = {
            resolve: () => { activeCLICount++; log.debug(`CLI slot acquired from queue (${activeCLICount}/${MAX_CONCURRENT_CLI} active)`); resolve(); },
            reject,
        };
        cliWaiters.push(waiter);

        // If abort signal fires while waiting, reject and remove from queue
        if (signal) {
            const onAbort = () => {
                const idx = cliWaiters.indexOf(waiter);
                if (idx !== -1) {
                    cliWaiters.splice(idx, 1);
                    reject(new InvokeError('Invocation aborted while waiting for CLI slot', { type: 'exit_error', cli: 'gemini' }));
                }
            };
            signal.addEventListener('abort', onAbort, { once: true });
        }
    });
}

function releaseCLISlot(): void {
    activeCLICount--;
    log.debug(`CLI slot released (${activeCLICount}/${MAX_CONCURRENT_CLI} active, ${cliWaiters.length} waiting)`);
    const next = cliWaiters.shift();
    if (next) next.resolve();
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
    buildArgs: (prompt: string, sessionId: string | null, files?: string[]) => string[];
    extractText: (event: Record<string, unknown>) => string | null;
    extractSessionId: (event: Record<string, unknown>) => string | null;
    extractToolUse: (event: Record<string, unknown>) => ToolUseEvent[];
    extractTokenUsage: (event: Record<string, unknown>) => { input: number; output: number } | null;
}

const CLI_CONFIG: Record<SupportedCLI, CLIConfigEntry> = {
    claude: {
        // ...
        buildArgs: (prompt, sessionId, files) => {
            const args = [
                '-p', prompt,
                '--output-format', 'stream-json',
                '--verbose',
                '--dangerously-skip-permissions',
            ];
            if (sessionId) args.push('--resume', sessionId);
            if (files && files.length > 0) {
                for (const file of files) {
                    args.push('--file', file);
                }
            }
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
            if (event.type !== 'assistant') return [];
            const content = (event.message as Record<string, unknown>)?.content;
            if (!Array.isArray(content)) return [];
            return content
                .filter((b: Record<string, unknown>) => b.type === 'tool_use')
                .map((b: Record<string, unknown>) => ({
                    name: b.name as string,
                    input: b.input as Record<string, unknown>,
                }));
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
        buildArgs: (prompt, sessionId, files) => {
            const args = ['-p', prompt, '--output-format', 'stream-json', '--yolo'];
            if (sessionId) args.push('--resume', sessionId);
            if (files && files.length > 0) {
                log.warn(`Gemini CLI does not support --file parameter. Skipping ${files.length} attachment(s).`);
            }
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
                return [{
                    name: event.tool_name as string,
                    input: (event.parameters ?? {}) as Record<string, unknown>,
                }];
            }
            return [];
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
        buildArgs: (prompt, sessionId, files) => {
            const args = ['-p', prompt, '--output-format', 'stream-json', '--yolo'];
            if (sessionId) args.push('--resume', sessionId);
            if (files && files.length > 0) {
                for (const file of files) {
                    args.push('--file', file);
                }
            }
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
                return [{
                    name: event.name as string,
                    input: (event.arguments ?? {}) as Record<string, unknown>,
                }];
            }
            return [];
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

    const args = config.buildArgs(prompt, sessionId, []); // Initial empty call to find binary
    log.debug(`CLI path resolution for ${cli}`);

    let tempFiles: string[] = [];

    // Acquire a CLI slot before spawning (blocks if MAX_CONCURRENT_CLI reached)
    await acquireCLISlot(options.signal);

    try {
        // Handle attachments
        if (options.attachments && options.attachments.length > 0) {
            tempFiles = options.attachments.map((att, idx) => saveTempImage(att.url, idx));
            log.info(`Saved ${tempFiles.length} temp image(s) for ${cli}`);
        }

        const argsWithFiles = config.buildArgs(prompt, sessionId, tempFiles);
        log.info(`Invoking ${cli}`, { sessionId: sessionId ?? 'new', cwd: options.cwd ?? 'default', fileCount: tempFiles.length });

        return await new Promise<InvokeResult>((resolve, reject) => {
            let settled = false;
            let childExitCode: number | null = null;
            let rlClosed = false;

            const child = spawn(cliPath, argsWithFiles, {
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

                // ── Extract errors from stdout JSON events ──────
                // Some CLIs (notably Claude) report errors as JSON on stdout
                // (e.g. type=result with is_error=true) instead of writing to stderr.
                // Capture these so the InvokeError message includes the real error text.
                if (event.is_error === true && Array.isArray(event.errors)) {
                    const errTexts = (event.errors as string[]).join('; ');
                    stderr += (stderr ? '\n' : '') + errTexts;
                }

                const text = config.extractText(event);
                if (text) {
                    textChunks.push(text);
                    options.onToken?.(text);
                }

                const extractedTools = config.extractToolUse(event);
                for (const toolUse of extractedTools) {
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
                    log.warn(`${cli} finished with exit code ${childExitCode}`);
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

                log.info(`${cli} finished successfully (${textChunks.join('').length} chars, ${toolCalls.length} tools)`);
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
    } finally {
        releaseCLISlot();
        if (tempFiles.length > 0) {
            cleanupTempFiles(tempFiles);
        }
    }
}
