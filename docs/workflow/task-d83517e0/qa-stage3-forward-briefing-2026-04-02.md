# M2.1 Stage 3 Forward Briefing - QA Alignment (2026-04-02)

## Context
- Task: `d83517e0` (workflow-board 自动同步与归档)
- Stage: 3 Forward Briefing (active)
- QA role: 对齐实现意图并固化可执行测试门禁，避免后续语义漂移。

## QA Alignment Decision
QA 认可开发者本轮设计意图，结论为 **APPROVED WITH CONSTRAINTS**。

WHY:
1) 核心高风险点（幂等、跨层游标、鉴权一致性、归档隔离）已覆盖到位；
2) 当前仍需把“语义型风险”转成可断言门禁，尤其是跨归档分页一致性和调度漂移可观测性；
3) 先冻结验收口径，能减少 Stage 4/5 返工。

## Mandatory Acceptance Constraints (Freeze)
1) 自动同步必须 fail-closed：同步写失败不得污染在线快照，必须保留重试证据（attempt_count/next_retry_at/last_error）。
2) 幂等键冲突语义固定：重复请求只能返回“已应用”或“无变更”，不得生成重复 BoardEvent。
3) 跨归档分页必须满足：
   - 单调前进（cursor 不回退）；
   - 跨层去重（同 event_id 仅出现一次）；
   - 边界无漏读（online->archive 邻接点连续）。
4) 鉴权一致性：归档层与在线层权限模型完全一致；任一越权读取统一返回授权失败错误码。
5) 兼容性固定：既有 `since_event_id` 读取习惯继续有效；新 cursor 与旧参数并存时以明确优先级 fail-closed 处理冲突。

## Executable Test Matrix (Given-When-Then)

### A. Normal Flows
1) Given stage 发生变更且调度器运行，When 到达一个调度周期（1m），Then board 快照在 SLA 内同步且生成对应事件。
2) Given 事件量达到归档阈值（count>=10000 或 age>=7d），When 归档任务执行，Then 在线链路可继续查询且归档成功可审计。
3) Given online+archive 同时有数据，When 使用统一 cursor 翻页，Then 返回序列单调连续且无重复。

### B. Exception Flows
4) Given 同步任务失败（I/O 或 lock 冲突），When 触发重试，Then 按 1m/2m/4m 退避并 cap=15m，且不产生重复写入。
5) Given 幂等键重复提交，When 再次执行同 action，Then 返回幂等命中且事件总数不增加。
6) Given 非授权 actor 访问 archive 查询，When 发起读取，Then 返回权限错误且不泄露数据存在性细节。

### C. Boundary Flows
7) Given online 最后一条与 archive 第一条时间戳相同，When 跨层分页，Then 结果不重复不漏读。
8) Given cursor 位于首/尾页边界，When 前进到下一页，Then 行为稳定（空页/结束态语义固定）。
9) Given `since_event_id` 不存在或 cursor_version 非法，When 查询 events，Then fail-closed 返回校验错误。

### D. Security & Abuse
10) Given 构造游标篡改（layer/event_id/ts 不一致），When 请求跨层分页，Then 触发校验失败并拒绝处理。
11) Given 高频拉取 + 高频同步并发，When 持续 5-10 分钟压测，Then 不出现权限绕过、重复事件、快照倒退。

### E. Performance & Reliability
12) Given 默认 1m 调度，When 连续运行 30 分钟，Then 调度漂移受控（需记录 p95/p99 漂移）。
13) Given 归档任务运行中，When 执行 board.events，Then 延迟增幅在可接受阈值内（阈值待开发回填并冻结）。
14) Given 失败堆积后恢复，When 上游恢复可用，Then 队列可清空且最终一致性收敛。

## QA Gate Criteria for Stage 4/5
- 必须通过：A1-A3, B4-B6, C7-C9, D10, E12。
- 可延后但需记录风险：E13/E14 的长时压测（若受环境限制）。
- P0/P1 归零要求：若出现访问控制/数据一致性破坏，必须按“三问”闭环（修复内容、引入原因、归因路径）。

## Open Items to Developer
1) 请回填并冻结性能阈值：
   - 调度漂移 p95/p99 上限；
   - 归档期间 board.events 延迟增幅上限；
   - 恢复时间上限（失败堆积清空时间）。
2) 请明确 cursor 与 since_event_id 并存时的优先级与错误语义（用于 fail-closed 断言）。
3) 请提供归档层错误码清单，确保与在线层权限和校验错误语义一致。

