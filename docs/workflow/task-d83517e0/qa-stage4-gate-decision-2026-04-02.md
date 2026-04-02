# M2.1 Stage 4 Gate Decision - QA (2026-04-02)

## Context
- Task: `d83517e0`
- Workflow phase: Stage 3 Forward Briefing -> Stage 4 Reverse Briefing gate
- Inputs reviewed:
  - `docs/workflow/task-d83517e0/stage1-requirements.md`
  - `docs/workflow/task-d83517e0/stage2-architecture.md`
  - `docs/workflow/task-d83517e0/qa-stage3-forward-briefing-2026-04-02.md`
  - `docs/workflow/task-d83517e0/developer-stage3-freeze-response-2026-04-02.md`

## Independent QA Review Result
Decision: **PASS (APPROVED WITH CONSTRAINTS)** for entering Stage 4 gate verification.

WHY:
1) 三项冻结信息已具备可执行断言：
   - 调度漂移上限：p95 <= 20s, p99 < 30s
   - 归档期查询增幅上限：`board.events` p95 相对增幅 < 10%
   - `cursor` 与 `since_event_id` 并存语义：fail-closed + 明确错误码
2) 安全口径与前序冻结一致：归档层与在线层同强度鉴权，越权统一 `WF_PERMISSION_DENIED`。
3) 高风险语义（幂等、跨层分页、鉴权）已可映射为 Given-When-Then 自动化断言。

## Stage 4 Gate Statement (Required)
已验证场景（文档级/契约级验证）：
1) 正常流程：1m 调度同步路径、归档触发后在线链路可读、跨层分页连续性契约。
2) 异常流程：重试退避（1m/2m/4m/cap=15m）、幂等命中不重复写、游标/参数冲突 fail-closed。
3) 边界条件：online->archive 邻接点去重与不漏读、cursor 首尾页语义、非法 cursor_version/unknown since_event_id 错误语义。
4) 安全审查：归档旁路读取防护、鉴权一致性、错误码不泄露内部结构。

遗留风险（进入 Stage 4/5 时必须实测关闭）：
1) 长时稳定性：失败堆积恢复时间上限需以实测闭环（目标 `< 30m`，与 Stage 1 可行性门槛一致）。
2) 压测真实性：归档运行与高并发查询并行 5-10 分钟时，需确认无重复事件、无快照倒退、无权限绕过。
3) 可观测性落地：必须存在可提取的 p95/p99 漂移与延迟指标，避免“口径已定但不可量化验证”。

## P0/P1 Zero-Defect Policy (Pre-commit)
若出现 P0/P1（鉴权绕过、重复/漏读导致一致性破坏、快照污染），每个缺陷必须输出三问闭环：
1) 修复内容（What fixed）
2) 引入原因（Why introduced）
3) 归因路径（How escaped）

## Test Design Baseline (Given-When-Then)
1) Given 1m 调度器运行且 stage 变更发生, When 到达调度周期, Then board 状态在阈值内同步且不重复产生日志事件。
2) Given 同一幂等键重复触发, When 处理请求, Then 仅返回“已应用/无变更”语义并保持事件总数不增长。
3) Given online 和 archive 同时存在相邻时间戳事件, When 使用统一 cursor 翻页, Then 序列单调前进、跨层去重、无漏读。
4) Given 同时传入 `cursor` 与 `since_event_id`, When 调用 `board.events`, Then 返回 `BOARD_VALIDATION_ERROR/BOARD_CURSOR_CONFLICT`。
5) Given 非法 cursor_version 或畸形 cursor, When 调用 `board.events`, Then 返回 `BOARD_VALIDATION_ERROR/BOARD_CURSOR_INVALID`。
6) Given 越权 actor 查询 archive, When 发起读取, Then 统一返回 `WF_PERMISSION_DENIED` 且不返回敏感存在性信息。

## Next QA Action
- 进入 Stage 4 Reverse Briefing：要求开发侧按上述断言输出可执行测试证据（日志、指标、错误码样例、回放脚本）。
