# Stage 7 Developer Implementation Report (task: d83517e0)

- Report time (UTC): 2026-04-02T16:05:00Z
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

## Current Stage 7 Evidence Snapshot

- Soak windows (UTC): `2026-04-02T11:58:24Z` ~ `2026-04-02T15:58:24Z` (8 windows, 30m interval).
- Drift/Recovery/E1 trend: stable at `A1=19/19/19s`, `A3=2/2/2s`, `E1=8/8/8%`.
- Concurrency tiers:
  - 12 parallel: `ok=120/120`, `timeout=0`, `p95/p99/max=3891/4016/4177ms`.
  - 24 parallel: `ok=180/240`, `timeout=60`, `p95/p99/max=5175/5437/5549ms`.
  - 48 parallel: `ok=108/480`, `timeout=372`, `p95/p99/max=5749/6177/6269ms`.
- D1 parity: 8/8 windows existing vs non-existing unauthorized archive reads are semantically identical (`WF_PERMISSION_DENIED`).
- Audit traceability: actor/workflow_id/archive_id/trace_id = `344/344` each.

## Residual Risk

- High-parallel tiers exhibit lock-timeout failures (`exit_code=3`) under the current 5s lock acquisition timeout.
- This is recorded as Stage 7 residual reliability risk and requires follow-up mitigation in Stage 8 (or handler lock strategy tuning).
