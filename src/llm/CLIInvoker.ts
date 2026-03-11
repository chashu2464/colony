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

/**
 * Loads the maximum concurrency from environment variables.
 * Range: 1-5, Default: 2.
 */
function getMaxConcurrency(): number {
    const val = parseInt(process.env.COLONY_MAX_CLI_CONCURRENCY || '', 10);
    const DEFAULT = 2;
    if (isNaN(val) || val < 1 || val > 5) {
        if (process.env.COLONY_MAX_CLI_CONCURRENCY) {
            log.warn(`Invalid COLONY_MAX_CLI_CONCURRENCY "${process.env.COLONY_MAX_CLI_CONCURRENCY}". Using default: ${DEFAULT}`);
        }
        return DEFAULT;
    }
    return val;
}

const MAX_CONCURRENT_CLI = getMaxConcurrency();
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

export function deleteSession(name: string): void {
    ensureDataDir();
    const sessions = loadSessions();
    delete sessions[name];
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
    log.info(`Deleted CLI session cache: ${name}`);
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
                return {
                    input: usage.input_tokens ?? 0,
                    output: usage.output_tokens ?? 0,
                    cacheRead: usage.cache_read_input_tokens ?? 0,
                    cacheCreation: usage.cache_creation_input_tokens ?? 0,
                };
            }
            return null;
        },
    },

    gemini: {
        buildArgs: (prompt, sessionId, files) => {
            let finalPrompt = prompt;
            if (files && files.length > 0) {
                files.forEach((file) => {
                    finalPrompt += `\n@${file}`;
                });
            }
            const args = ['-p', finalPrompt, '--output-format', 'stream-json', '--yolo'];
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
            const args = ['exec', '--dangerously-bypass-approvals-and-sandbox', '--json'];

            if (sessionId) {
                args.push('resume', sessionId);
            }

            if (files && files.length > 0) {
                for (const file of files) {
                    args.push('-i', file);
                }
            }

            // Note: prompt will be passed via stdin, not as argument
            return args;
        },
        extractText: (event) => {
            const item = event.item as Record<string, any> | undefined;
            if (event.type === 'item.completed' && item?.type === 'agent_message') {
                return (item.text as string) ?? null;
            }
            // Compatibility for old format or other event types
            if (event.type === 'message' && event.role === 'assistant') {
                return (event.content as string) ?? null;
            }
            return null;
        },
        extractSessionId: (event) => {
            if (event.type === 'thread.started' && event.thread_id) {
                return event.thread_id as string;
            }
            if ((event.type === 'init' || event.type === 'system') && event.session_id) {
                return event.session_id as string;
            }
            return null;
        },
        extractToolUse: (event) => {
            if (event.type === 'item.completed' && event.item) {
                const item = event.item as Record<string, any>;
                // Map Codex-native executions to ToolUseEvent so they appear in Colony logs/UI
                if (['command_execution', 'web_search', 'read_file', 'write_file', 'apply_patch'].includes(item.type)) {
                    return [{
                        name: item.type,
                        input: item,
                    }];
                }
            }
            if (event.type === 'tool_call') {
                return [{
                    name: event.name as string,
                    input: (event.arguments ?? {}) as Record<string, unknown>,
                }];
            }
            return [];
        },
        extractTokenUsage: (event) => {
            if (event.type === 'turn.completed' && event.usage) {
                const usage = event.usage as Record<string, number>;
                return {
                    input: usage.input_tokens ?? 0,
                    output: usage.output_tokens ?? 0,
                    cacheRead: usage.cached_input_tokens ?? 0,
                };
            }
            if (event.type === 'result' && event.usage) {
                const usage = event.usage as Record<string, number>;
                return {
                    input: usage.input_tokens ?? 0,
                    output: usage.output_tokens ?? 0,
                    cacheRead: usage.cache_read_input_tokens ?? 0,
                    cacheCreation: usage.cache_creation_input_tokens ?? 0,
                };
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
        // Validate skills symlink exists before spawning CLI
        if (options.cwd) {
            const skillsPath = path.join(options.cwd, `.${cli}`, 'skills');
            if (!fs.existsSync(skillsPath)) {
                throw new InvokeError(
                    `Skills symlink not found: ${skillsPath} (CWD: ${options.cwd}). ` +
                    `CLI cannot access Colony skills. Please ensure the Colony service is running and has permissions to create symlinks.`,
                    { type: 'spawn_error', cli }
                );
            }
        }

        // Handle attachments
        if (options.attachments && options.attachments.length > 0) {
            tempFiles = options.attachments.map((att, idx) => saveTempImage(att.url, idx));
            log.info(`Saved ${tempFiles.length} temp image(s) for ${cli}`);
        }

        const argsWithFiles = config.buildArgs(prompt, sessionId, tempFiles);

        // Enhanced logging: record full spawn parameters for debugging
        const sanitizedEnv = Object.keys(options.env ?? {}).reduce((acc, key) => {
            // Sanitize sensitive values (API keys, tokens)
            if (key.toLowerCase().includes('key') || key.toLowerCase().includes('token') || key.toLowerCase().includes('secret')) {
                acc[key] = '***';
            } else {
                acc[key] = (options.env ?? {})[key];
            }
            return acc;
        }, {} as Record<string, string | undefined>);

        log.info(`Invoking ${cli}`, {
            sessionId: sessionId ?? 'new',
            cwd: options.cwd ?? 'default',
            fileCount: tempFiles.length
        });
        log.debug(`${cli} spawn parameters`, {
            args: argsWithFiles,
            env: sanitizedEnv,
            cwd: options.cwd
        });

        return await new Promise<InvokeResult>((resolve, reject) => {
            let settled = false;
            let childExitCode: number | null = null;
            let rlClosed = false;

            const child = spawn(cliPath, argsWithFiles, {
                stdio: cli === 'codex' ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
                env: { ...process.env, ...options.env },
                cwd: options.cwd, // Set working directory
            });

            // For codex CLI, write prompt to stdin
            if (cli === 'codex' && child.stdin) {
                child.stdin.write(prompt + '\n');
                child.stdin.end();
            }

            const textChunks: string[] = [];
            let capturedSessionId: string | null = null;
            let stderr = '';
            let tokenUsage: { input: number; output: number } | undefined;
            const toolCalls: ToolUseEvent[] = [];

            // ── Idle timeout ───────────────────────────────────
            let lastActivity = Date.now();
            const resetActivity = () => { lastActivity = Date.now(); };

            if (child.stdout) {
                child.stdout.on('data', resetActivity);
            }
            if (child.stderr) {
                child.stderr.on('data', resetActivity);
            }

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
            if (!child.stdout) {
                settle('reject', new InvokeError('Child process stdout is null', { type: 'exit_error', cli, stderr }));
                return;
            }
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
            if (child.stderr) {
                child.stderr.on('data', (d) => { stderr += d.toString(); });
            }

            // ── Finalize ───────────────────────────────────────
            function tryFinalize(): void {
                if (childExitCode === null || !rlClosed) return;

                if (childExitCode !== 0) {
                    // Enhanced error logging: explicitly indicate when no error output was captured
                    const errorDetail = stderr
                        ? `: ${stderr.trim()}`
                        : ' (no error output captured - CLI may have crashed before producing diagnostics)';

                    log.error(`CLI invocation failed: ${cliPath} ${argsWithFiles.join(' ')}`);
                    log.error(`${cli} finished with exit code ${childExitCode}${errorDetail}`);

                    settle(
                        'reject',
                        new InvokeError(
                            `${cli} exited with code ${childExitCode}${errorDetail}`,
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
                log.error(`CLI spawn failed: ${cliPath} ${argsWithFiles.join(' ')}`);
                log.error(`Error: ${err.message}`);
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

/**
 * Health check: Verify if a CLI is working correctly by sending a simple test prompt.
 */
export async function verifyCLI(cli: SupportedCLI): Promise<boolean> {
    try {
        log.info(`Health check: Verifying ${cli}...`);
        const result = await invoke(cli, 'respond with "ok" and only "ok"', {
            idleTimeoutMs: 15000, // 15s timeout for health check
        });
        const isHealthy = result.text.toLowerCase().includes('ok');
        if (isHealthy) {
            log.info(`Health check: ${cli} is healthy.`);
        } else {
            log.warn(`Health check: ${cli} returned unexpected response: ${result.text}`);
        }
        return isHealthy;
    } catch (err) {
        log.error(`Health check: ${cli} is NOT healthy.`, (err as Error).message);
        return false;
    }
}
