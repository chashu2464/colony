// ── Colony: Base CLI Provider ───────────────────────────
// Base class for all CLI-based LLM providers (Claude, Gemini, Codex).

import { spawn, execSync } from 'child_process';
import { createInterface } from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { Logger } from '../utils/Logger.js';
import { ILLMProvider, LLMRequest, LLMResponse, LLMCapabilities, TokenUsage, ToolCall } from './types.js';
import type { SupportedCLI, InvokeOptions } from '../types.js';
import { loadSessions, saveSession } from './SessionUtils.js';

const log = new Logger('BaseCLIProvider');

// ── Shared CLI Concurrency Limiter ───────────────────────

function getMaxConcurrency(): number {
    const val = parseInt(process.env.COLONY_MAX_CLI_CONCURRENCY || '', 10);
    const DEFAULT = 2;
    if (isNaN(val) || val < 1 || val > 5) {
        return DEFAULT;
    }
    return val;
}

const MAX_CONCURRENT_CLI = getMaxConcurrency();
let activeCLICount = 0;
const cliWaiters: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

async function acquireCLISlot(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
        throw new Error('Invocation aborted while waiting for CLI slot');
    }
    if (activeCLICount < MAX_CONCURRENT_CLI) {
        activeCLICount++;
        return;
    }
    return new Promise<void>((resolve, reject) => {
        const waiter = {
            resolve: () => { activeCLICount++; resolve(); },
            reject,
        };
        cliWaiters.push(waiter);

        if (signal) {
            signal.addEventListener('abort', () => {
                const idx = cliWaiters.indexOf(waiter);
                if (idx !== -1) {
                    cliWaiters.splice(idx, 1);
                    reject(new Error('Invocation aborted while waiting for CLI slot'));
                }
            }, { once: true });
        }
    });
}

function releaseCLISlot(): void {
    activeCLICount--;
    const next = cliWaiters.shift();
    if (next) next.resolve();
}

// ── Base CLI Provider Implementation ─────────────────────

export abstract class BaseCLIProvider implements ILLMProvider {
    abstract readonly name: string;
    abstract readonly capabilities: LLMCapabilities;

    protected abstract buildArgs(prompt: string, sessionId: string | null, files: string[], options: InvokeOptions): string[];
    protected abstract extractText(event: Record<string, unknown>): string | null;
    protected abstract extractSessionId(event: Record<string, unknown>): string | null;
    protected abstract extractToolUse(event: Record<string, unknown>): ToolCall[];
    protected abstract extractTokenUsage(event: Record<string, unknown>): TokenUsage | null;

