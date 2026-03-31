# Stage 5 Test Case Design (QA)

- Task ID: `df22275d`
- Task: `Proposal B: Flow Transition Orchestration Alignment`
- Stage: `5. Test Case Design`
- Date: `2026-03-31`
- Owner: `qa_lead`
- Upstream References:
  - `docs/workflow/task-df22275d/architect-design.md`
  - `docs/workflow/task-df22275d/developer-stage3-forward-briefing-2026-03-31.md`
  - `docs/workflow/task-df22275d/qa-stage4-reverse-briefing-2026-03-31.md`

## 1. Scope and Test Objectives

This test suite validates Proposal B alignment on five non-negotiable properties:

1. Deterministic stage transition emits a complete and traceable event contract.
2. Explicit target wake-up is derived from stage-role map + assignment (no implicit fallback).
3. Queue-based handoff keeps workflow state as truth and dispatch as auditable derived action.
4. Fail-closed behavior blocks invalid routing/contract paths with machine-readable reasons.
5. Replay path is idempotent and auditable by `event_id` without duplicate wake-up side effects.

## 2. System Under Test (SUT)

- `skills/dev-workflow/scripts/handler.sh`
- `src/server/routes/workflow.ts`
- Workflow state file: `.data/workflows/<roomId>.json`
- Event route endpoint: `POST /api/workflow/events`

## 3. Branch-Complete Decision Matrix

`A`: assignment exists  
`B`: actor routable  
`C`: event contract valid  
`D`: dispatch transport success  
`E`: replay duplicate (`event_id` seen before)

| Case | A | B | C | D | E | Expected Result |
|---|---|---|---|---|---|---|
| BM-01 | Y | Y | Y | Y | N | Stage advances, event emitted once, wake-up sent once, dispatch success audited |
| BM-02 | N | - | - | - | - | Block with `WF_ROUTING_MISSING_ASSIGNMENT`, no wake-up |
| BM-03 | Y | N | - | - | - | Block with `WF_ROUTING_NON_ROUTABLE_AGENT`, no wake-up |
| BM-04 | Y | Y | N | - | - | Route rejects `400` + `WF_STAGE_TRANSITION_INVALID`, no wake-up |
| BM-05 | Y | Y | Y | N | N | Stage remains advanced, dispatch failure audited as `WF_EVENT_DISPATCH_FAILED` |
| BM-06 | Y | Y | Y | Y | Y | Replay accepted as idempotent check, no duplicate wake-up |
| BM-07 | Y | Y | Y | N | Y | Replay path records retry/failure without state rollback |

Note: `-` means branch is not reachable because earlier fail-closed gate already blocks execution.

## 4. Test Data and Preconditions

1. Room has valid participant mapping:
   - `architect`, `developer`, `qa_lead`, `designer`.
2. Test room has deterministic baseline workflow state at Stage `N`.
3. Ability to inspect:
   - workflow history entries;
   - server route logs by `event_id`;
   - room system message records.
4. Fault injection capability for dispatch transport failure (`curl` to dead port, or mock route failure).
5. Replay test utility (resend same `event_id` payload).

## 5. Given-When-Then Test Cases

## 5.1 Normal Flow

### TC-FUNC-001 Deterministic Transition + Explicit Wake-up
- Given:
  - Workflow at Stage `N`;
  - assignment for `to_stage` role is present and routable;
  - payload contract fields are complete.
- When:
  - run `dev-workflow next` to Stage `N+1`.
- Then:
  - exactly one `WORKFLOW_STAGE_CHANGED` event is emitted;
  - event includes `event_id`, `from_stage`, `to_stage`, `next_actor_role`, `next_actor`, `decision_source`;
  - room receives one system wake-up for the resolved `next_actor`;
  - workflow history contains:
    - `event_id`;
    - `routing.{next_actor_role,next_actor,decision_source}`;
    - `dispatch.{status=success,dispatched_at}`.

### TC-FUNC-002 Stage Truth vs Dispatch Derivation
- Given:
  - deterministic stage transition succeeds.
- When:
  - inspect workflow state and dispatch audit after transition.
- Then:
  - state transition persists independently of message transport internals;
  - dispatch is represented as derived/audited action (not a hidden side effect).

## 5.2 Exception Flow (Fail-Closed)

### TC-ERR-001 Missing Assignment Blocks Transition Notification
- Given:
  - `to_stage` role assignment is empty.
- When:
  - run `dev-workflow next`.
- Then:
  - operation returns block reason `WF_ROUTING_MISSING_ASSIGNMENT`;
  - no wake-up system message is sent;
  - no fallback actor is selected;
  - audit contains block details for root-cause tracing.

### TC-ERR-002 Non-routable Actor Blocks Notification
- Given:
  - assignment points to unknown/unroutable actor.
- When:
  - run `dev-workflow next`.
- Then:
  - operation returns `WF_ROUTING_NON_ROUTABLE_AGENT`;
  - no system wake-up is sent;
  - no implicit fallback to other agents.

### TC-ERR-003 Invalid Event Contract Rejected by Route
- Given:
  - route receives payload missing one required field (parameterized per field):
    - `event_id`, `from_stage`, `to_stage`, `next_actor_role`, `next_actor`, `decision_source`.
- When:
  - call `POST /api/workflow/events`.
- Then:
  - response is `400` + `WF_STAGE_TRANSITION_INVALID`;
  - route writes structured log with reject reason and correlation context;
  - no room wake-up is emitted.

### TC-ERR-004 Dispatch Failure is Audited and Recoverable
- Given:
  - transition and contract validation pass;
  - dispatch transport is intentionally failed.
- When:
  - trigger transition.
