# Stage 7 P1 Fixes Round 2 (Developer)

- Task ID: `df22275d`
- Date: `2026-03-31`
- Scope: Fix unresolved P1 from Stage 7 integration retest

## Fixed Items

1. `P1-SEC-DF22275D-001` Cross-room idempotency collision
- Root cause: idempotency audit key was global `event_id`.
- Fix: use composite key `roomId:event_id` in route runtime.
- Effect: same `event_id` in different rooms no longer suppresses dispatch.

2. `P1-SEC-DF22275D-002` Forged routing semantics accepted
- Root cause: only structural + routability checks, no semantic trust validation.
- Fix:
  - `decision_source` allowlist enforced (`stage_map` only)
  - role/actor semantic consistency check enforced via normalized role matching
  - mismatch returns fail-closed `400 + WF_STAGE_TRANSITION_INVALID`

## Code Changes

- `src/server/routes/workflow.ts`
  - Added semantic validation helpers (`normalizeRole`, `validateRoutingSemantics`)
  - Added `ALLOWED_DECISION_SOURCES`
  - Updated idempotency lookup/store key to `roomId:event_id`
- `src/tests/unit/workflow/workflowRoute.test.ts`
  - Added regression: cross-room idempotency isolation
  - Added regression: forged `decision_source` fail-closed
  - Added regression: forged role/actor mismatch fail-closed

## TC Mapping

- `TC-IDEMP-001` (cross-room isolation variant): covered by test
  - `isolates idempotency by room scope for same event_id across rooms`
- `TC-SEC-001` (forged metadata fail-closed): covered by tests
  - `rejects forged decision_source fail-closed`
  - `rejects forged role/actor mismatch fail-closed`

## Self-test Evidence

```bash
npm run test -- src/tests/unit/workflow/workflowRoute.test.ts
# PASS (8/8)

npm run build:server
# PASS
```

Black-box retest (same script as QA report) result summary:
- `room-a` with `evt-same-001` => `200 success`
- `room-b` with same `evt-same-001` => `200 success` (not duplicate)
- forged payload (`manual_override` + role/actor mismatch) => `400 WF_STAGE_TRANSITION_INVALID`
- `sentCount = 2` (room-a and room-b both dispatched)
