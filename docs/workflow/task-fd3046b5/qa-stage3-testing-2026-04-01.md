# M2: workflow-board 告示牌模式落地 - Stage 3 Testing（QA）

- Task ID: `fd3046b5`
- Stage: 3 (Testing)
- Date: `2026-04-01`
- Owner: qa_lead
- Reviewer Perspective: Independent QA (not implementation self-acceptance)

## 1) Scope

本次 QA 针对 M2 Phase 1 的四个契约执行独立验证：
- `board.get`
- `board.events`
- `board.blockers`
- `board.update`

并覆盖：
- 正常流程
- 异常流程
- 边界条件
- 安全与性能风险审查（OWASP Top 10 相关输入面）
- M1/M2 回归兼容性

## 2) Test Evidence

Round 1（初测）已执行脚本：

```bash
bash tests/workflow_board_test.sh
bash tests/workflow_v2_handler_test.sh
```

结果：
- `workflow_board_test.sh`: PASS
- `workflow_v2_handler_test.sh`: PASS（存在 `WF_EVENT_DISPATCH_FAILED` 本地告警，来源于事件端口未启动，不影响 handler 契约测试）

补充独立 QA 断言（手工脚本执行）：
- 非法 `since_event_id` -> `BOARD_VALIDATION_ERROR`
- 非法 `card_id`（含空格）-> `BOARD_VALIDATION_ERROR`
- `block_reason` 长度 201 -> `BOARD_VALIDATION_ERROR`
- `move/unblock` 不存在卡片 -> `BOARD_CARD_NOT_FOUND`
- 分页序号连续性：`seq` 按页连续（1,2,3）
- 性能烟测：50 次 `board.get` 平均约 `47.62ms`

Round 2（修复后复测）已执行脚本：

```bash
bash tests/workflow_board_test.sh
bash tests/workflow_v2_handler_test.sh
```

结果：
- `workflow_board_test.sh`: PASS
- `workflow_v2_handler_test.sh`: PASS（同样存在 `WF_EVENT_DISPATCH_FAILED` 本地告警，不影响 handler 契约测试）

追加独立复测断言（非脚本内置）：
- 非 owner 在 Stage 0 调用 `board.update` -> `WF_PERMISSION_DENIED`，并返回 `details`（`owner role`/`required actor`/`actual actor`）
- `board.events(limit=999)` -> `BOARD_VALIDATION_ERROR`（`limit must be <= 200`）
- `board.events(since_event_id=unknown)` -> `BOARD_VALIDATION_ERROR`（`since_event_id was not found`）
- 性能烟测复核：50 次 `board.get` 平均约 `48.17ms`

## 3) Given-When-Then Matrix

### 3.1 Normal Flows

TC-NORMAL-001
- Given v2 workflow 初始化完成（`board_mode=true`）
- When 调用 `board.get`
- Then 返回 `snapshot.current_stage`、`owner_role/owner_id`、`blocker_count`，并包含 `board.last_updated_at`（UTC）
- Result: PASS

TC-NORMAL-002
- Given board 初始为空
- When 依次执行 `board.update(add -> move -> block)`
- Then 卡片在列之间正确迁移，`board.blocked` 数量与事件数量正确
- Result: PASS

TC-NORMAL-003
- Given 已产生多条事件
- When 调用 `board.events(limit, offset)`
- Then 返回分页数据与 `meta.has_more`，事件按 `seq` 顺序
- Result: PASS

TC-NORMAL-004
- Given blocked 列有 owner=developer 的卡片
- When 调用 `board.blockers(owner=developer)`
- Then 返回过滤后的 blockers 和准确 count
- Result: PASS

### 3.2 Exception Flows

TC-EXCEPTION-001
- Given v1 workflow（`board_mode=false`）
- When 调用 `board.get`
- Then fail-closed 返回 `BOARD_DISABLED`
- Result: PASS

TC-EXCEPTION-002
- Given 卡片在 in_progress
- When 执行 `move -> blocked` 且缺失 `block_reason`
- Then 返回 `BOARD_VALIDATION_ERROR`
- Result: PASS

TC-EXCEPTION-003
- Given 事件列表存在
- When `board.events` 传入不存在的 `since_event_id`
- Then 返回 `BOARD_VALIDATION_ERROR`
- Result: PASS