- Then:
  - transition state remains committed;
  - dispatch result logged as `WF_EVENT_DISPATCH_FAILED`;
  - `failure_reason` exists and is machine-readable;
  - replay by same `event_id` is possible.

## 5.3 Boundary Conditions

### TC-BND-001 Stage 8 to Completed Routing Correctness
- Given:
  - workflow at Stage `8`;
  - architect assignment configured.
- When:
  - attempt completion transition.
- Then:
  - routing target remains architect (or explicit legacy rule where documented), no silent reassignment;
  - audit fields complete and queryable.

### TC-BND-002 Backtrack Cross-Stage Routing Re-evaluation
- Given:
  - workflow progressed beyond Stage `N`;
  - backtrack to `target_stage < current_stage`.
- When:
  - execute backtrack and then `next`.
- Then:
  - routing recomputes from current stage map and current assignments;
  - no stale historical `next_actor` leakage.

### TC-BND-003 Lock Timeout Under Concurrency
- Given:
  - two concurrent actions trying to mutate same workflow state.
- When:
  - hold lock in one process and trigger second mutation action.
- Then:
  - second action fails with standardized timeout (`exit_code=3`);
  - state file remains valid JSON and not partially written.

### TC-BND-004 Corrupted State Fail-Closed
- Given:
  - workflow state file is invalid JSON.
- When:
  - invoke workflow status or transition action.
- Then:
  - handler fails with `exit_code=4`;
  - recovery hint points to `.backup`;
  - no further state mutation occurs.

## 5.4 Replay and Idempotency

### TC-IDEMP-001 Same event_id Replay Does Not Duplicate Wake-up
- Given:
  - one successful dispatch already exists for `event_id=X`.
- When:
  - replay route call with same `event_id=X`.
- Then:
  - no second wake-up is sent to same actor for same event semantics;
  - audit marks replay attempt distinctly (`replay=true` or equivalent retry marker);
  - original transition truth is unchanged.

### TC-IDEMP-002 Replay After Failure Produces Controlled Retry
- Given:
  - initial dispatch failed with `WF_EVENT_DISPATCH_FAILED` for `event_id=Y`.
- When:
  - replay event `Y`.
- Then:
  - retry result is tracked with timestamp and status;
  - no stage rollback occurs;
  - duplicate routing side effects are prevented.

## 5.5 Security Review (OWASP-Oriented)

### TC-SEC-001 Contract Tampering Rejected (A01/A09)
- Given:
  - forged payload attempts to alter `next_actor` or `decision_source`.
- When:
  - send payload to workflow route.
- Then:
  - payload is rejected fail-closed (`400` + deterministic reason code);
  - rejection event is audit-logged with correlation keys.

### TC-SEC-002 Unauthorized Actor Injection Blocked (A01)
- Given:
  - attacker injects actor id not in room membership.
- When:
  - route/handler resolves target wake-up.
- Then:
  - system blocks with `WF_ROUTING_NON_ROUTABLE_AGENT`;
  - no wake-up message is published.

### TC-SEC-003 Log Integrity and Minimal Disclosure (A09)
- Given:
  - invalid requests are repeatedly submitted.
- When:
  - inspect route logs and workflow history.
- Then:
  - logs include enough forensic fields (`event_id`, reason, stage pair, actor);
  - logs avoid leaking sensitive internals (tokens, credentials, stack secrets).

### TC-SEC-004 Fail-Closed on Unknown Event Type
- Given:
  - route receives unknown `type`.
- When:
  - call event endpoint.
- Then:
  - request rejected with `400`;
  - no downstream notification dispatch.

## 5.6 Performance and Stability

### TC-PERF-001 Transition-to-Dispatch Latency Baseline
- Given:
  - stable local test environment and valid routing.
- When:
  - execute 50 sequential stage transitions in synthetic test rooms.
- Then:
  - p95 transition-to-dispatch latency remains within agreed baseline;
  - no monotonic degradation across run segments.

### TC-PERF-002 Replay Throughput Safety
- Given:
  - burst of replay requests for existing `event_id`s.
- When:
  - execute replay batch.
- Then:
  - no duplicate wake-up storms;
  - CPU/memory remain within expected test envelope;
  - audit remains queryable by `event_id`.

## 6. Execution Notes (for Stage 6/7)

1. Prioritize TC groups in this order: `ERR` -> `IDEMP` -> `SEC` -> `FUNC` -> `BND` -> `PERF`.
2. For every failing case, capture:
   - command/request payload;
   - response body + exit code;
   - workflow history delta;
   - room message evidence.
3. All assertions must be deterministic and machine-verifiable (avoid visual/manual-only conclusions).

## 7. Bug Report Template (Mandatory for Findings)

Use this template for each discovered bug:

- Bug ID:
- Severity: `P0|P1|P2`
- Related TC IDs:
- Repro Steps:
  1. Given ...
  2. When ...
  3. Then ... (actual vs expected)
- Evidence:
  - command / request payload
  - response / log snippets
  - file path references
- Impact:
- Proposed Fix:

For `P0/P1`, append mandatory three questions:
1. 修复内容（What changed）
2. 引入原因（Why introduced）
3. 归因路径（How it escaped earlier gates）

## 8. Stage 5 Gate Statement

- Gate conclusion: `PASS` (test-case design completed, branch-complete coverage defined)
- Verified as covered by design:
  - normal path
  - exception path (fail-closed)
  - boundary conditions
  - replay/idempotency
  - security review
  - performance/stability baseline
- Residual risks (to clear in Stage 6/7 execution):
  1. Current code still lacks full contract fields (`event_id`, `next_actor_role`, `decision_source`) in live route payload.
  2. Replay idempotency enforcement details must be implemented before Stage 7 acceptance.
  3. Structured dispatch audit fields in workflow history require implementation verification.
