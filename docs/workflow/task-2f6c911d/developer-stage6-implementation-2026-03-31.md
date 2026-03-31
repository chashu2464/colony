# Stage 6 Development Implementation（Developer）

- Task ID: `2f6c911d`
- Stage: 6 (Development Implementation)
- Date: `2026-03-31`
- Owner: `developer`

## 1. 实现目标
根据 Stage 2 设计与 Stage 5 测试矩阵，完成 Colony 新 5 阶段 workflow（`workflow_version=v2`）的控制面落地，并保持 v1 兼容。

## 2. 代码实现范围

### 2.1 dev-workflow 主处理器（`skills/dev-workflow/scripts/handler.sh`）
1. 引入 v1/v2 双轨阶段映射：
- `STAGES_V1`（原 0-9）
- `STAGES_V2`（Discovery/Design/Build/Verify/Release/Completed）

2. 新增版本化分派 helper：
- `workflow_version_or_default`
- `stages_count_for_version`
- `stage_name_for_version`
- `owner_role_for_stage`
- `stage_requires_approval`

3. `init` 支持并落盘：
- `workflow_version`（默认 `v1`）
- `extensions`（board/cross_agent 默认结构）

4. `next` 增强：
- owner-only 推进校验（非 owner 返回 `WF_PERMISSION_DENIED`）
- review gate 按版本执行（v2: Design/Verify/Release）
- 阶段上限、终态、阶段名按版本动态处理
- 历史记录增加 `workflow_version`

5. `update` 增强扩展校验：
- board.blocked 必须包含非空 `block_reason` 与 `owner`
- cross_agent.task_cards.status 限定为 `todo/in_progress/blocked/done`
- `task_cards` 上限控制（100）

6. workflow 事件派发补齐：
- `notify_server` 增加 `workflow_version` 字段

### 2.2 Workflow Event API（`src/server/routes/workflow.ts`）
1. 事件契约新增强校验：
- 新增必填字段 `workflow_version`
- 允许值限定为 `v1|v2`

2. 审计对账增强：
- 从 workflow state/history 读取并校验 `workflow_version`
- 若请求与历史记录不一致，按 `WF_STAGE_TRANSITION_INVALID` fail-closed

3. 派发元数据补齐：
- sendSystemMessage metadata 增加 `workflow_version`

### 2.3 测试更新
1. 新增：`tests/workflow_v2_handler_test.sh`
- 覆盖 v2 init、owner 鉴权、Design review gate、extensions 结构校验（正反例）

2. 更新：`src/tests/unit/workflow/workflowRoute.test.ts`
- 事件 payload 补齐 `workflow_version`
- 新增 invalid workflow_version 的 fail-closed 测试

3. 更新：`tests/workflow_test.sh`
- 兼容 owner-only 规则（使用 architect 推进）
- backtrack 在脏工作树时显式 skip（避免本地开发态误报）

## 3. 关键设计决策（WHY）
1. 单入口分派：所有 v1/v2 差异集中在 helper 层，避免在业务分支散落条件判断。
2. fail-closed 优先：扩展字段结构不合法直接拒绝写入，防止脏状态落盘。
3. owner-only 推进：与 Stage 2/4/5 冻结契约一致，消除隐式提权风险。
4. 审计字段完整：事件与历史均携带 `workflow_version`，保证双轨并存时可追责。

## 4. 本地验证结果
执行命令：
1. `npm run test -- src/tests/unit/workflow/workflowRoute.test.ts`
- 结果：`PASS`（9 tests）

2. `bash tests/workflow_v2_handler_test.sh`
- 结果：`PASS`

3. `bash tests/workflow_test.sh`
- 结果：`PASS`（backtrack 在 dirty tree 场景按预期 `SKIP`）

说明：本地未启动 workflow event server 时，handler 会出现 `WF_EVENT_DISPATCH_FAILED` warning；该行为为既有降级路径，不影响状态推进与测试断言。

## 5. 交接给 Stage 7（QA）
请优先复测以下阻断项：
1. `TC-ERR-005` 非 owner 推进拒绝（`WF_PERMISSION_DENIED`）
2. `TC-ERR-006/007/008` 扩展字段 schema fail-closed
3. `TC-FUNC-002` 事件契约字段完整（含 `workflow_version`）
4. `TC-BND-001` 终态重复 next 拒绝（v1/v2）
5. `TC-BND-002` v1/v2 并存隔离

## 6. 证据路径
- `docs/workflow/task-2f6c911d/developer-stage6-implementation-2026-03-31.md`（本文）
- `tests/workflow_v2_handler_test.sh`
- `src/tests/unit/workflow/workflowRoute.test.ts`
- `skills/dev-workflow/scripts/handler.sh`
