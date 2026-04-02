# M2.1 Stage 4 - QA Reverse Briefing (2026-04-02)

## Context
- Task: `d83517e0`
- From: Stage 3 Forward Briefing (freeze completed)
- To: Stage 4 Reverse Briefing (developer execution evidence alignment)

## QA Reverse Restatement (冻结语义复述)
1) 调度器同步与漂移阈值
- 调度周期为 1 分钟。
- 漂移阈值冻结为：`p95 <= 20s`，`p99 < 30s`。
- 失败重试策略为指数退避：`1m -> 2m -> 4m -> 8m -> 15m(cap)`。
- 失败时必须 fail-closed：不允许污染 board 在线快照。

2) 事件归档与在线读取并行
- 归档触发后，在线链路保持可读且语义不变。
- 归档进行期间，`board.events` 延迟增幅阈值：相对非归档基线 `p95 delta < 10%`。

3) 跨层分页与参数兼容
- `cursor` 与 `since_event_id` 并存时必须 fail-closed 拒绝。
- 错误语义冻结：
  - `cursor + since_event_id` -> `BOARD_VALIDATION_ERROR / BOARD_CURSOR_CONFLICT`
  - 非法或不支持的 `cursor_version` -> `BOARD_VALIDATION_ERROR / BOARD_CURSOR_INVALID`
  - unknown `since_event_id` -> `BOARD_VALIDATION_ERROR / since_event_id was not found`
- 跨 online/archive 分页必须满足：序列单调、跨层去重、无漏读。

4) 鉴权与安全一致性
- archive 与 online 鉴权强度必须一致。
- 任意越权 archive 查询统一返回 `WF_PERMISSION_DENIED`。
- 错误响应不得泄露资源存在性（workflow/archive 是否存在）。

## Stage 4 Evidence Contract (开发提交必须满足)
- 每个断言用 Given-When-Then 结构给出证据。
- 每个断言至少包含：前置数据、执行步骤/命令、原始输出、结论。
- 指标类证据必须包含时间窗与采样口径。
- 错误码证据必须包含完整响应体和 HTTP 状态。
- 审计证据必须可追溯 `actor/workflow_id/archive_id/trace_id`。

## QA Gate Focus
- A1 漂移阈值：`p95 <= 20s` and `p99 < 30s`
- A2 重试与快照安全：退避正确且失败不污染快照
- A3 恢复闭环：失败堆积恢复 < 30m
- B1 幂等不重写：同幂等键重复触发不新增事件
- C1 跨层分页连续性：不重复不漏读
- C2-C4 参数/游标错误语义固定
- D1 鉴权一致性与防枚举
- E1 归档期延迟增幅 `p95 delta < 10%`

## Vulnerability Review Scope
- OWASP Top 10 重点：鉴权绕过、输入校验、日志信息泄露、资源滥用（并发压测场景）。
- 若出现 P0/P1，必须补齐三问闭环：
  - 修复内容（What fixed）
  - 引入原因（Why introduced）
  - 归因路径（How escaped）

## Gate Intent
在 Stage 4 强制“语义一致 + 证据可执行 + 安全可追溯”，以避免 Stage 5 验收口径漂移与重复返工。
