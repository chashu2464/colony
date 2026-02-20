"use strict";
// ── Colony: CLI Invoker ──────────────────────────────────
// TypeScript refactor of invoke.js — unified LLM CLI adapter.
// Supports Claude, Gemini, and CodeX CLIs via spawn.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvokeError = void 0;
exports.loadSessions = loadSessions;
exports.saveSession = saveSession;
exports.getSession = getSession;
exports.invoke = invoke;
const child_process_1 = require("child_process");
const readline_1 = require("readline");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const Logger_js_1 = require("../utils/Logger.js");
const log = new Logger_js_1.Logger('CLIInvoker');
// ── Structured Error ─────────────────────────────────────
class InvokeError extends Error {
    type;
    cli;
    code;
    stderr;
    constructor(message, detail) {
        super(message);
        this.name = 'InvokeError';
        this.type = detail.type;
        this.cli = detail.cli;
        this.code = detail.code ?? null;
        this.stderr = detail.stderr ?? '';
    }
    get retryable() {
        return this.type !== 'spawn_error';
    }
}
exports.InvokeError = InvokeError;
// ── Session Storage ──────────────────────────────────────
const DATA_DIR = process.env.COLONY_DATA_DIR || path.join(process.cwd(), '.data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR))
        fs.mkdirSync(DATA_DIR, { recursive: true });
}
function loadSessions() {
    try {
        return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
    }
    catch {
        return {};
    }
}
function saveSession(name, sessionId, cli) {
    ensureDataDir();
    const sessions = loadSessions();
    sessions[name] = { sessionId, cli, updatedAt: new Date().toISOString() };
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}
function getSession(name) {
    return loadSessions()[name] ?? null;
}
const CLI_CONFIG = {
    claude: {
        buildArgs: (prompt, sessionId) => {
            const args = [
                '-p', prompt,
                '--output-format', 'stream-json',
                '--verbose',
                '--dangerously-skip-permissions',
            ];
            if (sessionId)
                args.push('--resume', sessionId);
            return args;
        },
        extractText: (event) => {
            if (event.type !== 'assistant')
                return null;
            const content = event.message?.content;
            if (!Array.isArray(content))
                return null;
            return content
                .filter((b) => b.type === 'text')
                .map((b) => b.text)
                .join('');
        },
        extractSessionId: (event) => {
            if ((event.type === 'system' || event.type === 'result') && event.session_id) {
                return event.session_id;
            }
            return null;
        },
        extractToolUse: (event) => {
            if (event.type !== 'assistant')
                return null;
            const content = event.message?.content;
            if (!Array.isArray(content))
                return null;
            const toolBlock = content.find((b) => b.type === 'tool_use');
            if (!toolBlock)
                return null;
            return {
                name: toolBlock.name,
                input: toolBlock.input,
            };
        },
        extractTokenUsage: (event) => {
            if (event.type === 'result' && event.usage) {
                const usage = event.usage;
                return { input: usage.input_tokens ?? 0, output: usage.output_tokens ?? 0 };
            }
            return null;
        },
    },
    gemini: {
        buildArgs: (prompt, sessionId) => {
            const args = ['-p', prompt, '--output-format', 'stream-json', '--yolo'];
            if (sessionId)
                args.push('--resume', sessionId);
            return args;
        },
        extractText: (event) => {
            if (event.type === 'message' && event.role === 'assistant') {
                return event.content ?? null;
            }
            return null;
        },
        extractSessionId: (event) => {
            if (event.type === 'init' && event.session_id) {
                return event.session_id;
            }
            return null;
        },
        extractToolUse: (event) => {
            if (event.type === 'tool_use') {
                return {
                    name: event.tool_name,
                    input: (event.parameters ?? {}),
                };
            }
            return null;
        },
        extractTokenUsage: (event) => {
            if (event.type === 'result' && (event.usage || event.stats)) {
                const usage = (event.usage ?? event.stats);
                return { input: usage.input_tokens ?? 0, output: usage.output_tokens ?? 0 };
            }
            return null;
        },
    },
    codex: {
        buildArgs: (prompt, sessionId) => {
            const args = ['-p', prompt, '--output-format', 'stream-json'];
            if (sessionId)
                args.push('--resume', sessionId);
            return args;
        },
        extractText: (event) => {
            if (event.type === 'message' && event.role === 'assistant') {
                return event.content ?? null;
            }
            return null;
        },
        extractSessionId: (event) => {
            if ((event.type === 'init' || event.type === 'system') && event.session_id) {
                return event.session_id;
            }
            return null;
        },
        extractToolUse: (event) => {
            if (event.type === 'tool_call') {
                return {
                    name: event.name,
                    input: (event.arguments ?? {}),
                };
            }
            return null;
        },
        extractTokenUsage: (event) => {
            if (event.type === 'result' && event.usage) {
                const usage = event.usage;
                return { input: usage.input_tokens ?? 0, output: usage.output_tokens ?? 0 };
            }
            return null;
        },
    },
};
// ── Core Invoke Function ─────────────────────────────────
async function invoke(cli, prompt, options = {}) {
    const config = CLI_CONFIG[cli];
    if (!config) {
        throw new InvokeError(`Unsupported CLI: "${cli}", available: ${Object.keys(CLI_CONFIG).join(', ')}`, { type: 'spawn_error', cli });
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
    let cliPath;
    try {
        cliPath = (0, child_process_1.execSync)(`which ${cli}`, { encoding: 'utf-8' }).trim();
    }
    catch {
        throw new InvokeError(`CLI "${cli}" not found in PATH`, { type: 'spawn_error', cli });
    }
    const args = config.buildArgs(prompt, sessionId);
    log.info(`Invoking ${cli}`, { sessionId: sessionId ?? 'new' });
    return new Promise((resolve, reject) => {
        let settled = false;
        let childExitCode = null;
        let rlClosed = false;
        const child = (0, child_process_1.spawn)(cliPath, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, ...options.env },
        });
        const textChunks = [];
        let capturedSessionId = null;
        let stderr = '';
        let tokenUsage;
        const toolCalls = [];
        // ── Idle timeout ───────────────────────────────────
        let lastActivity = Date.now();
        const resetActivity = () => { lastActivity = Date.now(); };
        child.stdout.on('data', resetActivity);
        child.stderr.on('data', resetActivity);
        const idleChecker = setInterval(() => {
            if (Date.now() - lastActivity > idleTimeoutMs) {
                clearInterval(idleChecker);
                child.kill('SIGTERM');
                setTimeout(() => { if (!child.killed)
                    child.kill('SIGKILL'); }, 5000);
                settle('reject', new InvokeError(`${cli} timeout (${Math.round(idleTimeoutMs / 1000)}s idle)`, { type: 'timeout', cli, stderr }));
            }
        }, 5000);
        // ── Process cleanup ────────────────────────────────
        const cleanup = () => { if (!child.killed)
            child.kill('SIGTERM'); };
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
        const removeCleanupListeners = () => {
            process.off('SIGINT', cleanup);
            process.off('SIGTERM', cleanup);
        };
        // ── Settle logic ───────────────────────────────────
        function settle(action, value) {
            if (settled)
                return;
            settled = true;
            clearInterval(idleChecker);
            removeCleanupListeners();
            if (action === 'resolve')
                resolve(value);
            else
                reject(value);
        }
        // ── Parse stdout line by line ──────────────────────
        const rl = (0, readline_1.createInterface)({ input: child.stdout });
        rl.on('line', (line) => {
            if (!line.trim())
                return;
            let event;
            try {
                event = JSON.parse(line);
            }
            catch {
                return;
            }
            const sid = config.extractSessionId(event);
            if (sid)
                capturedSessionId = sid;
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
        function tryFinalize() {
            if (childExitCode === null || !rlClosed)
                return;
            if (childExitCode !== 0) {
                settle('reject', new InvokeError(`${cli} exited with code ${childExitCode}${stderr ? ': ' + stderr.trim() : ''}`, { type: 'exit_error', cli, code: childExitCode, stderr }));
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
            settle('reject', new InvokeError(`Failed to start ${cli}: ${err.message}`, {
                type: 'spawn_error',
                cli,
            }));
        });
    });
}
//# sourceMappingURL=CLIInvoker.js.map