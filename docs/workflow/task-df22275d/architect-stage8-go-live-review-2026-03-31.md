# Stage 8 Go-Live Review（Architect）

- Task ID: `df22275d`
- Stage: `8. Go-Live Review`
- Date: `2026-03-31`
- Reviewer: `architect`

## 1) 评审范围
- Stage 6 实现报告：`docs/workflow/task-df22275d/stage6-implementation-2026-03-31.md`
- Stage 7 修复报告：`docs/workflow/task-df22275d/stage7-p1-fixes-2026-03-31.md`
- Stage 7→8 状态与复测：`docs/workflow/task-df22275d/qa-stage7-stage8-flow-status-2026-03-31.md`
- 关键代码核对：
  - `skills/dev-workflow/scripts/handler.sh`
  - `src/server/routes/workflow.ts`
  - `src/tests/unit/workflow/workflowRoute.test.ts`

## 2) 架构决策复核（独立子决策）

### 决策 A：阶段流转路由必须确定性（pass）
- 结论：通过。
- 推导来源：`handler.sh` 在 `next` 前执行 `resolve_routing_decision`，并在 history 落盘 `routing.{next_actor_role,next_actor,decision_source}`。
- 一句话理由：先算清“该唤醒谁”，再推进状态，避免职责漂移。

### 决策 B：事件契约必须 fail-closed（pass）
- 结论：通过。
- 推导来源：`workflow.ts` 对缺字段/非法类型/非法来源/语义不一致统一 400 阻断并给 machine-readable reason（`WF_STAGE_TRANSITION_INVALID` / `WF_ROUTING_NON_ROUTABLE_AGENT`）。
- 一句话理由：输入不可信时宁可拒绝，不允许“带病派发”。

### 决策 C：幂等必须 room 作用域隔离（pass）
- 结论：通过。
- 推导来源：路由层幂等键为 `roomId:event_id`；单测已覆盖跨房间同 event_id 双成功派发场景。
- 一句话理由：同一 event_id 在不同房间代表不同业务上下文，必须隔离。

### 决策 D：派发失败不回滚阶段但必须可审计（pass）
- 结论：通过。
- 推导来源：`handler.sh` 先持久化阶段，再写 dispatch 审计状态（success/failed + reason），失败码 `WF_EVENT_DISPATCH_FAILED` 可观测。
- 一句话理由：阶段状态是业务真相，通知是派生动作，需解耦保障一致性。

## 3) 基础设施可行性检查
- 当前机制：HTTP route + room system message + workflow history 审计，吞吐目标是“阶段事件级”而非高频流。
- 结论：满足本次设计意图（低频、强一致门禁、可追踪唤醒）。
- 依据：当前事件密度为阶段切换粒度，远低于消息流式推送压力级别。

## 4) 风险与处置
- 已关闭风险：
  1. 跨房间幂等冲突（已修复）
  2. forged metadata 伪造路由（已修复）
- 残余风险（非本次阻断）：幂等审计为进程内存，服务重启后 replay 记录重置。
- 处置建议（Phase 2）：将幂等键持久化至 workflow store 或独立 KV（TTL）。

## 5) Go-Live 结论
- Gate 决策：**APPROVED（通过）**
- 发布建议：允许从 Stage 8 进入 Completed。
