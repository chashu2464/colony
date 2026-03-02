// ── Colony: Digest Generator ─────────────────────────────
// Summarizes a sealed session transcript using a cheap CLI call.
// This is the "sub-agent" approach: Colony directly invokes a
// low-cost model to consolidate session history.

import { Logger } from '../utils/Logger.js';
import { invoke } from '../llm/CLIInvoker.js';
import type { TranscriptWriter } from './TranscriptWriter.js';
import type { SessionRecord } from './SessionRecord.js';
import type { SupportedCLI } from '../types.js';

const log = new Logger('DigestGenerator');

// Which CLI to use for summarization (cheapest available)
const DIGEST_CLI: SupportedCLI = (process.env.COLONY_DIGEST_CLI as SupportedCLI) || 'gemini';

// Max transcript characters to send to the summarizer
const MAX_TRANSCRIPT_CHARS = 80_000;

export class DigestGenerator {
    private transcriptWriter: TranscriptWriter;

    constructor(transcriptWriter: TranscriptWriter) {
        this.transcriptWriter = transcriptWriter;
    }

    /**
     * Generate a digest (meeting-notes style summary) for a sealed session.
     * Uses a cheap CLI call with an independent context window.
     */
    async generate(session: SessionRecord): Promise<string> {
        const transcript = this.transcriptWriter.readAsText(
            session.agentId,
            session.roomId,
            session.id,
            MAX_TRANSCRIPT_CHARS
        );

        if (!transcript) {
            log.warn(`No transcript found for session ${session.id}, skipping digest`);
            return `[Session ${session.chainIndex + 1}：无可用记录]`;
        }

        const prompt = `你是一个专业的会议纪要助手。请将以下 AI agent 工作会话记录整理成简洁的交接摘要。

要求：
- 格式：会议纪要风格
- 必须包含：完成了什么、遇到什么问题、未完成的事项
- 简洁，不超过500字
- 语言：中文

Session 信息：
- Agent：${session.agentId}（Session #${session.chainIndex + 1}）
- 时间：${session.createdAt} 至 ${session.sealedAt ?? '未知'}
- 共 ${session.invocationCount} 次调用，${session.tokenUsage.cumulative} tokens

会话记录：
${transcript}

请输出交接摘要：`;

        try {
            log.info(`Generating digest for session ${session.id} using ${DIGEST_CLI}...`);
            const result = await invoke(DIGEST_CLI, prompt, {
                // No sessionName/sessionId — one-shot, no persistence
            });

            const digest = result.text.trim();
            log.info(`Digest generated for session ${session.id} (${digest.length} chars)`);
            return digest;
        } catch (err) {
            log.error(`Failed to generate digest for session ${session.id}:`, err);
            // Fallback: generate a minimal digest from the transcript
            return this.buildFallbackDigest(session, transcript);
        }
    }

    /**
     * Simple rule-based fallback in case the CLI call fails.
     */
    private buildFallbackDigest(session: SessionRecord, transcript: string): string {
        const lines = transcript.split('\n').filter(l => l.startsWith('Response:'));
        const lastResponses = lines.slice(-3).map(l => l.replace('Response: ', '').substring(0, 200)).join('\n');
        return `[Session ${session.chainIndex + 1} 自动摘要]
- 共 ${session.invocationCount} 次调用
- Token 用量：${session.tokenUsage.cumulative}
- 最近输出：
${lastResponses}`;
    }
}
