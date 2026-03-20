import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import path from 'path';

const script = path.join(process.cwd(), 'skills/ucd/scripts/evaluate-trigger.js');

function runEvaluator(payload: Record<string, unknown>) {
    const result = spawnSync('node', [script, JSON.stringify(payload)], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    return JSON.parse(result.stdout.trim());
}

describe('UCD trigger evaluator', () => {
    it('sets required=true when UI path evidence exists', () => {
        const output = runEvaluator({
            task_description: 'Implement profile screen',
            changed_paths: ['web/src/pages/profile.tsx'],
            user_intent_flags: [],
            override_requested: false,
        });

        expect(output.ucd_required).toBe(true);
        expect(output.reason_codes).toContain('UI_NEW_SURFACE');
    });

    it('sets required=false only when non-ui conditions all hold', () => {
        const output = runEvaluator({
            task_description: 'Refactor API rate limiter',
            changed_paths: ['src/server/rate-limit.ts'],
            user_intent_flags: [],
            override_requested: false,
        });

        expect(output.ucd_required).toBe(false);
        expect(output.reason_codes).toContain('NON_UI_BACKEND_ONLY');
    });

    it('captures manual override reason code', () => {
        const output = runEvaluator({
            task_description: 'Tune copy text',
            changed_paths: ['docs/readme.md'],
            user_intent_flags: [],
            override_requested: true,
            override_ucd_required: true,
            override_reason: 'Force design review due release risk',
        });

        expect(output.ucd_required).toBe(true);
        expect(output.reason_codes).toContain('MANUAL_OVERRIDE');
        expect(output.ucd_override_reason).toBe('Force design review due release risk');
    });
});
