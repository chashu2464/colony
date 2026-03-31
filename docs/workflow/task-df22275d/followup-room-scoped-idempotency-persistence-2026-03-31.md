# Follow-up Task: Room-scoped Idempotency Persistence

## Context
Current workflow event idempotency audit is in-process memory only. Service restart clears replay records.
This is accepted for this release but must be hardened in a dedicated follow-up iteration.

## Goal
Implement persistent, room-scoped idempotency for workflow event dispatch without weakening fail-closed routing guarantees.

## Scope
1. Storage selection
- Preferred: Redis (shared, TTL-native, low-latency).
- Fallback: Postgres table (`workflow_event_idempotency`) with indexed composite key.
- Decision criteria: multi-instance consistency, operational cost, failure behavior, observability.

2. Key model
- Canonical key: `room_id:event_id`.
- Required fields: `room_id`, `event_id`, `dispatch_status`, `first_seen_at`, `last_seen_at`, `payload_hash`.
- Guardrail: reject replay when `payload_hash` differs for same key (tamper/mismatch detection).

3. TTL and cleanup
- Default retention: 7 days.
- Redis: native TTL on key write.
- Postgres: scheduled cleanup job + partial index for active retention window.
- Metrics: key count, cleanup duration, expired/evicted totals.

4. Restart recovery validation
- Verify replay protection survives process restart and rolling deployment.
- Verify duplicate suppression across at least 2 service instances.
- Verify retry behavior for prior `dispatch_status=failed` remains controlled and traceable.

5. Regression test matrix
- Functional: first dispatch, same-room replay, cross-room same event_id.
- Security: forged payload hash mismatch fail-closed.
- Fault: storage timeout/unavailable -> deterministic error code, no silent success.
- Boundary: TTL expiry after window allows fresh processing.
- Performance: P95 latency impact under sustained replay traffic.

## Deliverables
- Design note (`docs/workflow/task-<new-id>/stage2-idempotency-persistence-design.md`).
- Implementation + unit/integration tests.
- Runbook updates for TTL tuning and recovery verification.

## Acceptance Criteria
- Replay records survive restart.
- Cross-room isolation remains correct.
- Fail-closed behavior remains unchanged under storage failures.
- All matrix scenarios automated and passing in CI.
