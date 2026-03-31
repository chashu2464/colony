# Stage 3 Forward Briefing (Developer -> QA)

- Task ID: `df22275d`
- Date: `2026-03-31`
- Source of truth: `docs/workflow/task-df22275d/architect-design.md`

## 1) Design Intent (What must stay deterministic)
- Stage transition emits exactly one `WORKFLOW_STAGE_CHANGED` event.
- Event must carry `event_id`, `from_stage`, `to_stage`, `next_actor_role`, `next_actor`, `decision_source`.
- Target wake-up is explicit: next actor comes from stage-role mapping + assignment lookup, not implicit fallback.
- Handoff is queue-based: state transition is the source-of-truth, dispatch is derived and auditable.

## 2) Fail-Closed Boundaries (Non-negotiable)
- Missing assignment must block with `WF_ROUTING_MISSING_ASSIGNMENT`.
- Non-routable actor must block with `WF_ROUTING_NON_ROUTABLE_AGENT`.
- Invalid or missing route payload fields must return 400 with `WF_STAGE_TRANSITION_INVALID`.
- Dispatch failure must record `WF_EVENT_DISPATCH_FAILED`; do not silently succeed.

## 3) Why these decisions
- No implicit fallback actor: preserves role responsibility and prevents silent mis-routing.
- Contract validation before dispatch: prevents dirty events from entering room message flow.
- Transition state is not rolled back on dispatch failure: keeps business truth stable and supports replay by `event_id`.

## 4) QA Verification Matrix (must cover all branches)
1. Normal path: Stage N->N+1 dispatches to expected `next_actor` with complete contract fields.
2. Missing assignment: `next` blocks and returns `WF_ROUTING_MISSING_ASSIGNMENT`.
3. Non-routable actor: returns `WF_ROUTING_NON_ROUTABLE_AGENT` and no wake-up is sent.
4. Event contract broken: route rejects with 400 + `WF_STAGE_TRANSITION_INVALID`.
5. Dispatch transport failure: status records `WF_EVENT_DISPATCH_FAILED`, and event can be replayed by `event_id`.

## 5) Evidence and Audit Points for Stage 4
- Confirm history contains routing and dispatch audit fields:
  - `event_id`
  - `routing.{next_actor_role,next_actor,decision_source}`
  - `dispatch.{status,dispatched_at,failure_reason?}`
- Confirm no hidden fallback path exists in `handler.sh` and route handler.
- Confirm observability logs are queryable by `event_id`.
