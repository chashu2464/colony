# M2: workflow-board 告示牌模式落地 - Stage 2 Build（Developer）

- Task ID: `fd3046b5`
- Stage: 2 (Build)
- Date: `2026-04-01`
- Owner: developer
- Workflow Version: `v2`

## 1) 交付范围（Phase 1）

本次实现已落地四个核心查询/写入契约：

- `board.get`
- `board.events`
- `board.blockers`
- `board.update`

## 2) 实现文件

新增文件：

- `skills/dev-workflow/scripts/board.sh`
- `skills/dev-workflow/schemas/board_snapshot.json`
- `skills/dev-workflow/schemas/board_event.json`
- `tests/workflow_board_test.sh`

修改文件：

- `skills/dev-workflow/scripts/handler.sh`

## 3) 契约行为说明

### 3.1 `board.get`

- 读取 `extensions.board` 当前快照，返回 `board + snapshot`
- `snapshot` 包含 `current_stage / stage_name / owner_role / owner_id / blocker_count`
- 当 `board_mode=false` 时 fail-closed 返回 `BOARD_DISABLED`

### 3.2 `board.events`

- 支持分页参数：`limit`、`offset`
- 支持增量参数：`since_event_id`
- 当 `since_event_id` 有效时，返回其后续事件并标记 `meta.supports_incremental=true`
- 当 `since_event_id` 不存在时返回 `BOARD_VALIDATION_ERROR`

### 3.3 `board.blockers`

- 返回 `extensions.board.blocked` 列
- 支持 `owner` 过滤，返回 `blockers + count`
- 阻塞卡片包含 `block_reason`（由写入路径强约束）

### 3.4 `board.update`

- 支持 `operations`（非空数组）与兼容写法 `operation`（单对象）
- 支持动作：`add / move / remove / block / unblock`
- 每个操作生成 `BoardEvent`，字段含 `seq/event_id/task_id/actor/action/timestamp/metadata`
- `seq` 按任务内事件单调递增（从 1 开始）
- 所有变更更新 `extensions.board.last_updated_at`（ISO8601 UTC）

## 4) 并发与原子性

- 复用 M1 handler 全局锁：`mkdir lock` + 5 秒超时
- `board.update` 写入通过现有 `save_state`（tmp + rename）保持原子性
- 保持 fail-closed：校验失败直接拒绝，不写入状态

## 5) fail-closed 分支覆盖

已实现并验证：

- `BOARD_DISABLED`：board 模式关闭（v1 默认）
- `BOARD_VALIDATION_ERROR`：
  - `operations` 非法
  - 非法列名
  - 非法 card_id
  - `move -> blocked` 缺失 `block_reason`
  - `block_reason` 超长（>200）
  - `since_event_id` 无效
- `BOARD_CARD_NOT_FOUND`：卡片不存在或 blocked 卡片不存在

## 6) 测试证据

执行命令：

```bash
bash tests/workflow_board_test.sh
bash tests/workflow_v2_handler_test.sh
```

结果：

- `workflow_board_test.sh`：PASS
- `workflow_v2_handler_test.sh`：PASS（含历史 v2 门禁回归）

备注：

- `workflow_v2_handler_test.sh` 中出现 `WF_EVENT_DISPATCH_FAILED` 警告来自本地事件端口未启动，不影响 handler 契约与状态持久化测试。

## 7) Phase 1 / Phase 2 边界

本轮（Phase 1）已完成：

- 四个核心契约
- 快照 + 事件流持久化
- 分页与 `since_event_id` 增量读取
- v1/v2 兼容（v1 返回 `BOARD_DISABLED`）

未纳入本轮（Phase 2+）：

- stage 变更到 board 的自动同步
- 事件归档与跨归档分页

补充（2026-04-01 Stage 3 缺陷修复）：

- 已落实 `board.update` owner-only：仅当前 stage owner 可写，非 owner 返回 `WF_PERMISSION_DENIED`
- `board.events` 新增分页上限：`limit <= 200`，超限返回 `BOARD_VALIDATION_ERROR`

## 8) WHY

优先确保“可见（snapshot）+ 可追溯（events）+ 可定位阻塞（blockers）”三目标的最短闭环，并严格复用 M1 并发与原子写入机制，降低新增路径引入的一致性风险与回归面。
