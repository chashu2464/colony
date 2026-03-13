// @ts-nocheck
// ── Colony: Session Sealer ───────────────────────────────
// Checks context usage thresholds and decides when to seal a session.

import { Logger } from '../utils/Logger.js';
import type { SessionRecord } from './SessionRecord.js';
import { getHealthStatus } from './ContextHealthBar.js';

const log = new Logger('SessionSealer');

// ── Types ────────────────────────────────────────────────

export interface SealConfig {
    /** strategy: 'handoff' = seal at threshold, 'compress' = let CLI handle */
    strategy: 'handoff' | 'compress';
    thresholds: {
        /** Log a warning (0–1) */
        warn: number;
        /** Trigger seal action (0–1) */
        seal: number;
    };
}

export type StrategyAction =
    | { type: 'none' }
    | { type: 'warn'; fillRatio: number }
    | { type: 'seal'; fillRatio: number };

export const DEFAULT_SEAL_CONFIG: SealConfig = {
    strategy: 'handoff',
    thresholds: {
        warn: 0.80,
        seal: 0.88,
    },
};

// ── Sealer ───────────────────────────────────────────────

export class SessionSealer {
    private config: SealConfig;

    constructor(config?: Partial<SealConfig>) {
        this.config = {
            strategy: config?.strategy ?? DEFAULT_SEAL_CONFIG.strategy,
            thresholds: {
                warn: config?.thresholds?.warn ?? DEFAULT_SEAL_CONFIG.thresholds.warn,
                seal: config?.thresholds?.seal ?? DEFAULT_SEAL_CONFIG.thresholds.seal,
            },
        };
    }

    /**
     * Check the session health and return the recommended action.
     */
    shouldTakeAction(session: SessionRecord): StrategyAction {
        if (this.config.strategy === 'compress') {
            // Let CLI handle compression, don't interfere
            return { type: 'none' };
        }

        const health = getHealthStatus(session);
        const { fillRatio } = health;

        if (fillRatio >= this.config.thresholds.seal) {
            log.warn(`Session ${session.id} at ${(fillRatio * 100).toFixed(1)}% — sealing`);
            return { type: 'seal', fillRatio };
        }

        if (fillRatio >= this.config.thresholds.warn) {
            log.warn(`Session ${session.id} at ${(fillRatio * 100).toFixed(1)}% — warning threshold reached`);
            return { type: 'warn', fillRatio };
        }

        return { type: 'none' };
    }
}
