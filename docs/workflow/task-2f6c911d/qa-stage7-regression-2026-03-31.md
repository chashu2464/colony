# Stage 7 QA Regression Report（QA负责人）

- Task ID: `2f6c911d`
- Stage: 7 (Integration Testing)
- Date: `2026-03-31`
- Reviewer: `qa_lead`
- Conclusion: `FAIL`（存在 P1 阻断）

## 1. 复测范围（按 Stage 5 矩阵优先级）

1. owner-only next 权限控制
2. extensions schema fail-closed
3. v1/v2 并存隔离
4. stage change event 契约完整性（含 `workflow_version`）

## 2. Given-When-Then 测试执行记录

### TC-OWN-001（PASS）非 owner 推进拒绝
- Given: v2 workflow 已初始化，当前 stage owner = `architect`
- When: `developer` 调用 `next`
- Then: 返回 `WF_PERMISSION_DENIED`，状态不推进
- Evidence: `bash tests/workflow_v2_handler_test.sh`（PASS）

### TC-SCH-001（PASS）board.blocked schema fail-closed
- Given: update 请求中 `extensions.board.blocked` 条目缺失 `block_reason` 或 `owner`
- When: 调用 `update`
- Then: 返回验证错误，拒绝落盘
- Evidence: `bash tests/workflow_v2_handler_test.sh`（PASS）

### TC-SCH-002（PASS）cross-agent task card 状态白名单
- Given: `extensions.cross_agent.task_cards[].status = unknown`
- When: 调用 `update`
- Then: 返回验证错误（仅允许 `todo/in_progress/blocked/done`）
- Evidence: `bash tests/workflow_v2_handler_test.sh`（PASS）

### TC-ISO-001（PASS）跨房间 idempotency 隔离
- Given: 两个 room 使用相同 `event_id`
- When: 分别上报 workflow event
- Then: 两个 room 都应被独立处理，互不去重污染
- Evidence: `npm run test -- src/tests/unit/workflow/workflowRoute.test.ts`（9/9）

### TC-CONTRACT-001（PASS）路由契约缺失字段 fail-closed
- Given: workflow event payload 缺失 `workflow_version` / `decision_source` 等必填字段
- When: POST `/api/workflow/events`
- Then: 返回 `WF_STAGE_TRANSITION_INVALID`
- Evidence: `src/tests/unit/workflow/workflowRoute.test.ts`（9/9）

### TC-CONTRACT-002（FAIL / P1）backtrack 派发缺失 `workflow_version`
- Given: `notify_server` 事件契约要求必填 `workflow_version`（server 端强校验）
- When: `backtrack` 分支调用 `notify_server "$CURRENT" "$TARGET" "$BT_ROLE" "$BT_ACTOR" "$BT_EVENT_ID" "$BT_SOURCE"`
- Then: 实际调用只传 6 参，`workflow_version` 未传入；payload 缺少该字段，违反契约（v2 场景被默认回落为 v1 或缺字段）
- Evidence:
  - 代码位置：`skills/dev-workflow/scripts/handler.sh:1093`
  - 对照定义：`skills/dev-workflow/scripts/handler.sh:402-423`（`notify_server` 第 7 参为 `workflow_version`）
  - 路由必填校验：`src/server/routes/workflow.ts:95`
  - `bash -x` 轨迹显示 backtrack 构造 payload 无 `workflow_version`

## 3. Bug 报告（P1）

- ID: `P1-WF-CONTRACT-BACKTRACK-VERSION-MISSING`
- Severity: `P1`（契约一致性与审计追溯破坏；影响 v1/v2 双轨可观测性）
- 类型: Functional + Security/Integrity（事件审计完整性）

### 复现步骤（可执行）
1. 在干净工作区准备 v2 workflow 状态（`current_stage=2`）。
2. 执行：`echo '{"action":"backtrack","target_stage":1,"reason":"qa backtrack check"}' | bash skills/dev-workflow/scripts/handler.sh`。
3. 使用 `bash -x` 观察 `notify_server` 调用与 payload 构造。
4. 结果：调用为 `notify_server ... "$BT_SOURCE"`（仅 6 参），payload 中不含 `workflow_version`。

### P0/P1 归零三问
1. 修复内容（What to fix）
- 在 backtrack 分支补传第 7 参：`"$WORKFLOW_VERSION"`。
- 为 backtrack history 补齐 `event_id/workflow_version/routing/dispatch` 字段，保持与 next 一致审计模型。
- 新增自动化用例：断言 backtrack 派发 payload 含 `workflow_version`，且与 state 一致。

2. 引入原因（Why introduced）
- `notify_server` 签名升级为 7 参后，`next` 路径已同步，`backtrack` 调用点遗漏迁移，产生参数漂移。

3. 归因路径（Attribution path）
- Stage 6 双轨改造中新增 `workflow_version` 契约 -> 仅覆盖 `next` 路径测试 -> backtrack 未纳入契约回归矩阵 -> 缺陷进入集成阶段。

## 4. 漏洞审查（OWASP 视角）

- 审计完整性风险：事件契约字段缺失会降低追溯可信度，属于日志/审计链完整性问题（A09 Security Logging and Monitoring Failures 相关）。
- 未发现本轮新增 SQL 注入 / XSS / CSRF 直接暴露面（该改动主要为 workflow 控制面与服务端路由校验）。

## 5. 性能观察

- 未见显著性能回归；新增校验主要为常量时间字段校验与小规模 JSON 处理。
- `dispatchStateByRoomEvent` 为进程内内存去重，长期运行可能存在增长风险（需后续容量策略）。

## 6. 阶段门禁声明

- 门禁结论：`FAIL`（阻断）
- 已验证通过场景：
  - owner-only next
  - extensions schema fail-closed
  - v1/v2 并存隔离（跨 room idempotency）
  - 路由事件契约缺失/伪造 fail-closed
- 阻断项：
  - `P1-WF-CONTRACT-BACKTRACK-VERSION-MISSING`
- 遗留风险：
  - backtrack 事件审计字段与 next 不对齐，可能导致双轨审计歧义与告警聚合失真。
