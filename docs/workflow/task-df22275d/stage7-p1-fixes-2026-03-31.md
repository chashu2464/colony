# Stage 7 P1 Fixes Report

- Task ID: `df22275d`
- Stage: `7. Integration Testing (developer fixes)`
- Date: `2026-03-31`
- Owner: `developer`

## Fixed P1 Defects

1. `P1-SEC-DF22275D-001` Cross-room idempotency collision
- Root cause: route dispatch audit map keyed only by `event_id`.
- Fix: idempotency key changed to `roomId:event_id` (`dispatchStateByRoomEvent`), ensuring replay isolation per room.
- Result: same `event_id` in different rooms no longer causes `duplicate_ignored` false positives.

2. `P1-SEC-DF22275D-002` Forged routing metadata accepted
- Root cause: route validated structure only, not semantic consistency against workflow truth.
- Fix: route now loads `.data/workflows/<roomId>.json` and verifies the payload against the matching history record by `event_id`:
  - `from_stage`
  - `to_stage`
  - `routing.next_actor_role`
  - `routing.next_actor`
  - `routing.decision_source`
- Additional hardening: `decision_source` restricted to allowlist (`stage_map`).
- Result: tampered decision source or role/actor mismatch is fail-closed (`400 + WF_STAGE_TRANSITION_INVALID`).

## Code Changes

- `src/server/routes/workflow.ts`
  - Added room-scoped idempotency keying.
  - Added workflow-history-backed semantic contract verification.
  - Added `decision_source` allowlist enforcement.
  - Added `workflow_room_id` metadata into dispatch message for observability.

- `src/tests/unit/workflow/workflowRoute.test.ts`
  - Added workflow-state fixture helper (`writeWorkflowState`) to support semantic validation tests.
  - Added regression: cross-room replay isolation.
  - Added regression: forged `decision_source` fail-closed.
  - Added regression: forged role/actor mismatch fail-closed.

## TC Mapping Update

- `TC-IDEMP-001` (replay no duplicate wake-up):
  - Extended with room-isolation regression (`same event_id` across room-1/room-2 both dispatch once).
- `TC-SEC-001` (contract tampering rejected):
  - Added forged `decision_source` rejection.
  - Added forged role/actor mismatch rejection.

## Self-Test Evidence

```bash
npm run test -- src/tests/unit/workflow/workflowRoute.test.ts
npm run build:server
```

- Result: PASS
  - Vitest: `src/tests/unit/workflow/workflowRoute.test.ts` now passes with 8 tests.
  - TypeScript build: success.
