# Stage 5 Test Case Design（QA）

- Task ID: `2f6c911d`
- Stage: 5 (Test Case Design)
- Date: `2026-03-31`
- Owner: `qa_lead`
- Scope: Colony 新 5 阶段 workflow 蓝图落地（含 board mode / cross-agent mode 扩展）

## 1. 测试目标与策略

### 1.1 测试目标
1. 验证 `workflow_version=v2` 的 5 阶段主链路行为正确且可审计。
2. 验证 fail-closed 门禁在异常输入与权限越界场景稳定生效。
3. 验证终态治理、v1/v2 双轨隔离、扩展模式校验、并发与恢复语义。
4. 识别 OWASP Top 10 相关风险（重点 A01/A03/A08/A09）并纳入可执行用例。

### 1.2 覆盖维度
- 正常流程：阶段推进、事件路由、审计链路。
- 异常流程：assignment/evidence/review 缺失、非 owner 推进、非法扩展结构。
- 边界条件：Completed 重复 `next`、v1/v2 共存、扩展字段临界值。
- 并发稳定性：锁竞争、幂等补齐、原子写一致性。
- 安全性：鉴权绕过、输入校验、只读回退、防状态污染。
- 性能：低频控制面下高并发竞争的稳定退出与时延上界。

### 1.3 测试方法
- 黑盒 API/CLI 行为验证（`init/status/update/submit-review/next`）。
- 状态文件与审计事件字段对账。
- 并发压测（同一任务多并发 `update/next`）。
- 失败注入（缺文件、损坏 JSON、锁超时）。

## 2. 前置条件与数据准备

1. 仓库：`/Users/casu/Documents/Colony`
2. 工具：`bash`, `jq`, `rg`
3. 准备两类任务：
- `WF-V2-*`：`workflow_version=v2` 新任务
- `WF-V1-*`：`workflow_version=v1` 或历史任务
4. 准备基础证据文件：
- `docs/workflow/task-2f6c911d/artifacts/evidence-ok.md`（存在）
- `docs/workflow/task-2f6c911d/artifacts/evidence-missing.md`（不存在）
5. 开启审计采集，保留 stage change event 记录（至少包含 `event_id`）。

## 3. 测试矩阵（Given-When-Then）

### 3.1 正常流程（Functional Happy + Mainline）

#### TC-FUNC-001 v2 全链路顺序推进
- Given 新建 `workflow_version=v2` 任务，assignments 完整，阶段证据齐全
- When 按 owner 顺序提交 review 并执行 `next`
- Then 流程按 Discovery -> Design -> Build -> Verify -> Release -> Completed 推进，且每一步 `current_stage/stage_name` 与映射一致

#### TC-FUNC-002 Stage Change Event 审计字段完整
- Given v2 任务在任一阶段推进
- When 读取 stage change event
- Then 事件包含 `roomId/workflow_version/from_stage/to_stage/next_actor_role/next_actor/event_id/decision_source`，且字段非空

#### TC-FUNC-003 next_actor 路由一致性
- Given v2 任务处于 Design 完成后
- When 执行 `next`
- Then `next_actor_role=developer` 且与 assignments 中 developer 一致

#### TC-FUNC-004 board mode 正常写入与读取
- Given `extensions.board_mode=true` 且 board 数据结构合法
- When 执行 `update` 后 `status`
- Then `board.todo/in_progress/blocked/done` 保持结构稳定并可读取

#### TC-FUNC-005 cross-agent mode 协作字段可见
- Given `extensions.cross_agent_mode=true` 且 `main_owner/contributors/task_cards` 合法
- When 执行 `update` 后 `status`
- Then 扩展字段落盘成功，且不影响主链路 `current_stage` 语义

### 3.2 异常流程（Fail-Closed）

#### TC-ERR-001 assignment 缺失阻断
- Given 缺少当前阶段必须 owner assignment
- When 调用 `next`
- Then 返回阻断错误（分类稳定），阶段不变，产生拒绝审计记录

#### TC-ERR-002 evidence 缺失阻断
- Given 当前阶段要求 evidence，但传入缺失路径
- When 调用 `next`
- Then 返回证据缺失错误并阻断推进

#### TC-ERR-003 evidence 非法路径阻断
- Given evidence 为非法路径（目录穿越/不可访问）
- When 调用 `next`
- Then 返回输入校验错误并阻断推进

#### TC-ERR-004 review 缺失阻断
- Given 当前阶段是需 review 的阶段，但未 `submit-review approved`
- When 调用 `next`
- Then 返回 review 缺失阻断，`current_stage` 不变

#### TC-ERR-005 非 owner 推进拒绝（A01）
- Given 调用方角色不是当前 stage owner
- When 调用 `next`
- Then 返回权限拒绝，状态与审计保持一致（无隐式提权）

#### TC-ERR-006 board.blocked 缺少 `block_reason`
- Given `extensions.board.blocked` 项缺失 `block_reason`
- When 调用 `update`
- Then schema 校验失败并拒绝写入

#### TC-ERR-007 board.blocked 缺少 `owner`
- Given `extensions.board.blocked` 项缺失 `owner`
- When 调用 `update`
- Then schema 校验失败并拒绝写入

#### TC-ERR-008 cross-agent task card 非法状态值
- Given `task_cards.status` 为未定义值（如 `unknown`）
- When 调用 `update`
- Then 输入校验失败并阻断，避免脏数据落盘

### 3.3 边界条件（Boundary）

#### TC-BND-001 Completed 终态重复 next
- Given 任务已在 Completed
- When 再次调用 `next`
- Then 必须拒绝并返回终态错误，仅允许 `status` 只读查询

