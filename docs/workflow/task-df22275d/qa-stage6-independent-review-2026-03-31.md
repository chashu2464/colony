# Stage 6 QA Independent Review (qa_lead)

- Task ID: `df22275d`
- Date: `2026-03-31`
- Reviewer: `qa_lead` (independent review, not implementation author)
- Scope: Proposal B Stage 6 implementation verification (`ERR + IDEMP + SEC + FUNC` core paths)

## Verification Executed

1. `npm run test -- src/tests/unit/workflow/workflowRoute.test.ts`  
   Result: PASS (5/5)
2. `npm run build:server`  
   Result: PASS
3. Additional black-box replay/security checks against built route:
   - Multi-room same `event_id` collision replay test
   - Forged routing payload acceptance test (`next_actor_role`/`decision_source`)

## Findings (Primary)

### P1-SEC-DF22275D-001 Cross-room idempotency collision causes missed wake-up

- Severity: P1
- Type: Functional correctness + multi-tenant isolation risk
- Location:
  - `src/server/routes/workflow.ts:7` (`eventDispatchAudit` key design)
  - `src/server/routes/workflow.ts:88` (`eventDispatchAudit.get(event_id)`)
  - `src/server/routes/workflow.ts:128,141` (`eventDispatchAudit.set(event_id, ...)`)
- Problem:
  - Idempotency key only uses `event_id`, not `(roomId,event_id)`.
  - Same `event_id` across different rooms is treated as replay and ignored.
  - This suppresses valid wake-up in the second room.
- Repro steps:
  1. Start route server with two existing rooms (`room-A`, `room-B`) and routable `developer`.
  2. POST valid event payload to `room-A` with `event_id=wf-same-id`.
  3. POST same payload (same `event_id`) to `room-B`.
  4. Observe second response returns `status=duplicate_ignored` and no message sent to `room-B`.
- Expected:
  - Room isolation must hold; replay scope should be per room (or globally unique guaranteed by trusted source + signature).
- Actual:
  - Second room event is dropped.
- Evidence:
  - Black-box run output shows `room-B` marked replay and `sent` only contains `room-A`.

#### P0/P1 三问

1. 修复内容：将幂等索引键从 `event_id` 改为 `roomId:event_id`（或结构化复合键），并补跨房间回归测试。
2. 引入原因：幂等实现未建模多房间命名空间，默认假设 `event_id` 全局唯一。
3. 归因路径：设计契约未明确“幂等作用域”，实现按最小字段落地，测试缺少跨房间组合场景。

---

### P1-SEC-DF22275D-002 Route accepts forged routing metadata (fail-open)

- Severity: P1
- Type: Security / trust-boundary validation gap
- Location:
  - `src/server/routes/workflow.ts:34-44` (contract only checks type/presence)
  - `src/server/routes/workflow.ts:67-86` (only checks actor is routable)
  - `src/server/routes/workflow.ts:124-136` (dispatches untrusted fields)
- Problem:
  - Route accepts arbitrary `decision_source` string and does not verify consistency between `next_actor_role` and `next_actor`.
  - Any caller that can hit endpoint can forge metadata and trigger wake-up to any routable agent.
- Repro steps:
  1. POST payload with:
     - `next_actor_role='qa_lead'`
     - `next_actor='developer'`
     - `decision_source='forged_by_client'`
  2. Ensure `developer` is routable in room.
  3. Observe response `200 success` and wake-up dispatched.
- Expected:
  - Fail-closed validation for trusted route source (at minimum enum validation + role/actor coherence, preferably signed/internal-only origin checks).
- Actual:
  - Forged metadata accepted and executed.
- Evidence:
  - Black-box run output returns success and sends mention to `developer` with forged metadata echoed.

#### P0/P1 三问

1. 修复内容：限制 `decision_source` 枚举（`stage_map`/`manual_override`），并校验 `next_actor_role` 与房间内 agent role 映射一致（或由服务端重新计算覆盖客户端字段）；补对应 SEC 用例。
2. 引入原因：将 endpoint 输入作为“可信内部事件”处理，缺乏边界防护。
3. 归因路径：安全模型未定义“调用者可信级别”，实现只做结构校验未做语义校验。

## Coverage/Quality Notes

- Existing Stage 6 unit tests覆盖了基础 ERR/IDEMP/FUNC 路径。
- Missing critical combinations:
  - Cross-room replay isolation
  - Forged semantic field rejection (`decision_source` / role-actor mismatch)

## Stage 6 Gate Decision

- Gate: `FAIL` (blocked for Stage 7 integration entry)
- Reason: 2 unresolved P1 findings (security + correctness)
- Required before Stage 7:
  1. Fix P1-SEC-DF22275D-001 + add regression test
  2. Fix P1-SEC-DF22275D-002 + add regression test
  3. Provide updated evidence mapping to TC-IDEMP / TC-SEC IDs

## Residual Risk (if waived, not recommended)

- Cross-room false replay can silently drop required wake-up events.
- Forged route metadata can cause unauthorized or incorrect agent wake-up if endpoint exposure broadens.

