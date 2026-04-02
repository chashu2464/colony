# M2.1 Stage 3 - Developer Freeze Response (2026-04-02)

Context: Reply to QA Stage 3 constraints for task `d83517e0`.

## Frozen Values

1) Scheduler drift upper bounds
- p95 drift: <= 20s
- p99 drift: < 30s

2) board.events latency during archiving
- Relative increase upper bound: p95 delta < 10% (compared to non-archiving baseline)

3) `cursor` + `since_event_id` coexistence semantics (fail-closed)
- Priority rule:
  - `cursor` only: use cursor path
  - `since_event_id` only: use legacy path
  - both provided: reject request (no implicit merge)
- Error semantics:
  - both provided: `BOARD_VALIDATION_ERROR` with reason `BOARD_CURSOR_CONFLICT`
  - malformed/unsupported cursor_version: `BOARD_VALIDATION_ERROR` with reason `BOARD_CURSOR_INVALID`
  - unknown `since_event_id`: `BOARD_VALIDATION_ERROR` with reason `since_event_id was not found`

## Security/Error-code Consistency
- Archive and online auth must be identical.
- Any unauthorized archive read returns `WF_PERMISSION_DENIED`.

## WHY
- Freeze explicit thresholds and fail-closed conflict behavior before Stage 4/5 to prevent test gate drift and rework.