TC-EXCEPTION-004
- Given 不存在目标卡片
- When 执行 `move` 或 `unblock`
- Then 返回 `BOARD_CARD_NOT_FOUND`
- Result: PASS

### 3.3 Boundary Conditions

TC-BOUNDARY-001
- Given 首次写入 board 事件
- When 执行第一条 `board.update`
- Then `updated_events[0].seq == 1`
- Result: PASS

TC-BOUNDARY-002
- Given `block_reason` 长度边界
- When 长度 > 200（例如 201）
- Then 返回 `BOARD_VALIDATION_ERROR`
- Result: PASS

TC-BOUNDARY-003
- Given 分页读取
- When 读取 `offset=0,limit=2` 与 `offset=2,limit=2`
- Then 跨页 `seq` 连续，不丢序
- Result: PASS

## 4) Security Review (OWASP-focused)

### 4.1 Checked Risks

- Injection（A03）
  - 结论：当前 board 查询和写入路径使用 `jq --arg/--argjson` 绑定变量，未发现直接字符串拼接导致的命令注入路径。

- Broken Access Control（A01）
  - Round 1 发现：`board.update` 未做 owner-only 权限收敛，任意已接入 agent 可改写 board。
  - Round 2 复测：已修复。`board.update` 入口已按 stage owner 进行鉴权，非 owner 返回 `WF_PERMISSION_DENIED`，漏洞关闭。
  - 当前风险等级：已从 P1 归零。

- Input Validation / DoS（A04/A05）
  - Round 1 发现：`board.events` 的 `limit/offset` 仅校验非负整数，未设上限。
  - Round 2 复测：已新增上限 `limit <= 200`，超限 fail-closed 返回 `BOARD_VALIDATION_ERROR`。
  - 当前风险等级：P2 已关闭（本项无遗留）。

### 4.2 P0/P1 归零要求检查

- P0: 0
- P1: 0（已归零）

对 P1-WF-BOARD-ACCESS-CONTROL-MISSING 的三问：
1. 修复内容：在 `board.update` 增加 owner-only 校验（基于 `owner_role_for_stage + assignments`），非 owner 返回 `WF_PERMISSION_DENIED` 且附带 `owner role / required actor / actual actor`；补齐 stage 0 / stage 2 权限边界测试，并新增 `board.events` 分页上限 `limit<=200`。
2. 引入原因：Phase 1 为保证主链路先落地，将访问控制与资源保护延后，导致短时暴露窗口。
3. 归因路径：分期决策（先契约后收敛） -> 开发按既定边界实现 -> QA Stage 3 安全审查发现 -> 开发修复并回归 -> QA 复测归零。

## 5) Performance Check

- 方法：同一测试房间连续执行 50 次 `board.get`，记录平均耗时
- 结果：平均约 `47.62ms`（本地环境）
- 结论：满足架构评审提出的 `<100ms` 烟测预期；正式 P95 指标需在稳定环境压测确认。

## 6) Gate Decision

结论：**PASS（解除阻断）**

初测阻断原因：`P1-WF-BOARD-ACCESS-CONTROL-MISSING`（`board.update` 缺失 owner-only 权限控制）。
复测结论：该 P1 已修复并通过独立复测，门禁由 FAIL 转为 PASS。

门禁声明（已验证场景）：
- 已验证：四个契约正常/异常/边界分支、fail-closed 错误码（`BOARD_DISABLED`/`BOARD_VALIDATION_ERROR`/`BOARD_CARD_NOT_FOUND`/`WF_PERMISSION_DENIED`）、分页与增量序号连续性、owner-only 权限边界（stage 0/stage 2）、M1/M2 回归兼容。
- 遗留风险：无 P0/P1 阻断项。仍建议在 Phase 2 继续关注事件归档后的跨归档分页与大事件量场景压测。

## 7) Retest Outcome

1. 阻断项 `P1-WF-BOARD-ACCESS-CONTROL-MISSING` 已关闭：复测确认非 owner 无法写入 board。
2. 非阻断建议已采纳并关闭：`board.events` 已限制 `limit<=200`，超限 fail-closed。
3. Stage 3 门禁状态：可进入下一阶段（Stage 4）。
