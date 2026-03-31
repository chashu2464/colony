# Stage 7 Integration Testing Report (QA)

- Task ID: `df22275d`
- Task: `Proposal B: Flow Transition Orchestration Alignment`
- Stage: `7. Integration Testing`
- Date: `2026-03-31`
- Owner: `qa_lead`
- Scope baseline: `docs/workflow/task-df22275d/qa-stage5-test-cases-2026-03-31.md`

## 1) Execution Summary

Executed on task worktree: `/Users/casu/Documents/Colony/.worktrees/task-df22275d`

### Commands

```bash
npm run build:server
npm run test -- src/tests/unit/workflow/workflowRoute.test.ts
```

Result:
- `build:server`: PASS
- `workflowRoute.test.ts`: PASS (5/5)

Additional black-box integration/security reproductions were executed to validate Stage 5 `IDEMP` + `SEC` requirements.

## 2) Findings (Ordered by Severity)

## P1-SEC-DF22275D-001 Cross-room idempotency collision (NOT FIXED)

- Related TC IDs: `TC-IDEMP-001`, `TC-SEC-002`
- Risk: event replay idempotency is keyed globally by `event_id` only, causing room-B wake-up to be incorrectly suppressed when room-A has already dispatched same `event_id`.
- OWASP mapping: A01 (Broken Access Control) / A04 (Insecure Design)

### Given-When-Then Repro

- Given:
  - two distinct rooms (`room-a`, `room-b`) with routable target agent;
  - same `event_id = wf-cross-room-collision`.
- When:
  - POST `WORKFLOW_STAGE_CHANGED` for `room-a` with `event_id` above;
  - POST same payload for `room-b` with same `event_id`.
- Then (actual):
  - first call `200 success`;
  - second call `200` with `status=duplicate_ignored`;
  - only one wake-up message sent (room-a only).
- Then (expected):
  - room-b must be treated as an independent dispatch domain and receive its own wake-up.

### Evidence

- Router log:
  - `Workflow stage transition event accepted ... roomId: 'room-a' ...`
  - `Workflow event replay ignored ... roomId: 'room-b' ...`
- Response/effect:
  - second response: `status: duplicate_ignored`
  - `sentCount: 1` (only room-a dispatched)

## P1-SEC-DF22275D-002 Forged routing semantics accepted (NOT FIXED)

- Related TC IDs: `TC-SEC-001`
- Risk: route accepts forged `decision_source` and role/actor semantic mismatch (`next_actor_role=architect`, `next_actor=developer`) and still dispatches successfully.
- OWASP mapping: A01 (Broken Access Control) / A04 (Insecure Design) / A09 (Security Logging & Monitoring Failures - semantic trust gap)

### Given-When-Then Repro

- Given:
  - room has `architect` and `developer` agents;
  - forged payload with:
    - `next_actor_role = architect`
    - `next_actor = developer`
    - `decision_source = forged_client_payload`
- When:
  - POST payload to `/api/workflow/events`.
- Then (actual):
  - route returns `200 success`;
  - wake-up sent to `developer`;
  - forged `decision_source` preserved in response.
- Then (expected):
  - fail-closed reject (`400`) with deterministic reason code;
  - no wake-up should be emitted.

### Evidence

- Router log includes accepted forged values:
  - `next_actor_role: 'architect'`
  - `next_actor: 'developer'`
  - `decision_source: 'forged_client_payload'`
- Response status: `200`
- `sentCount: 1`

## 3) P0/P1 Mandatory Three Questions

## For P1-SEC-DF22275D-001

1. 修复内容（What changed）
- Idempotency key must be scoped by room and event identity, e.g. `idempotency_key = roomId + ':' + event_id` (or equivalent composite).
- Regression tests must assert:
  - same `event_id` across different rooms dispatches independently;
  - same `event_id` in same room remains duplicate-suppressed after success.

2. 引入原因（Why introduced）
- Dispatch audit map used `event_id` as a global key without multi-room isolation requirement encoded in contract.

3. 归因路径（How it escaped earlier gates）
- Existing Stage 6 unit tests covered single-room replay only; missing cross-room matrix branch in executable tests.

## For P1-SEC-DF22275D-002

1. 修复内容（What changed）
- Enforce semantic fail-closed validation:
  - `decision_source` allowlist (e.g. only `stage_map`);
  - role-to-actor consistency check (actor must match expected assignment or role membership constraint);
  - reject mismatched tuples with deterministic reason code.
- Add regression tests for forged metadata and role/actor mismatch.

2. 引入原因（Why introduced）
- Contract validation currently checks structure/type presence but not semantic integrity/trust boundaries.

3. 归因路径（How it escaped earlier gates）
- Stage 6 focused on structural contract and routability; semantic tamper cases were listed in Stage 5 design but not implemented as executable negative tests.

## 4) Gate Decision (Stage 7)

- Gate conclusion: `FAIL` (Block stage advancement)
- Blocking reason: 2 unresolved P1 security/idempotency defects.

### Verified scenarios in this round

1. `ERR` base fail-closed contract/routing checks (existing unit tests): PASS
2. `IDEMP` same-room replay suppression (existing unit tests): PASS
3. `IDEMP/SEC` cross-room replay isolation: FAIL (P1)
4. `SEC` forged routing metadata fail-closed: FAIL (P1)

### Residual risks

1. Unauthorized or malformed orchestration metadata can route wake-up to unintended actor while appearing successful.
2. Multi-room environments can experience silent wake-up drop under colliding `event_id`, impacting deterministic handoff guarantees.
3. Until semantic validation and scoped idempotency are fixed, Stage 8 go-live review is unsafe.

## 5) Required Developer Follow-up

Please fix both P1 defects and provide:

1. Code diff references (`workflow.ts` + related tests).
2. TC mapping for `TC-IDEMP-001` (cross-room isolation variant) and `TC-SEC-001` (forged metadata fail-closed).
3. Self-test evidence (commands + outputs + key response bodies) proving both paths are now fail-closed or correctly isolated.
