# Stage 4 Reverse Briefing（QA -> Developer）

- Task ID: `2f6c911d`
- Stage: 4 (Reverse Briefing)
- Date: `2026-03-31`
- Owner: `qa_lead`
- Audience: `developer`

## 1. 反向复述结论（设计理解一致性）

QA 对 Stage 2/3 的设计理解如下，作为后续 Stage 5/6/7 的统一基线：

1. 工作流采用双轨并存：`workflow_version=v2` 仅用于新任务，v1 历史任务保持原行为，不做强制迁移。
2. v2 主链路按 5 阶段模型执行（Discovery/Design/Build/Verify/Release），并映射到当前 dev-workflow 阶段机中的可执行门禁行为。
3. 阶段推进遵循 owner 权限边界：只有 stage owner 可执行 `next`；协作者仅能提交评审/更新任务信息。
4. 门禁统一 fail-closed：assignment、evidence、review 任一必要条件缺失时必须阻断，禁止降级放行。
5. Release 进入 Completed 后为终态，只允许 `status` 只读核验，禁止重复 `next`。
6. board mode 与 cross-agent mode 为可选扩展：允许增强协作形态，但不得破坏主链路状态机一致性与审计可追踪性。

结论：QA 与开发对核心契约、阶段权限、失败语义和终态行为已对齐。

## 2. 可测试契约复述（作为 Stage 5 输入）

### 2.1 State Contract
- 状态输出必须稳定包含：`workflow_version`、`current_stage`、`stage_name`、`assignments`。
- 扩展域通过 `extensions.board_mode` 与 `extensions.cross_agent_mode` 挂载。
- v1/v2 分派必须基于 `workflow_version` 单入口，避免分散条件分支造成测试不可判定。

### 2.2 Stage Change Event Contract
- 阶段事件必须可审计追踪：`roomId`、`from_stage`、`to_stage`、`next_actor_role`、`next_actor`、`event_id`、`decision_source`。
- 事件链应支持从 stage transition 回溯到路由与消息派发结果。

### 2.3 Handoff Contract
- 输入：`contract_v2`、`test_matrix`。
- 输出：`implementation`、`evidence`。
- 风险域：`state_conflict`、`missing_assignment`。

## 3. Given-When-Then 测试策略（覆盖正常/异常/边界/并发）

### 3.1 正常流程
1. Given 新建 `workflow_version=v2` 任务且 assignments/evidence/review 完整
   When 按 owner 顺序执行阶段推进
   Then 流程可顺序通过 Discovery->Design->Build->Verify->Release 并进入 Completed。

2. Given 阶段推进触发路由
   When 查询 stage change event
   Then `next_actor_role`/`next_actor` 与阶段映射一致且 `event_id` 可关联审计链路。

### 3.2 异常流程（fail-closed）
1. Given 必需 assignment 缺失
   When owner 调用 `next`
   Then 返回阻断错误并保持原阶段不变。

2. Given evidence 缺失或路径非法
   When owner 调用 `next`
   Then 返回阻断错误并输出稳定错误语义（可监控聚合）。

3. Given 必要 review 缺失
   When 调用 `next`
   Then 阶段推进被拒绝且记录可审计拒绝原因。

4. Given 非 owner 身份尝试推进
   When 调用 `next`
   Then 权限拒绝并保持状态不变。

### 3.3 边界条件
1. Given 任务已处于 Completed（终态）
   When 再次调用 `next`
   Then 必须拒绝，且只允许 `status` 只读核验。

2. Given v1/v2 任务并存
   When 分别调用 `status`/`next`
   Then 两条轨道行为隔离，不发生 schema 污染或错误路由。

3. Given `extensions.board_mode.blocked=true`
   When 缺失 `block_reason` 或 `owner`
   Then 校验失败并拒绝写入不完整扩展状态。

### 3.4 并发与恢复
1. Given 并发触发 `status/update/next`
   When 发生锁竞争
   Then 返回稳定错误码（含超时语义）且无部分写入。

2. Given worktree 缺失 workflow 状态文件
   When 触发读取回退
   Then 允许只读 fallback，不得写回覆盖主仓状态。

3. Given 并发触发“状态补齐/修复”
   When 同一修复动作重复执行
   Then 保持幂等，不产生重复修复副作用。

## 4. 漏洞审查与安全关注点（OWASP Top 10 导向）

1. 权限绕过（A01）
- 风险：非 owner 越权推进 stage。
- 要求：阶段推进前执行强鉴权，拒绝隐式提权。

2. 完整性破坏（A08）
- 风险：回退读取路径写回主仓导致状态污染。
- 要求：fallback 严格只读；状态写入仅限当前工作树原子落盘。

3. 安全日志与监控缺失（A09）
- 风险：错误语义不稳定导致告警不可聚合。
- 要求：错误码/错误分类稳定化并纳入审计事件。

4. 输入校验不足（A03）
- 风险：扩展字段（board/cross-agent）结构不合法进入状态文件。
- 要求：schema 校验 fail-closed，拒绝半结构化脏数据。

## 5. 性能与稳定性关注点

1. 并发场景下锁竞争等待时间需可预期，避免高冲突下状态抖动。
2. 状态文件读写必须采用原子落盘，避免部分写入导致 JSON 损坏。
3. 事件审计链路字段应固定，避免观测面波动影响定位效率。

## 6. P0/P1 归零检查（本阶段）

- 本阶段为设计复述与可测性对齐，未执行代码变更验证，当前未登记新增 P0/P1 缺陷。
- 若后续 Stage 5/7 发现 P0/P1，必须逐条回答：
  1) 修复内容
  2) 引入原因
  3) 归因路径

## 7. 阶段门禁声明（Stage 4）

门禁结论：`PASS`（允许进入 Stage 5 Test Case Design）

已验证场景：
1. 核心契约复述完整：State/Event/Handoff 三类契约无歧义。
2. 分支覆盖策略完备：正常/异常/边界/并发四类测试入口明确。
3. 安全基线明确：权限、输入校验、完整性与可观测性风险均已纳入后续测试范围。
4. 终态治理一致：Completed 仅 `status` 核验、禁止重复 `next`。

遗留风险：
1. 当前阶段仅完成“设计一致性验证”，尚未执行 Stage 5 具体用例与 Stage 7 实测。
2. board/cross-agent 扩展在高并发真实流量下的性能数据尚未采集，需在集成测试阶段补齐。

## 8. 证据与引用

- `docs/workflow/task-2f6c911d/architect-ir-2026-03-31.md`
- `docs/workflow/task-2f6c911d/architect-design-2026-03-31.md`
- `docs/workflow/task-2f6c911d/developer-stage3-forward-briefing-2026-03-31.md`
- `docs/workflow/task-2f6c911d/artifacts/2f6c911d-ucd.md`
