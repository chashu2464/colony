// ── Colony: Session Bootstrap ────────────────────────────
// Builds the context injection packet for new sessions.
// Tells the agent who it is, what came before, and how to look up old records.

import type { SessionRecord } from './SessionRecord.js';

export interface BootstrapPacket {
    /** The synthesized preamble to prepend to the first prompt */
    preamble: string;
}

export class SessionBootstrap {
    /**
     * Build the bootstrap preamble for a new session.
     * @param newSession the freshly created session record (status: active)
     * @param previousSession the sealed session that preceded this one
     */
    build(newSession: SessionRecord, previousSession: SessionRecord): BootstrapPacket {
        const digest = previousSession.digest ?? '（摘要生成失败，请使用搜索工具查询旧记录）';
        const chainNum = newSession.chainIndex + 1;
        const prevNum = previousSession.chainIndex + 1;

        const preamble = `## ⚡ Session 连续性说明（系统自动注入）

你是 **Session #${chainNum}**（接续自 Session #${prevNum}，因上下文接近上限自动交接）。

### 上一个 Session 的工作摘要
${digest}

### 可用的回溯工具
如果你不确定之前做过什么、为什么这样决策、某个文件从哪来，**不要猜**：
- 使用 \`get-session-history\` 技能搜索旧 session 记录
- 搜索关键词即可定位到具体的对话片段

### 你的当前任务
继续处理以下消息：`;

        return { preamble };
    }

    /**
     * Inject the bootstrap preamble into an existing prompt string.
     */
    injectInto(prompt: string, newSession: SessionRecord, previousSession: SessionRecord): string {
        const packet = this.build(newSession, previousSession);
        return `${packet.preamble}\n\n${prompt}`;
    }
}
