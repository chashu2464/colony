#!/usr/bin/env node

const { spawn, execSync } = require("child_process");
const { createInterface } = require("readline");
const fs = require("fs");
const path = require("path");

// ── 结构化错误 ────────────────────────────────────────────
class InvokeError extends Error {
    /**
     * @param {string} message
     * @param {object} detail
     * @param {"spawn_error"|"exit_error"|"timeout"} detail.type
     * @param {string} detail.cli
     * @param {number|null} [detail.code]   - 进程退出码
     * @param {string}      [detail.stderr] - stderr 输出
     */
    constructor(message, { type, cli, code = null, stderr = "" }) {
        super(message);
        this.name = "InvokeError";
        this.type = type;
        this.cli = cli;
        this.code = code;
        this.stderr = stderr;
    }

    /** 上层可以据此决定是否重试 */
    get retryable() {
        // 超时和非零退出码通常值得重试，启动失败不值得
        return this.type !== "spawn_error";
    }
}

// ── 会话存储 ──────────────────────────────────────────────
const DATA_DIR = process.env.COLONY_DATA_DIR || path.join(__dirname, ".data");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadSessions() {
    try {
        return JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf-8"));
    } catch {
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

// ── CLI 配置 ──────────────────────────────────────────────
const CLI_CONFIG = {
    claude: {
        buildArgs: (prompt, sessionId) => {
            const args = ["-p", prompt, "--output-format", "stream-json", "--verbose"];
            if (sessionId) args.push("--resume", sessionId);
            return args;
        },
        extractText: (event) => {
            if (event.type !== "assistant") return null;
            return (event.message?.content ?? [])
                .filter((b) => b.type === "text")
                .map((b) => b.text)
                .join("");
        },
        extractSessionId: (event) => {
            if ((event.type === "system" || event.type === "result") && event.session_id) {
                return event.session_id;
            }
            return null;
        },
    },
    gemini: {
        buildArgs: (prompt, sessionId) => {
            const args = ["-p", prompt, "--output-format", "stream-json"];
            if (sessionId) args.push("--resume", sessionId);
            return args;
        },
        extractText: (event) => {
            if (event.type === "message" && event.role === "assistant") {
                return event.content ?? null;
            }
            return null;
        },
        extractSessionId: (event) => {
            if (event.type === "init" && event.session_id) {
                return event.session_id;
            }
            return null;
        },
    },
};

// ── 核心函数 ──────────────────────────────────────────────

/**
 * 调用指定的 CLI 并返回回复文本和 session 信息
 *
 * @param {"claude"|"gemini"} cli
 * @param {string} prompt
 * @param {object}  [options]
 * @param {string}  [options.sessionId]     - 直接指定 session ID 来恢复对话
 * @param {string}  [options.sessionName]   - 用一个名字自动管理 session（自动保存/恢复）
 * @param {number}  [options.idleTimeoutMs] - 空闲超时（ms），默认 5 分钟
 * @returns {Promise<{ text: string, sessionId: string }>}
 */
async function invoke(cli, prompt, options = {}) {
    const config = CLI_CONFIG[cli];
    if (!config) {
        throw new InvokeError(
            `不支持的 CLI: "${cli}"，可选: ${Object.keys(CLI_CONFIG).join(", ")}`,
            { type: "spawn_error", cli }
        );
    }

    const idleTimeoutMs = options.idleTimeoutMs ?? 5 * 60 * 1000; // 默认 5 分钟

    // 确定 session ID：优先用显式传入的，其次从 sessionName 查找
    let sessionId = options.sessionId ?? null;
    if (!sessionId && options.sessionName) {
        const saved = getSession(options.sessionName);
        if (saved && saved.cli === cli) {
            sessionId = saved.sessionId;
        }
    }

    const cliPath = execSync(`which ${cli}`, { encoding: "utf-8" }).trim();
    const args = config.buildArgs(prompt, sessionId);

    return new Promise((resolve, reject) => {
        let settled = false;        // 防止重复 resolve/reject
        let childExitCode = null;   // 子进程退出码
        let rlClosed = false;       // readline 是否已关闭

        const child = spawn(cliPath, args, {
            stdio: ["ignore", "pipe", "pipe"],
        });

        const textChunks = [];
        let capturedSessionId = null;
        let stderr = "";

        // ── 空闲超时 ─────────────────────────────────────
        let lastActivity = Date.now();
        const resetActivity = () => { lastActivity = Date.now(); };

        // stdout 和 stderr 都算活跃信号
        // CLI 在 thinking/工具调用时可能只输出到 stderr
        child.stdout.on("data", resetActivity);
        child.stderr.on("data", resetActivity);

        const idleChecker = setInterval(() => {
            if (Date.now() - lastActivity > idleTimeoutMs) {
                clearInterval(idleChecker);
                // 优雅终止：先 SIGTERM，5 秒后强杀
                child.kill("SIGTERM");
                setTimeout(() => {
                    if (!child.killed) child.kill("SIGKILL");
                }, 5000);
                settle(
                    "reject",
                    new InvokeError(
                        `${cli} 超时 (${Math.round(idleTimeoutMs / 1000)}s 无活动)`,
                        { type: "timeout", cli, stderr }
                    )
                );
            }
        }, 5000);

        // ── 父进程退出时清理子进程 ────────────────────────
        const cleanup = () => {
            if (!child.killed) child.kill("SIGTERM");
        };
        process.on("SIGINT", cleanup);
        process.on("SIGTERM", cleanup);
        process.on("exit", cleanup);

        const removeCleanupListeners = () => {
            process.off("SIGINT", cleanup);
            process.off("SIGTERM", cleanup);
            process.off("exit", cleanup);
        };

        // ── 统一的 settle 逻辑 ───────────────────────────
        function settle(action, value) {
            if (settled) return;
            settled = true;
            clearInterval(idleChecker);
            removeCleanupListeners();
            if (action === "resolve") resolve(value);
            else reject(value);
        }

        // ── readline 逐行解析 ────────────────────────────
        const rl = createInterface({ input: child.stdout });

        rl.on("line", (line) => {
            if (!line.trim()) return;
            let event;
            try { event = JSON.parse(line); } catch { return; }

            const sid = config.extractSessionId(event);
            if (sid) capturedSessionId = sid;

            const text = config.extractText(event);
            if (text) textChunks.push(text);
        });

        // ── stderr 收集 ──────────────────────────────────
        child.stderr.on("data", (d) => { stderr += d.toString(); });

        // ── finalize：等 readline + 进程都结束后再 settle ─
        function tryFinalize() {
            if (childExitCode === null || !rlClosed) return; // 还没都结束

            if (childExitCode !== 0) {
                settle(
                    "reject",
                    new InvokeError(
                        `${cli} 退出码 ${childExitCode}${stderr ? ": " + stderr.trim() : ""}`,
                        { type: "exit_error", cli, code: childExitCode, stderr }
                    )
                );
                return;
            }

            const finalSessionId = capturedSessionId || sessionId;
            if (options.sessionName && finalSessionId) {
                saveSession(options.sessionName, finalSessionId, cli);
            }

            settle("resolve", { text: textChunks.join(""), sessionId: finalSessionId });
        }

        rl.on("close", () => {
            rlClosed = true;
            tryFinalize();
        });

        child.on("close", (code) => {
            childExitCode = code ?? 1;
            tryFinalize();
        });

        child.on("error", (err) => {
            settle(
                "reject",
                new InvokeError(`启动 ${cli} 失败: ${err.message}`, {
                    type: "spawn_error",
                    cli,
                })
            );
        });
    });
}

// ── CLI 入口 ──────────────────────────────────────────────
// 用法:
//   node invoke.js <claude|gemini> "你的问题"                    # 单次调用
//   node invoke.js <claude|gemini> "你的问题" --session myChat   # 带会话名
//   node invoke.js --list-sessions                              # 查看保存的会话
if (require.main === module) {
    const args = process.argv.slice(2);

    // --list-sessions
    if (args.includes("--list-sessions")) {
        const sessions = loadSessions();
        if (Object.keys(sessions).length === 0) {
            console.log("没有保存的会话");
        } else {
            console.log("\n保存的会话:");
            for (const [name, info] of Object.entries(sessions)) {
                console.log(`  ${name}  [${info.cli}]  ${info.sessionId}  (${info.updatedAt})`);
            }
            console.log();
        }
        process.exit(0);
    }

    // 解析参数
    const cli = args[0];
    const prompt = args[1];
    const sessionIdx = args.indexOf("--session");
    const sessionName = sessionIdx !== -1 ? args[sessionIdx + 1] : undefined;

    if (!cli || !prompt) {
        console.error('用法: node invoke.js <claude|gemini> "你的问题" [--session <名字>]');
        process.exit(1);
    }

    invoke(cli, prompt, { sessionName })
        .then(({ text, sessionId }) => {
            console.log(text);
            if (sessionName) {
                console.error(`\n[会话 "${sessionName}" 已保存, session_id: ${sessionId}]`);
            }
        })
        .catch((err) => {
            console.error(err.message);
            if (err.type) console.error(`  类型: ${err.type}, 可重试: ${err.retryable}`);
            process.exit(1);
        });
}

module.exports = { invoke, InvokeError };