    async invoke(request: LLMRequest): Promise<LLMResponse> {
        const { prompt, sessionName, options = {} } = request;
        const idleTimeoutMs = options.idleTimeoutMs ?? 5 * 60 * 1000;

        // Resolve session ID
        let sessionId = request.sessionId ?? null;
        if (!sessionId && sessionName) {
            const sessions = loadSessions();
            const saved = sessions[sessionName];
            if (saved && saved.cli === this.name) {
                sessionId = saved.sessionId;
                log.debug(`Resuming session "${sessionName}" → ${sessionId}`);
            }
        }

        // Find CLI binary
        let cliPath: string;
        try {
            cliPath = execSync(`which ${this.name}`, { encoding: 'utf-8' }).trim();
        } catch {
            throw new Error(`CLI "${this.name}" not found in PATH`);
        }

        let tempFiles: string[] = [];
        await acquireCLISlot(options.signal);

        try {
            // Handle attachments
            if (request.attachments && request.attachments.length > 0) {
                tempFiles = this.saveTempImages(request.attachments);
                log.info(`Saved ${tempFiles.length} temp image(s) for ${this.name}`);
            }

            const args = this.buildArgs(prompt, sessionId, tempFiles, options);

            log.info(`Invoking ${this.name}`, {
                sessionId: sessionId ?? 'new',
                cwd: options.cwd ?? 'default',
                fileCount: tempFiles.length
            });

            return await new Promise<LLMResponse>((resolve, reject) => {
                let settled = false;
                let childExitCode: number | null = null;
                let rlClosed = false;

                const child = spawn(cliPath, args, {
                    stdio: this.name === 'codex' ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
                    env: { ...process.env, ...options.env },
                    cwd: options.cwd,
                });

                if (this.name === 'codex' && child.stdin) {
                    child.stdin.write(prompt + '\n');
                    child.stdin.end();
                }

                const textChunks: string[] = [];
                let capturedSessionId: string | null = null;
                let stderr = '';
                let tokenUsage: TokenUsage | undefined;
                const toolCalls: ToolCall[] = [];

                // Idle timeout
                let lastActivity = Date.now();
                const resetActivity = () => { lastActivity = Date.now(); };
                if (child.stdout) child.stdout.on('data', resetActivity);
                if (child.stderr) child.stderr.on('data', resetActivity);

                const idleChecker = setInterval(() => {
                    if (Date.now() - lastActivity > idleTimeoutMs) {
                        clearInterval(idleChecker);
                        child.kill('SIGTERM');
                        settle('reject', new Error(`${this.name} timeout (${Math.round(idleTimeoutMs / 1000)}s idle)`));
                    }
                }, 5000);

                function settle(action: 'resolve' | 'reject', value: any): void {
                    if (settled) return;
                    settled = true;
                    clearInterval(idleChecker);
                    if (action === 'resolve') resolve(value);
                    else reject(value);
                }

                if (!child.stdout) {
                    settle('reject', new Error('Child process stdout is null'));
                    return;
                }

                const rl = createInterface({ input: child.stdout });
                rl.on('line', (line) => {
                    if (!line.trim()) return;
                    let event: Record<string, unknown>;
                    try { event = JSON.parse(line); } catch { return; }

                    const sid = this.extractSessionId(event);
                    if (sid) capturedSessionId = sid;

                    const text = this.extractText(event);
                    if (text) {
                        textChunks.push(text);
                        options.onToken?.(text);
                    }

                    const extractedTools = this.extractToolUse(event);
                    for (const toolUse of extractedTools) {
                        if (toolUse.id) {
                            const existing = toolCalls.find(t => t.id === toolUse.id);
                            if (existing) {
                                // Merge result/error into existing call
                                // BUG-FIX: Don't overwrite existing name/input with placeholders/empty values
                                const { name, input, ...rest } = toolUse;
                                if (name && name !== 'tool_result_placeholder') {
                                    existing.name = name;
                                }
                                if (input && Object.keys(input).length > 0) {
                                    existing.input = input;
                                }
                                Object.assign(existing, rest);
                                continue;
                            }
                        }
                        toolCalls.push(toolUse);
                        options.onToolUse?.(toolUse);
                    }

                    const usage = this.extractTokenUsage(event);
                    if (usage) tokenUsage = usage;
                });

                if (child.stderr) {
                    child.stderr.on('data', (d) => { stderr += d.toString(); });
                }

                const finalize = () => {
                    if (childExitCode === null || !rlClosed) return;
                    if (childExitCode !== 0) {
                        settle('reject', new Error(`${this.name} exited with code ${childExitCode}: ${stderr}`));
                        return;
                    }

                    const finalSessionId = capturedSessionId || sessionId;
                    if (sessionName && finalSessionId) {
                        saveSession(sessionName, finalSessionId, this.name);
                    }

                    settle('resolve', {
                        text: textChunks.join(''),
                        sessionId: finalSessionId,
                        tokenUsage,
                        toolCalls,
                    });
                };

                rl.on('close', () => { rlClosed = true; finalize(); });
                child.on('close', (code) => { childExitCode = code ?? 1; finalize(); });
                child.on('error', (err) => settle('reject', err));

                if (options.signal) {
                    options.signal.addEventListener('abort', () => {
                        child.kill('SIGTERM');
                        settle('reject', new Error('Invocation aborted'));
                    }, { once: true });
                }
            });
        } finally {
            releaseCLISlot();
            this.cleanupTempFiles(tempFiles);
        }
    }

    private saveTempImages(attachments: any[]): string[] {
        const tempDir = path.join(os.tmpdir(), 'colony-attachments');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        return attachments.map((att, index) => {
            const matches = att.url.match(/^data:image\/(\w+);base64,(.+)$/);
            if (!matches) throw new Error('Invalid base64 image format');
            const ext = matches[1];
            const data = matches[2];
            const filename = `${crypto.randomUUID()}-${index}.${ext}`;
            const filepath = path.join(tempDir, filename);
            fs.writeFileSync(filepath, Buffer.from(data, 'base64'));
            return filepath;
        });
    }

    private cleanupTempFiles(files: string[]): void {
        for (const file of files) {
            try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch {}
        }
    }

    async healthCheck(): Promise<boolean> {
        try {
            execSync(`which ${this.name}`, { stdio: 'ignore' });
            return true;
        } catch {
            return false;
        }
    }
}
