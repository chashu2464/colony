# Stage 8 Developer Implementation Report (task: d83517e0)

- Report time (UTC): 2026-04-03T13:52:00Z
- Scope: Stage 8 convergence evidence under frozen contract semantics (no protocol change).

## Implementation Delta

1. Executed Stage 8 collector for extended window + higher concurrency tiers.
- Command: `bash scripts/workflow_board_stage8_collect.sh`
- Output: `docs/workflow/task-d83517e0/evidence-stage8/raw/`

2. Verified mandatory safety checks from collector outputs.
- OWASP protocol-level raw present and non-empty for all probes.
- D1 existing/non-existing unauthorized parity preserved across all windows.
- Audit traceability denominator/numerator is complete for required fields.

3. Hardened evidence packaging for QA gate replay.
- Added Stage 8 index and per-assertion evidence docs.
- Added direct mapping: assertion -> evidence doc -> raw artifact.

## Stage 8 Snapshot (UTC)

- Soak window: `2026-04-03T05:39:40Z` ~ `2026-04-03T13:39:40Z` (16 windows, 30m interval, >=8h).
- A1/A3/E1 trend: `19/19/19s`, `2/2/2s`, `8/8/8%`.
- D1 parity: `16/16` windows, existing/non-existing both `WF_PERMISSION_DENIED`.
- Audit completeness: actor/workflow_id/archive_id/trace_id = `688/688` each.
- OWASP protocol semantics: `WF_PERMISSION_DENIED`, `BOARD_CURSOR_INVALID`, `BOARD_CURSOR_CONFLICT` with non-empty raw.

## Concurrency Convergence (12/24/48/64)

- 12: total=120, ok=116, fail=4, timeout=4, p95/p99/max=4750/5071/5365ms
- 24: total=240, ok=160, fail=80, timeout=67, p95/p99/max=5537/5664/5729ms
- 48: total=480, ok=174, fail=306, timeout=276, p95/p99/max=6301/6554/6719ms
- 64: total=640, ok=203, fail=437, timeout=391, p95/p99/max=7672/8084/8278ms

## Residual Risk

- 24/48/64 tiers still show concentrated lock-timeout (`exit_code=3`) and EXIT_0 non-OK payloads.
- No frozen error semantic drift is observed; risk remains performance/reliability tail concentration.
