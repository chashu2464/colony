# M2.1 Stage 4 QA Gate Verification (Rev2)

- Task: `d83517e0`
- Reviewer: QA Lead (independent verification)
- Verification time (UTC): 2026-04-02T08:41:00Z~2026-04-02T08:43:00Z
- Scope: A1-E1 gate assertions + OWASP-oriented security evidence completeness check

## Verification Actions

1. Reviewed evidence index and 01~06 files under `docs/workflow/task-d83517e0/evidence-stage4/`.
2. Re-checked raw artifacts under `docs/workflow/task-d83517e0/evidence-stage4/raw/`.
3. Independently re-ran:
   - `bash tests/workflow_board_test.sh` (exit=0)
   - `bash tests/workflow_board_m21_test.sh` (exit=0)

## Findings (by severity)

### P1-TEST-EVIDENCE-001: D1 security assertion lacks direct unauthorized raw response artifact

- Severity: P1
- Why high risk: D1 requires proving "WF_PERMISSION_DENIED + no resource existence leak" with direct response evidence. Current evidence only has a derived boolean (`unauthorized_archive_read_denied=true`) and audit logs, which is insufficient for security gate defensibility.
- Affected assertions: D1
- Evidence observed:
  - Present: `raw/m21_test_output.json` -> `assertions.D1.unauthorized_archive_read_denied=true`
  - Present: `raw/m21_board_audit.json` (audit trace fields)
  - Missing: dedicated raw unauthorized `board.events` (archive path) response body proving exact error payload semantics for D1

Given-When-Then (repro):
- Given evidence package `evidence-stage4/raw`
- When searching for unauthorized archive read response payload
- Then no dedicated raw response file is available to prove D1 response semantics directly

Required fix:
1. Add raw response artifact for unauthorized archive read (same request shape as positive archive query) including full error payload and transport status.
2. Add paired case that hits non-existent archive/workflow path under unauthorized actor and confirms identical denial semantics (no existence leakage).
3. Update `05-authz-audit.md` and `00-index.md` mapping with those raw files.

Three-question closure (P1 required before gate pass):
- Fix content: add missing raw denial evidence + no-existence-leak negative case.
- Introduction cause: D1 evidence relied on summary boolean rather than protocol-level payload artifacts.
- Attribution path: evidence authoring gap in Stage 4 packaging checklist for security assertions.

### P2-DATA-FORMAT-001: Non-RFC3339 timestamps in idempotency raw artifacts (`...3NZ`)

- Severity: P2
- Why risk: malformed timestamps may break downstream parsers and impact audit/event ordering consumers.
- Evidence:
  - `raw/idempotency_first_apply.json` / `raw/idempotency_second_apply.json` contain timestamps like `2026-04-02T10:39:38.3NZ`
  - `Date.parse("2026-04-02T10:39:38.3NZ") => NaN` (local repro)

Given-When-Then (repro):
- Given timestamp `2026-04-02T10:39:38.3NZ`
- When parsed by Node `Date.parse`
- Then returns `NaN` (invalid)

Required fix:
1. Normalize emitted timestamps to RFC3339/ISO8601 (e.g., `.sssZ`).
2. Add contract assertion in tests to reject malformed timestamps.

## Gate Decision

- A1: PASS
- A2: PASS
- A3: PASS
- B1: PASS (functional), with P2 data-format risk
- C1: PASS
- C2: PASS
- C3: PASS
- C4: PASS
- D1: **BLOCKED** (evidence completeness gap, P1)
- E1: PASS

Final Stage 4 gate: **BLOCKED**

## Gate Statement

Verified scenarios:
1. Scheduler drift and backoff semantics satisfy frozen thresholds.
2. Fail-closed behavior and parameter conflict errors are stable.
3. Cross-layer pagination monotonicity and dedup behavior pass test assertions.
4. Performance increase during archive period remains below 10% in provided window.

Residual risks:
1. Security gate D1 lacks protocol-level unauthorized response evidence and no-existence-leak parity proof.
2. Timestamp format inconsistency exists in idempotency raw payloads and may affect parser interoperability.

Release recommendation:
- Do not promote Stage 4 gate to PASS until P1 item closure evidence is submitted.
