# QA Review: Proposal A (Designer + UCD Skill)

- Date: 2026-03-20
- Reviewer: qa-lead
- Scope: Testability, acceptance closure, workflow impact, and security/performance risks for Proposal A.
- Proposal under review:
  - Add role `designer`.
  - Add independent skill `ucd`.
  - Trigger `ucd` conditionally from `dev-workflow` / `quick-task` for UI-related tasks.

## 1) Review Conclusion

Gate decision: **PASS WITH CONDITIONS** (可测、可验、流程可落地)

Rationale:
- Proposal A is testable if and only if output schema, trigger policy, and handoff contracts are explicit and machine-checkable.
- Current proposal direction is correct (independent skill + workflow orchestration), but needs hard QA guardrails to avoid trigger drift and non-UI false positives.

## 2) Four Required Checks

### Check A: Can `*-ucd.md` be converted into acceptance items?

Decision: **Yes, with a mandatory template**.

Required minimum fields in `*-ucd.md`:
1. `scope` (page/component/flow boundaries)
2. `interaction_states` (normal/loading/empty/error/disabled)
3. `visual_constraints` (token, spacing, typography, color contrast target)
4. `assets` (source of truth links, version hash or timestamp)
5. `acceptance_criteria` (Given-When-Then, unique IDs)
6. `non_goals` (explicitly not covered)
7. `risk_notes` (known UX/security/perf risks)

QA acceptance rule:
- If any required section is missing, UCD output is **not testable** and stage must be blocked.

### Check B: Are trigger conditions clear and can non-UI tasks avoid false triggers?

Decision: **Partially clear; needs deterministic trigger matrix + override policy**.

Required trigger policy:
- Trigger UCD when any is true:
  1. Add new page/screen/core view
  2. Change user interaction flow
  3. Change design system token/component behavior
  4. User explicitly asks for UI/UX/visual/design artifacts
- Do not trigger when all are true:
  1. Backend-only change
  2. Infra/script/tooling-only change
  3. Pure text typo update with no UI behavior change

Required controls:
- `ucd_required=true|false` computed once at workflow init/update checkpoint.
- Manual override allowed, but must require reason + audit record.
- Default behavior on ambiguity: `dev-workflow` requires explicit confirmation; `quick-task` defaults to skip unless UI keyword + file-path evidence.

### Check C: Are handoff surfaces complete between Designer / Developer / QA?

Decision: **Mostly complete in concept; missing enforceable interfaces**.

Mandatory handoff contract:
1. Designer -> Developer:
   - Deliver `*-ucd.md` + asset references + state inventory.
2. Developer -> QA:
   - Map implementation to UCD acceptance IDs (`UCD-AC-*`) in test report.
3. Designer -> QA:
   - Confirm final design baseline version used for acceptance.
4. Workflow engine:
   - Preserve artifact links and version metadata in history for traceability.

Blocking condition:
- If UCD baseline version in implementation/test evidence is inconsistent, block stage transition.

### Check D: Is test burden on existing `dev-workflow` / `quick-task` controllable?

Decision: **Yes, if scope is constrained by risk tier**.

Recommended burden control:
- `dev-workflow`: full UCD gate for medium/high-risk UI tasks.
- `quick-task`: lightweight UCD checklist (not full phase), only for UI-touching small tasks.
- Regression set split:
  - Core workflow regression (always run)
  - UCD trigger regression (run on workflow or trigger logic changes)
  - UCD schema validation tests (run when template/rules change)

## 3) Given-When-Then Acceptance Pack (for execution readiness)

### TC-UCD-001 Normal
Given a task that adds a new page and `ucd_required=true`
When the workflow reaches UCD insertion point
Then a valid `*-ucd.md` with all required sections is produced and versioned.

### TC-UCD-002 Exception (missing fields)
Given `ucd_required=true`
When `*-ucd.md` lacks `interaction_states` or `acceptance_criteria`
Then workflow blocks with explicit error and cannot advance.

### TC-UCD-003 Boundary (non-UI task)
Given a backend-only task and no UI indicators
When workflow evaluates trigger rules
Then `ucd_required=false` and no UCD gate is injected.

### TC-UCD-004 Security (asset reference sanitization)
Given UCD assets include external links or local path references
When validator parses asset metadata
Then disallow unsafe schemes/paths (`file://`, traversal, script payloads) and fail closed.

### TC-UCD-005 Security (prompt/content injection)
Given UCD content contains untrusted markup/instructions
When downstream tools consume UCD artifacts
Then only schema-defined fields are parsed; executable content is ignored/escaped.

### TC-UCD-006 Performance
Given repeated workflow runs in same room
When trigger evaluation and UCD schema validation execute
Then additional overhead stays within agreed budget (suggestion: < 1s local median for trigger + schema check).

## 4) Security Review Notes (OWASP-oriented)

- A01 Broken Access Control:
  - Risk: unauthorized role updates forcing/skiping UCD.
  - Control: role-based guard + audit trail on overrides.
- A03 Injection:
  - Risk: path/link/markdown payload injection in UCD artifacts.
  - Control: strict allowlist parser; reject non-http(s) links where applicable.
- A04 Insecure Design:
  - Risk: ambiguous trigger policy causing inconsistent execution.
  - Control: deterministic matrix + explicit ambiguity handling.
- A09 Security Logging and Monitoring Failures:
  - Risk: missing linkage between UCD version and test evidence.
  - Control: persist `ucd_version` and `UCD-AC` mapping in workflow history.

## 5) Stage Gate Declaration

Gate statement:
- Proposal A is approved for implementation **with the above mandatory conditions**.

Verified in this review:
1. `*-ucd.md` can be transformed to executable acceptance criteria.
2. Trigger strategy can avoid non-UI over-trigger if deterministic rules are enforced.
3. Cross-role handoff can be made testable with versioned contracts.
4. Test burden remains controllable through risk-tiered gating.

Residual risks:
1. Trigger ambiguity if keyword/path heuristics are not formalized.
2. Asset/link injection risk if parser is permissive.
3. Cross-tool portability risk if validators rely on non-portable shell behavior.

Execution recommendation:
- Proceed with Proposal A implementation in `dev-workflow` first.
- Add `quick-task` integration as lightweight mode after first stable pass.