#### TC-BND-002 v1/v2 并存隔离
- Given 同房间同时存在 v1 与 v2 任务
- When 分别执行 `status/next`
- Then 行为按各自版本解释，不发生 schema 污染与错误路由

#### TC-BND-003 最小合法扩展载荷
- Given `board` 与 `cross_agent` 仅包含最小必需字段
- When `update` + `status`
- Then 系统接受并稳定输出，不要求冗余字段

#### TC-BND-004 最大 task_cards 数量阈值
- Given `task_cards` 达到设计上限值 N（由实现配置定义）
- When 调用 `update`
- Then 在阈值内成功，超阈值明确拒绝并给出稳定错误分类

#### TC-BND-005 空 contributors 列表
- Given cross-agent 开启但 `contributors=[]`
- When 调用 `update`
- Then 若规格允许则成功；若不允许则稳定报错（以契约为准），不可出现静默降级

### 3.4 并发与恢复（Concurrency & Recovery）

#### TC-CONC-001 并发 next 锁竞争
- Given 同一任务并发触发多个 `next`
- When 锁冲突发生
- Then 仅一个请求成功，其余请求返回稳定锁冲突/超时错误码，状态不损坏

#### TC-CONC-002 并发 update 原子写
- Given 并发 `update` 高频写入
- When 写入竞争发生
- Then 状态文件保持 JSON 完整，不出现半写入或损坏

#### TC-CONC-003 重复补齐动作幂等
- Given 同一“状态补齐/修复”动作被重复触发
- When 并发执行
- Then 结果幂等，不产生重复 side effects（如重复记录/重复迁移）

#### TC-REC-001 worktree 缺状态文件回退只读
- Given 当前 worktree 状态文件缺失
- When 触发 fallback 读取主仓状态
- Then 允许读取但禁止写回覆盖主仓文件

#### TC-REC-002 状态文件损坏恢复
- Given 状态 JSON 损坏
- When 调用 `status/next`
- Then 返回状态损坏错误码与可监控分类，不执行不安全修复

### 3.5 安全专项（OWASP 导向）

#### TC-SEC-001 权限绕过尝试（A01）
- Given 构造伪造角色上下文
- When 调用 `next`
- Then 鉴权失败，审计记录包含拒绝原因，阶段不变

#### TC-SEC-002 输入注入防护（A03）
- Given 在 `notes/comments/task_cards.title` 注入脚本或命令片段
- When 调用 `update/submit-review`
- Then 输入按数据字段处理，不触发执行，持久化可控且不破坏 JSON

#### TC-SEC-003 回退覆盖防护（A08）
- Given fallback 路径可访问主仓状态
- When 发起恢复流程
- Then 主仓状态文件只读，不被当前 worktree 覆盖

#### TC-SEC-004 日志可审计性（A09）
- Given 任意阻断类失败
- When 检查事件与错误输出
- Then 错误分类与退出码稳定，支持告警聚合

### 3.6 性能专项（控制面低频高竞争）

#### TC-PERF-001 并发冲突下响应上界
- Given 20 并发请求竞争同一状态锁
- When 连续执行 3 轮
- Then P95 响应时间在设计阈值内，且无状态损坏

#### TC-PERF-002 审计字段开销评估
- Given 启用完整事件字段记录
- When 执行 100 次 `status` 与 30 次 `next/update`
- Then 相比基线开销在可接受区间（阈值由实现定义），无明显退化

## 4. 缺陷分级与报告模板

### 4.1 严重级别
- P0: 安全失守/数据破坏/终态可误推进
- P1: 核心门禁失效/并发原子性失效/审计不可追踪
- P2: 非核心流程错误或降级
- P3: 文档、提示或低风险体验问题

### 4.2 P0/P1 归零必答（三问）
每个 P0/P1 缺陷在关闭时必须回答：
1. 修复内容是什么？
2. 引入原因是什么？
3. 归因路径是什么（需求、设计、实现、测试哪一环失守）？

### 4.3 Bug 报告字段
- 标题：`[Severity][模块] 简述`
- 环境：分支/commit/worktree/时间
- 前置条件
- 复现步骤（最小步骤）
- 期望结果
- 实际结果
- 证据（日志/状态快照/命令输出）
- 影响范围
- 临时缓解方案（如有）

## 5. 自动化建议（Stage 6/7 落地）

1. 将 TC-ERR-001/002/004/005、TC-BND-001、TC-CONC-001 设为阻断门禁自动化（CI 必跑）。
2. 将 TC-SEC-001/003/004 纳入安全回归套件，每次 workflow handler 变更触发。
3. 为 TC-REC-001/002 建立回归夹具（缺文件/坏文件/并发冲突）以防回归。

## 6. 阶段门禁声明（Stage 5）

- 门禁结论：`PASS`（测试设计阶段完成，可进入 Stage 6 Development）
- 已验证（设计级）：
1. 覆盖正常/异常/边界/并发/安全/性能六大维度。
2. 所有关键契约（State/Event/Handoff）均落入可执行 Given-When-Then 用例。
3. P0/P1 缺陷归零机制与报告模板已定义。
- 遗留风险：
1. 当前为测试设计产物，尚未执行实测；真实缺陷发现需 Stage 7 集成验证。
2. 性能阈值（N、P95、开销基线）需由 Stage 6 实现提供具体配置后固化。

## 7. 证据路径

- `docs/workflow/task-2f6c911d/qa-stage5-test-case-design-2026-03-31.md`
