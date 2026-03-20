import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

const script = join(process.cwd(), 'skills/ucd/scripts/validate-ucd.js');

function runValidator(payload: Record<string, unknown>) {
    const result = spawnSync('node', [script, JSON.stringify(payload)], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    return JSON.parse(result.stdout.trim());
}

function baseAudit(required = true) {
    return {
        ucd_required: required,
        ucd_reason_codes: required ? ['UI_NEW_SURFACE'] : ['NON_UI_BACKEND_ONLY'],
        ucd_override_reason: null,
        ucd_version: required ? '1.0.0' : null,
        ucd_artifact: required ? 'placeholder' : null,
        ucd_baseline_source: required ? 'figma:v1' : null,
    };
}

function writeValidArtifact(dir: string, taskId: string) {
    const artifactPath = join(dir, `${taskId}-ucd.md`);
    writeFileSync(artifactPath, `---
ucd_version: 1.0.0
task_id: ${taskId}
artifact_path: ${artifactPath}
baseline_source: figma:v1
---

## scope
profile page
## interaction_states
normal/loading/empty/error/disabled
## visual_constraints
tokenized spacing
## assets
https://cdn.example.com/profile.png
## acceptance_criteria
UCD-AC-1
## non_goals
no animation redesign
## risk_notes
mobile truncation risk
`);
    return artifactPath;
}

describe('UCD validator', () => {
    it('passes when ucd_required=false and audit group complete', () => {
        const output = runValidator({
            artifact_path: '',
            audit: baseAudit(false),
        });
        expect(output.result).toBe('pass');
    });

    it('blocks when audit field group is incomplete', () => {
        const output = runValidator({
            artifact_path: '',
            audit: { ucd_required: true },
        });
        expect(output.result).toBe('block');
        expect(output.block_reason).toBe('UCD_AUDIT_FIELDS_INCOMPLETE');
    });

    it('blocks when artifact is missing for required flow', () => {
        const output = runValidator({
            artifact_path: 'docs/workflow/task-abc/artifacts/abc-ucd.md',
            audit: baseAudit(true),
        });
        expect(output.result).toBe('block');
        expect(output.block_reason).toBe('UCD_REQUIRED_BUT_MISSING_ARTIFACT');
    });

    it('blocks unsafe asset scheme', () => {
        const dir = mkdtempSync(join(tmpdir(), 'ucd-validator-'));
        const artifact = writeValidArtifact(dir, 'task001');
        const updated = join(dir, 'unsafe-ucd.md');
        writeFileSync(updated, `---
ucd_version: 1.0.0
task_id: task001
artifact_path: ${updated}
baseline_source: figma:v1
---
## scope
x
## interaction_states
normal/loading/empty/error/disabled
## visual_constraints
x
## assets
javascript:alert(1)
## acceptance_criteria
UCD-AC-1
## non_goals
x
## risk_notes
x
`);
        const audit = { ...baseAudit(true), ucd_artifact: updated };
        const output = runValidator({
            artifact_path: updated,
            audit,
        });
        expect(output.result).toBe('block');
        expect(output.block_reason).toBe('UCD_ASSET_UNSAFE_SCHEME');
        expect(artifact.length).toBeGreaterThan(0);
    });

    it('blocks when expected version mismatches artifact metadata', () => {
        const dir = mkdtempSync(join(tmpdir(), 'ucd-validator-'));
        const artifact = writeValidArtifact(dir, 'task002');
        const audit = { ...baseAudit(true), ucd_artifact: artifact };
        const output = runValidator({
            artifact_path: artifact,
            audit,
            expected_ucd_version: '2.0.0',
        });
        expect(output.result).toBe('block');
        expect(output.block_reason).toBe('UCD_VERSION_MISMATCH');
    });

    it('blocks when manual override reason is missing', () => {
        const output = runValidator({
            artifact_path: '',
            audit: {
                ...baseAudit(false),
                ucd_reason_codes: ['NON_UI_BACKEND_ONLY', 'MANUAL_OVERRIDE'],
                ucd_override_reason: '',
            },
        });
        expect(output.result).toBe('block');
        expect(output.block_reason).toBe('UCD_OVERRIDE_REASON_MISSING');
    });
});
