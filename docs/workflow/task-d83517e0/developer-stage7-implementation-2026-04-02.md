# Stage 7 Developer Implementation Report (task: d83517e0)

- Report time (UTC): 2026-04-02T16:18:30Z
- Scope: evidence hardening for multi-window stability, concurrency-tier tail behavior, D1 semantic parity, OWASP negative-path checks.

## Implementation Delta

1. Fixed Stage 7 collector audit path mismatch.
- File: `scripts/workflow_board_stage7_collect.sh`
- Change: audit traceability now reads `extensions.board_audit` (with legacy fallback `workflow_audit`).
- WHY: prior path mismatch produced `total_events=0`, blocking denominator/numerator audit checks.

2. Fixed Stage 7 collector concurrency sample serialization bug.
- File: `scripts/workflow_board_stage7_collect.sh`
- Change: explicit jq variable mapping for `request_id/latency_ms/exit_code/ok/body`.
- WHY: shorthand object construction produced null-valued samples and invalid tier aggregates.

3. Re-collected Stage 7 raw evidence.
- Command: `bash scripts/workflow_board_stage7_collect.sh`
- Raw output dir: `docs/workflow/task-d83517e0/evidence-stage7/raw/`

4. Hardened OWASP negative-path protocol capture and self-check.
- File: `scripts/workflow_board_stage7_collect.sh`
- Change: capture handler output using `2>&1` for all OWASP probes and persist raw protocol text; fail collection immediately if any probe raw is empty.
- WHY: QA gate `P1-SEC-EVIDENCE-OWASP-001` requires protocol-level raw evidence, not boolean summaries.

## Current Stage 7 Evidence Snapshot

- Soak windows (UTC): `2026-04-02T12:11:15Z` ~ `2026-04-02T16:11:15Z` (8 windows, 30m interval).
- Drift/Recovery/E1 trend: stable at `A1=19/19/19s`, `A3=2/2/2s`, `E1=8/8/8%`.
- Concurrency tiers:
  - 12 parallel: `ok=120/120`, `timeout=0`, `p95/p99/max=3789/4021/4035ms`.
  - 24 parallel: `ok=174/240`, `timeout=66`, `p95/p99/max=5151/5426/5586ms`.
  - 48 parallel: `ok=210/480`, `timeout=270`, `p95/p99/max=6108/6349/6551ms`.
- D1 parity: 8/8 windows existing vs non-existing unauthorized archive reads are semantically identical (`WF_PERMISSION_DENIED`).
- Audit traceability: actor/workflow_id/archive_id/trace_id = `344/344` each.
- OWASP raw evidence: authz/resource abuse return `WF_PERMISSION_DENIED`; invalid cursor/conflict return `BOARD_CURSOR_INVALID`/`BOARD_CURSOR_CONFLICT`; all four probes now have non-empty protocol-level raw.

## P1 Closure (P1-SEC-EVIDENCE-OWASP-001)

- Fix content: replaced empty/omitted negative-path raw with protocol-level captured responses and added hard self-check (`empty raw => fail`) in collector.
- Introduced cause: prior collector suppressed stderr (`2>/dev/null`) and relied on best-effort wrappers, producing empty raw despite failing probes.
- Attribution path: `append_owasp_samples` probe capture path in `scripts/workflow_board_stage7_collect.sh` -> `raw/stage7_owasp_negative_outputs.ndjson` -> `04-owasp-negative-paths.md` evidence statement mismatch.

## Residual Risk

- High-parallel tiers exhibit lock-timeout failures (`exit_code=3`) under the current 5s lock acquisition timeout.
- This is recorded as Stage 7 residual reliability risk and requires follow-up mitigation in Stage 8 (or handler lock strategy tuning).
