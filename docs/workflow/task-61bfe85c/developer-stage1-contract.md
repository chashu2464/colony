# Proposal A Stage 1 Contract (Developer)

- Task ID: `61bfe85c`
- Date: `2026-03-20`
- Scope: Phase 1 only (`dev-workflow` integration), no `quick-task` changes.
- Status: Draft for architecture review.

## 1. Contract Goals
- Freeze schema / trigger / audit contracts before implementation.
- Ensure fail-closed validation is machine-checkable.
- Keep `ucd_required` as single source of truth.

## 2. Single Source of Truth
- `ucd_required` is computed exactly once at workflow `init` or explicit `update-checkpoint`.
- Computation output is persisted to workflow history.
- Any downstream stage must only read persisted value and must not recompute.

## 3. Data Contracts
### 3.1 Trigger Decision Contract
Input:
- `task_description: string`
- `changed_paths: string[]`
- `user_intent_flags: string[]` (explicit UI/UX/design request signals)
- `override_requested: boolean`
- `override_reason?: string`

Output:
- `ucd_required: boolean`
- `reason_codes: UcdReasonCode[]`
- `ucd_override_reason?: string`

`UcdReasonCode` enum:
- `UI_NEW_SURFACE` (new page/screen/core view)
- `UI_FLOW_CHANGE` (interaction flow changed)
- `DESIGN_SYSTEM_CHANGE` (token/component behavior change)
- `EXPLICIT_DESIGN_REQUEST` (user explicitly requests UI/UX/design output)
- `NON_UI_BACKEND_ONLY` (backend-only)
- `NON_UI_INFRA_ONLY` (infra/script/tooling only)
- `NON_UI_TEXT_ONLY` (typo/text-only without UI behavior impact)
- `MANUAL_OVERRIDE` (human override applied with auditable reason)

### 3.2 UCD Artifact Contract
Artifact path naming:
- `docs/workflow/task-<task_id>/artifacts/<task_id>-ucd.md`

Artifact identity fields:
- `ucd_version: string` (semver-like, e.g. `1.0.0`)
- `task_id: string`
- `artifact_path: string`
- `baseline_source: string` (design baseline source/version reference)

### 3.3 Audit Field Group Contract
Persist as one grouped object in workflow history:
- `ucd_required: boolean`
- `ucd_reason_codes: string[]`
- `ucd_override_reason: string | null`
- `ucd_version: string | null`
- `ucd_artifact: string | null`
- `ucd_baseline_source: string | null`

Rules:
- If `ucd_required=false`, artifact/version fields may be null.
- If `ucd_required=true`, artifact/version fields must be non-null before stage advance.
- Override is valid only when `ucd_override_reason` is non-empty and `MANUAL_OVERRIDE` exists in `ucd_reason_codes`.

### 3.4 Validation Contract
Input:
- UCD artifact content
- Audit field group
- Implementation evidence (`UCD-AC-*` mapping + `ucd_version`)

Output:
- `result: "pass" | "block"`
- `block_reason?: UcdBlockReason`
- `details: string[]`
## 4. UCD Template Contract
### 4.1 Metadata Layer (required)
Required front-matter keys:
- `ucd_version`
- `task_id`
- `artifact_path`
- `baseline_source`

### 4.2 Body Layer (required)
Required sections (strict names, allowlist parser):
- `scope`
- `interaction_states`
- `visual_constraints`
- `assets`
- `acceptance_criteria`
- `non_goals`
- `risk_notes`

Parser behavior:
- Parse only required metadata keys and required section names.
- Unknown sections/fields are ignored and logged to audit details.
- No executable markdown/script/html interpretation.

## 5. Fail-Closed Blocking Reasons
`UcdBlockReason` enum:
- `UCD_REQUIRED_BUT_MISSING_ARTIFACT`
- `UCD_MISSING_METADATA`
- `UCD_MISSING_REQUIRED_SECTION`
- `UCD_VERSION_MISMATCH`
- `UCD_AUDIT_FIELDS_INCOMPLETE`
- `UCD_OVERRIDE_REASON_MISSING`
- `UCD_ASSET_UNSAFE_SCHEME`
- `UCD_ASSET_PATH_TRAVERSAL`
- `UCD_CONTENT_INJECTION_PATTERN`

Blocking policy:
- Any validation hit from `UcdBlockReason` returns `block`.
- No fail-open downgrade in Phase 1.
- External resource reachability is not a block condition in Phase 1.

## 6. Trigger Matrix (Deterministic)
`ucd_required=true` when any of the following is true:
- Task introduces/changes UI surfaces (`UI_NEW_SURFACE`).
- Task changes user interaction flow (`UI_FLOW_CHANGE`).
- Task changes design system tokens/components (`DESIGN_SYSTEM_CHANGE`).
- User explicitly asks for UI/UX/design artifact (`EXPLICIT_DESIGN_REQUEST`).

`ucd_required=false` only when all are true:
- Change is backend-only, infra-only, or text-only non-UI.
- No UI-related path evidence.
- No explicit design intent from user.

Ambiguity handling:
- `dev-workflow`: require explicit confirmation or auditable override.
- Once confirmed, persist decision; downstream stages cannot recompute.
## 7. Test Matrix to Block Mapping
1. Case: `ucd_required=true` + missing artifact
- Expected: block with `UCD_REQUIRED_BUT_MISSING_ARTIFACT`

2. Case: missing metadata keys or required body sections
- Expected: block with `UCD_MISSING_METADATA` or `UCD_MISSING_REQUIRED_SECTION`

3. Case: implementation/test evidence uses different `ucd_version`
- Expected: block with `UCD_VERSION_MISMATCH`

4. Case: asset includes unsafe scheme/path traversal/injection pattern
- Expected: block with one of:
  - `UCD_ASSET_UNSAFE_SCHEME`
  - `UCD_ASSET_PATH_TRAVERSAL`
  - `UCD_CONTENT_INJECTION_PATTERN`

5. Case: override without reason
- Expected: block with `UCD_OVERRIDE_REASON_MISSING`

6. Boundary: backend-only task
- Input: non-UI signals only
- Expected: `ucd_required=false`, no UCD gate injection, no block.

## 8. Implementation Notes (Phase 1)
Execution order:
1. Implement trigger evaluator and audit field persistence in `dev-workflow`.
2. Implement `skills/ucd` template and validator using contract above.
3. Wire conditional UCD gate injection using persisted `ucd_required`.
4. Add unit tests for all cases in section 7.

Out of scope:
- `quick-task` integration.
- External asset availability checks.
