# Proposal B: Flow Transition Orchestration 设计文档（Architect）

- Task ID: `df22275d`
- Stage: 2 (System/Architectural Design)
- Date: `2026-03-31`

## 1. 架构总览
目标链路：
1) `dev-workflow next/backtrack` 完成状态变更
2) 生成标准化 stage-change 事件
3) workflow event route 验证路由目标
4) 通过系统消息 mention 唤醒下一责任 agent
5) 记录审计与失败原因

## 2. 接口契约
### 2.1 Stage Change Event Contract
```json
{
  "type": "WORKFLOW_STAGE_CHANGED",
  "roomId": "string",
  "from_stage": 0,
  "to_stage": 1,
  "next_actor_role": "architect|developer|qa_lead|designer",
  "next_actor": "agent_id",
  "event_id": "wf_xxx",
  "decision_source": "stage_map"
}
```

### 2.2 错误契约
```json
{
  "result": "block",
  "reason": "WF_ROUTING_MISSING_ASSIGNMENT",
  "details": ["assignment for role developer is empty"]
}
```

## 3. 数据模型
### 3.1 审计字段（写入 workflow history）
- `event_id: string`
- `routing: { next_actor_role, next_actor, decision_source }`
- `dispatch: { status, dispatched_at, failure_reason? }`

### 3.2 路由决策结构
- `required_role: string`
- `resolved_actor_id: string | null`
- `is_routable: boolean`
- `block_reason?: string`

## 4. 组件改造点
1. `skills/dev-workflow/scripts/handler.sh`
   - 在 `notify_server` 载荷中补充 `event_id/next_actor_role/decision_source`
   - 目标解析失败时返回标准错误码并停止通知

2. `src/server/routes/workflow.ts`
   - 校验事件契约字段完整性
   - 非法/缺失字段 fail-closed
   - 投递成功/失败写结构化日志（带 `event_id`）

3. `docs/workflow/task-df22275d/*`
   - 固化 Stage 3 briefing 的输入与测试断言映射

## 5. 安全与稳定性设计
### 决策 1：输入校验前置
- 结论：route 层先校验 contract，再写消息。
- 来源：当前回调入口已做 type/roomId 基础校验，补齐字段校验即可。
- 理由：避免脏事件污染房间消息流。

### 决策 2：禁止隐式 fallback actor
- 结论：目标不可路由时不自动改投默认 agent。
- 来源：多角色分工任务若 fallback 会破坏职责边界。
- 理由：职责确定性优先于“看起来继续运行”。

### 决策 3：可恢复失败
- 结论：通知失败只阻断唤醒，不回滚阶段；由重放机制重新发事件。
- 来源：阶段状态是业务真相，通知是派生动作。
- 理由：分离“状态正确性”与“通知可达性”，降低恢复复杂度。

## 6. 测试设计（给 QA/开发）
1. 正常链路：Stage N->N+1，`next_actor` 被正确 mention。
2. assignment 缺失：返回 `WF_ROUTING_MISSING_ASSIGNMENT`。
3. actor 不可路由：返回 `WF_ROUTING_NON_ROUTABLE_AGENT`。
4. 事件字段缺失：route 返回 400，记录 `WF_STAGE_TRANSITION_INVALID`。
5. 通知失败：记录 `WF_EVENT_DISPATCH_FAILED`，可按 `event_id` 重放。

## 7. 实施顺序（Phase 1）
1. 开发：补齐 handler 事件契约与错误码。
2. 开发：补齐 workflow route 校验与日志。
3. QA：按 5 条测试矩阵验证。
4. 架构：Stage 8 做可观测性与职责一致性验收。
