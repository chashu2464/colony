# Stage 4 Reverse Briefing (QA -> Developer)

- Task ID: `df22275d`
- Date: `2026-03-31`
- Role: `qa_lead`
- Source of truth:
  - `docs/workflow/task-df22275d/architect-design.md`
  - `docs/workflow/task-df22275d/developer-stage3-forward-briefing-2026-03-31.md`

## 1) QA Reverse Understanding (Design Replay)

QA 对方案 B 的复述如下，目标是验证与开发/架构口径完全一致：

1. 阶段推进仍以 `dev-workflow` 状态变更为单一真相源（source of truth）。
2. 每次阶段变更必须产出唯一 `WORKFLOW_STAGE_CHANGED` 事件，并携带最小完整契约字段：
   - `event_id`
   - `from_stage`, `to_stage`
   - `next_actor_role`, `next_actor`
   - `decision_source`
3. 唤醒目标必须是显式决策：由阶段角色映射 + assignments 解析，禁止隐式 fallback。
4. 执行编排采用“状态先落盘，通知后派发”的队列式交接，通知是派生动作而非状态真相。
5. dispatch 失败不回滚阶段状态，但必须记录可重放证据（按 `event_id` 查询和重试）。

## 2) Fail-Closed Red Lines (QA 复述)

以下规则为硬门禁，不允许“降级放行”：

1. assignment 缺失时必须阻断并返回 `WF_ROUTING_MISSING_ASSIGNMENT`。
2. 目标 actor 不可路由时必须阻断并返回 `WF_ROUTING_NON_ROUTABLE_AGENT`。
3. 事件契约字段缺失/非法时 route 必须返回 `400` + `WF_STAGE_TRANSITION_INVALID`。
4. 派发失败必须留痕 `WF_EVENT_DISPATCH_FAILED`，禁止静默成功。
5. 全链路审计必须可由 `event_id` 追踪“阶段变化 -> 路由决策 -> 派发结果”。

## 3) Stage 5 输入的测试策略骨架（Given-When-Then）

说明：完整测试用例将在 Stage 5 单独落盘；此处先固化 Stage 4 对测试覆盖范围的对齐结果。

### 3.1 正常流程

- Given 阶段映射与 assignments 完整且目标 actor 可路由
- When 执行 `dev-workflow next`
- Then 产生唯一 stage-change 事件，且 `next_actor` 与映射一致，dispatch 成功并写入审计字段

### 3.2 异常流程

- Given `to_stage` 对应角色 assignment 为空
- When 执行 `dev-workflow next`
- Then 返回 `WF_ROUTING_MISSING_ASSIGNMENT`，且不发送唤醒消息

- Given assignment 指向不可路由 actor
- When 执行 `dev-workflow next`
- Then 返回 `WF_ROUTING_NON_ROUTABLE_AGENT`，且不发送唤醒消息

- Given route 收到缺失必填字段的事件 payload
- When 调用 `POST /api/workflow/event`
- Then 返回 `400` + `WF_STAGE_TRANSITION_INVALID`，并输出结构化错误日志

### 3.3 边界条件

- Given `from_stage=8` 到终态、或 `backtrack` 跨阶段跳转
- When 触发 stage-change 事件
- Then 审计字段完整且路由决策与目标阶段负责人一致，不出现历史阶段残留路由

- Given 同一 `event_id` 发生重复投递（重放）
- When 执行重放逻辑
- Then 不产生角色错投递，且可区分首次派发与重放结果

### 3.4 安全审查（OWASP 导向）

- Given 外部输入尝试注入非法 `next_actor`、伪造 `event_id` 或污染 `decision_source`
- When route 进行契约校验
- Then 非法输入被 fail-closed 拒绝并记录审计（防 A01/Broken Access Control、A09/Security Logging Failures）

- Given 业务侧尝试依赖隐式 fallback 绕过责任人边界
- When 触发流程推进
- Then 系统阻断并返回 machine-readable 错误码，避免 silent privilege drift

### 3.5 性能与稳定性

- Given 常规低频阶段推进（单任务个位数）
- When 连续执行多次 stage transition
- Then 事件路由和派发延迟保持稳定，日志可检索性不退化（按 `event_id` 关联）

## 4) QA 审核结论与开发执行对齐

1. QA 已确认开发 Stage 3 的设计讲解与架构文档一致。
2. QA 已确认“不回滚状态、可重放通知”的恢复策略可接受，前提是日志和错误码完整落地。
3. QA 将在 Stage 5 输出覆盖所有分支组合的可执行用例，含异常路径与边界值，不仅测 happy path。

## 5) Stage 4 门禁声明

- 门禁结论：`PASS`（允许从 Stage 4 推进到 Stage 5）
- 已验证场景（设计一致性层）：
  - 确定性路由契约字段完整性
  - fail-closed 错误码与阻断语义
  - 阶段状态与通知动作解耦策略
  - 审计可观测性主键（`event_id`）链路
- 遗留风险（进入实现后需在 Stage 6/7 清零）：
  - 风险 1：实现层若遗漏字段校验，可能出现脏事件入站
  - 风险 2：dispatch 失败处理若仅打日志不入 history，会破坏可追溯性
  - 风险 3：重放机制若无幂等约束，可能引发重复唤醒

