// ── Colony: Context Health Bar ───────────────────────────
// Tracks context window usage and calculates fill ratio.
// Used by SessionSealer to decide when to seal a session.

import { Logger } from '../utils/Logger.js';
import type { SessionRecord } from './SessionRecord.js';

const log = new Logger('ContextHealthBar');

export interface HealthStatus {
    /** 0.0 to 1.0 — how full the context window is */
    fillRatio: number;
    /** Cumulative tokens used */
    tokensUsed: number;
    /** Context window limit */
    contextLimit: number;
    /** Number of invocations so far */
    invocationCount: number;
    /** Human-readable label */
    label: string;
    /** Session chain index (0-indexed) */
    chainIndex: number;
}

/**
 * Calculate the health status of a session based on its token usage.
 */
export function getHealthStatus(session: SessionRecord): HealthStatus {
    const tokensUsed = session.tokenUsage.currentContextLength;
    const contextLimit = session.contextLimit;
    const fillRatio = contextLimit > 0 ? tokensUsed / contextLimit : 0;

    let label: string;
    if (fillRatio < 0.5) label = '🟢 healthy';
    else if (fillRatio < 0.75) label = '🟡 moderate';
    else if (fillRatio < 0.88) label = '🟠 high';
    else label = '🔴 critical';

    return {
        fillRatio,
        tokensUsed,
        contextLimit,
        invocationCount: session.invocationCount,
        label,
        chainIndex: session.chainIndex,
    };
}

/**
 * Log the health status of a session (called after each invocation).
 */
export function logHealth(agentName: string, session: SessionRecord): void {
    const health = getHealthStatus(session);
    const pct = (health.fillRatio * 100).toFixed(1);
    log.info(`[${agentName}] Context: ${pct}% (${health.tokensUsed}/${health.contextLimit}) ${health.label} — invocation #${health.invocationCount}`);
}
