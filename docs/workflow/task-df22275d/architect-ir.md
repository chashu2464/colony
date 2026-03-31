# Proposal B: Flow Transition Orchestration IR（Architect）

- Task ID: `df22275d`
- Stage: 1 (Initial Requirements)
- Date: `2026-03-31`
- 分类：新功能（流程编排增强）

## 1. 目标与边界
### 目标
在不重构核心运行时的前提下，落地“阶段推进后可确定唤醒下一责任 agent”的编排机制，并保证失败可审计、可回滚。

### 边界
- In Scope（Phase 1）
  - `dev-workflow` 阶段推进触发链路增强
  - 阶段->角色->agent 的确定性路由契约
  - 触发事件审计字段与错误码标准化
- Out of Scope（Phase 2）
  - `quick-task` 联动
  - 通用异步任务中台重构

## 2. 现状与约束
### 现状证据
- `skills/dev-workflow/scripts/handler.sh` 已在 `next/backtrack` 后调用 `notify_server`，发出 `WORKFLOW_STAGE_CHANGED` 事件。
- `src/server/routes/workflow.ts` 接收事件并 `room.sendSystemMessage(..., [next_actor])`，通过 mention 路由唤醒目标 agent。

### 约束
1. 现有机制是“单目标唤醒”（同轮最多首个可路由 agent）。
2. 不能破坏现有 0-9 阶段模型。
3. 必须 fail-closed：路由决策不完整时禁止静默推进。

## 3. 核心需求（冻结）
1. **确定性路由需求**
   - 输入：`from_stage`, `to_stage`, `assignments`
   - 输出：唯一 `next_actor`
   - 约束：若 `next_actor` 缺失或不可路由，返回阻断原因并停止自动唤醒。

2. **审计需求**
   - 每次阶段推进必须落审计字段：
     - `event_id`
     - `from_stage`
     - `to_stage`
     - `next_actor_role`
     - `next_actor`
     - `decision_source`（stage_map/manual_override）

3. **失败闭环需求**
   - machine-readable 错误码：
     - `WF_ROUTING_MISSING_ASSIGNMENT`
     - `WF_ROUTING_NON_ROUTABLE_AGENT`
     - `WF_EVENT_DISPATCH_FAILED`
     - `WF_STAGE_TRANSITION_INVALID`

4. **可观测性需求**
   - 必须能按 `event_id` 查询“阶段变化 -> 通知投递 -> agent 接收”链路。

## 4. 子决策（按三原则独立呈现）
### 决策 A：保持“状态持久化优先，再触发通知”
- 结论：保留先写 workflow state、后 notify 的顺序。
- 推导来源：当前 `handler.sh` 已先更新 `.current_stage` 再 `notify_server`，该顺序天然避免“消息先到、状态未落盘”的竞态。
- 一句话理由：先持久化可保证通知到达时读取到新状态，降低乱序风险。

### 决策 B：路由保持单目标，不做 fan-out
- 结论：Phase 1 继续单目标唤醒。
- 推导来源：`ChatRoom` 当前 mention routing 只向首个可路由 agent 投递，改 fan-out 会扩大行为面。
- 一句话理由：单目标最符合现有阶段负责人模型，最小变更可控。

### 决策 C：缺失映射 fail-closed
- 结论：`next_actor` 解析失败时中断自动唤醒并记录错误码。
- 推导来源：当前系统以角色分工驱动阶段执行，缺失映射继续推进会造成“空转阶段”。
- 一句话理由：宁可阻断也不允许 silent drop，保证流程可恢复。

## 5. 验收标准
1. Stage 推进后，系统消息中被 mention 的 `next_actor` 与阶段映射一致。
2. 当 assignment 缺失时，不会发送误通知，且返回 `WF_ROUTING_MISSING_ASSIGNMENT`。
3. 当目标 agent 不可路由时，不会默认转给其他 agent，返回 `WF_ROUTING_NON_ROUTABLE_AGENT`。
4. 审计日志可按 `event_id` 串起完整链路。

## 6. 基础设施可行性检查
- 当前执行频率：stage 事件属低频操作（单任务通常个位数推进），远低于消息主链路吞吐。
- 结论：现有 HTTP 回调 + 房间消息路由可承载 Phase 1，无需新增调度器。
- 一句话理由：低频控制面事件可复用现有基础设施，收益/风险比最佳。
