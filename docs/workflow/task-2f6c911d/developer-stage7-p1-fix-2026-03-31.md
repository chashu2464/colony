# Stage 7 P1 修复记录（开发者）

- Task ID: `2f6c911d`
- Date: `2026-03-31`
- Bug ID: `P1-WF-CONTRACT-BACKTRACK-VERSION-MISSING`

## 修复目标

修复 `backtrack` 分支事件契约与路由校验不一致问题，确保 `notify_server` payload 与路由必填字段一致，并补齐 backtrack 审计模型字段。

## 代码变更

1. `skills/dev-workflow/scripts/handler.sh`
- backtrack 调用 `notify_server` 时补传第 7 参数 `workflow_version`。
- backtrack history 补齐：
  - `event_id`
  - `workflow_version`
  - `routing`（pass/block 结构化记录）
  - `dispatch`（pending/success/failed/skipped）
- backtrack 派发结果与 next 对齐：落盘 `dispatch` 成功/失败时间戳与失败原因。

2. `tests/workflow_v2_handler_test.sh`
- 新增 backtrack 契约回归断言：`event_id/workflow_version/routing/dispatch` 字段必须存在且结构正确。

3. `tests/workflow_test.sh`
- backtrack 成功分支新增 history 契约字段断言（在 clean tree 条件下执行）。

## 回归结果

- `npm run test -- src/tests/unit/workflow/workflowRoute.test.ts`：PASS（9/9）
- `bash tests/workflow_v2_handler_test.sh`：PASS
- `bash tests/workflow_test.sh`：PASS（当前运行因工作树非 clean，backtrack 用例按预期 skip）

## 归因确认

- 根因与 QA 结论一致：`notify_server` 7参签名升级后，`next` 已迁移，`backtrack` 调用点遗漏。
- 通过新增回归覆盖 backtrack 审计契约，避免仅覆盖 `next` 的盲区再次出现。
