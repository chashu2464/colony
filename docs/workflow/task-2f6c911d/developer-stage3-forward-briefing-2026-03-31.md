# Stage 3 Forward Briefing（Developer -> QA）

- Task ID: `2f6c911d`
- Stage: 3 (Forward Briefing)
- Date: `2026-03-31`
- Briefing Owner: `developer`
- Audience: `qa_lead`

## 1. 目标
本阶段目标是把 Stage 2 架构蓝图转成可测试语义，确保 QA 在 Stage 4/5 能基于一致口径完成复述与测试设计。

## 2. 范围与非范围
### In Scope
- 新 5 阶段模型（Discovery/Design/Build/Verify/Release）在控制面的行为约束
- `workflow_version=v2` 下的路由、门禁、审计字段
- 扩展模式：board mode 与 cross-agent mode 的可测边界

### Out of Scope
- 业务执行器重构
- 历史 v1 任务批量迁移
- 分布式调度系统重建

## 3. Stage 2 设计冻结点（供 QA 复述）
1. 仅新任务启用 v2，旧任务保留 v1（双轨并存）。
2. Stage owner 才能推进 `next`，协作者仅可更新任务卡/评审。
3. 缺 assignment/evidence/review 必须 fail-closed。
4. Release 进入 Completed 后属于终态，禁止重复 `next`。

## 4. QA 复述时必须覆盖的契约
### 4.1 State Contract（status 可见）
- 必须包含：`workflow_version`, `current_stage`, `stage_name`, `assignments`。
- 扩展挂载：`extensions.board_mode`, `extensions.cross_agent_mode`。
- 兼容要求：v1/v2 由 `workflow_version` 单入口分派，不允许散落条件分支。

### 4.2 Stage Change Event Contract（事件可审计）
- 必须可追踪：`roomId`, `from_stage`, `to_stage`, `next_actor_role`, `next_actor`, `event_id`, `decision_source`。
- 期望能力：可通过 `event_id` 串联阶段推进、路由与消息派发记录。

### 4.3 Handoff Contract（跨角色交接）
- 输入：`contract_v2`, `test_matrix`。
- 输出：`implementation`, `evidence`。
- 风险域：`state_conflict`, `missing_assignment`。

## 5. QA 测试设计导向（Stage 5）
### 5.1 正常路径
- v2 新任务可从 Discovery 顺序推进至 Release，再进入 Completed。
- owner 与 next actor 路由一致且可审计。

### 5.2 异常路径（必须 fail-closed）
- assignment 缺失。
- evidence 缺失或路径无效。
- 必要 review 缺失。
- 非 owner 尝试推进阶段。

### 5.3 边界路径
- Stage 9/Completed 终态再次调用 `next`。
- v1/v2 并存下的 status/next 行为隔离。
- `board.blocked` 缺 `block_reason` 或 `owner` 时的校验拒绝。

### 5.4 并发路径
- 并发 status/update/next 下锁竞争处理与错误码稳定性。
- 同一修复动作重复触发时保持幂等，不产生重复修复副作用。
## 6. 附加约束（需纳入 QA 验证）
1. 错误语义稳定且可监控：
   - 相同输入错误产生相同错误分类与退出码。
   - 错误字段可用于告警聚合（避免 message-only 语义）。
2. 回退读取只读化：
   - 允许从主仓读取状态作为 fallback。
   - 禁止 fallback 路径写回覆盖主仓状态文件。
3. 并发原子性：
   - 修复/补齐流程须具备幂等与原子写保障。
   - 避免并发下重复补齐导致状态抖动。

## 7. Stage 4 对齐检查清单（QA 复述验收）
- 能准确复述 5 阶段 owner 与推进权限边界。
- 能明确说明 v1/v2 双轨兼容入口（`workflow_version`）。
- 能列出正常/异常/边界/并发四类测试矩阵。
- 能明确终态 Stage 9 仅 status 核验，禁止重复 next。
- 能说明 board/cross-agent 为可选扩展，不破坏主链路。

## 8. 证据与参考
- `docs/workflow/task-2f6c911d/architect-ir-2026-03-31.md`
- `docs/workflow/task-2f6c911d/architect-design-2026-03-31.md`
- `docs/workflow/task-2f6c911d/artifacts/2f6c911d-ucd.md`
- 本文档（Stage 3 交底证据）

## 9. WHY（交底理由）
先对齐“可测试契约”再进入 QA 复述与测试设计，能降低阶段间语义偏差，避免在 Stage 6/7 才暴露设计理解不一致导致的返工。
