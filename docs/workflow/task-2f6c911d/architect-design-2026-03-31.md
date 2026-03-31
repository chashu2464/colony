# Colony 新 5 阶段 Workflow 蓝图（Stage 2 / Architect）

- Task ID: `2f6c911d`
- Stage: 2 (System/Architectural Design)
- Date: `2026-03-31`
- Blueprint Version: `v0.2`

## 1) 三种 workflow 的关系与差异

### 1.1 一句话定位
- **Clowder workflow**：强调少阶段、强交付单元、协作效率优先。
- **Colony 旧 workflow（0-9）**：强调质量门禁和可审计性优先。
- **Colony 新 workflow（5 阶段）**：在保持 Colony 安全门禁的前提下，引入 Clowder 的高效率阶段模型。

### 1.2 差异矩阵（核心）
| 维度 | Clowder（参考） | Colony 旧（现状） | Colony 新（目标） |
|---|---|---|---|
| 阶段数量 | 5（目标参考） | 10（0-9） | 5（v2） |
| 控制粒度 | 中 | 细 | 中（保留关键门禁） |
| 协作方式 | 产物驱动交接 | 阶段驱动交接 | 阶段+任务卡双驱动 |
| 可观测性 | 中 | 高 | 高 |
| 迁移策略 | - | - | 仅新任务启用 |

## 2) 新 workflow（v2）阶段定义

### Stage A: Discovery
- Owner: architect
- 目标：冻结需求边界、约束、验收口径
- 产物：`discovery.md`

### Stage B: Design
- Owner: architect
- 目标：冻结接口契约、数据模型、风险清单
- 产物：`design.md`

### Stage C: Build
- Owner: developer
- 目标：落地实现与单元验证
- 产物：实现提交 + `build-report.md`

### Stage D: Verify
- Owner: qa_lead
- 目标：集成验证、缺陷闭环、回归
- 产物：`verify-report.md`

### Stage E: Release
- Owner: architect
- 目标：上线评审、风险接受、归档
- 产物：`release-review.md`

## 3) 接口契约（控制面）

### 3.1 Workflow State v2（新增字段）
```json
{
  "workflow_version": "v2",
  "current_stage": 0,
  "stage_name": "Discovery",
  "assignments": {
    "architect": "architect",
    "developer": "developer",
    "qa_lead": "qa-lead",
    "designer": "designer"
  },
  "extensions": {
    "board_mode": false,
    "cross_agent_mode": false
  }
}
```

### 3.2 Stage Change Event Contract（兼容扩展）
```json
{
  "type": "WORKFLOW_STAGE_CHANGED",
  "roomId": "string",
  "workflow_version": "v2",
  "from_stage": 1,
  "to_stage": 2,
  "next_actor_role": "developer",
  "next_actor": "developer",
  "event_id": "wf_xxx",
  "decision_source": "stage_map"
}
```

### 3.3 Handoff Contract（跨猫协作核心）
```json
{
  "handoff_contract": {
    "input": ["contract_v2", "test_matrix"],
    "output": ["implementation", "evidence"],
    "risk": ["state_conflict", "missing_assignment"],
    "owner": "developer"
  }
}
```

## 4) 数据模型设计（扩展模式）

### 4.1 告示牌模式（Board Mode）
```json
{
  "board": {
    "todo": [{"id":"B-1","title":"定义阶段映射","owner":"architect"}],
    "in_progress": [],
    "blocked": [{"id":"B-2","block_reason":"WF_ROUTING_MISSING_ASSIGNMENT","owner":"developer"}],
    "done": []
  }
}
```

### 4.2 跨猫协作（Cross-Agent Mode）
```json
{
  "cross_agent": {
    "enabled": true,
    "main_owner": "developer",
    "contributors": ["qa-lead", "designer"],
    "task_cards": [
      {"id":"CA-1","title":"补测试矩阵","owner":"qa-lead","status":"in_progress"}
    ]
  }
}
```

## 5) 路由与门禁策略
1. **单写入者原则**：只有阶段 owner 能执行 `next`。
2. **协作多写原则**：协作者只可更新 task cards / review，不可推进阶段。
3. **Fail-closed 原则**：assignment 缺失、证据缺失、review 缺失时阻断。
4. **终态原则**：Release 完成后进入 Completed，不允许重复 next。

## 6) 迁移策略（v1 -> v2）
- 决策：**仅新任务启用 v2**，旧任务继续使用 v1。
- 映射策略：无中间态迁移，不做批量回填。
- WHY：避免对进行中任务引入状态语义变化风险。

## 7) 实施分解（落地顺序）
1. `dev-workflow` 增加 `workflow_version` 与 5 阶段映射表。
2. 在 `next/status/update` 保持 v1/v2 双轨兼容。
3. 增加 `extensions.board/cross_agent` 数据结构与校验。
4. QA 增加 v2 回归矩阵（门禁、路由、终态、扩展模式）。
5. 架构进行 Release Gate 签收。

## 8) 架构风险与缓解
- 风险 R1：v1/v2 并存导致分支逻辑膨胀。
  - 缓解：以 `workflow_version` 做单入口分派，避免散落条件判断。
- 风险 R2：跨猫协作引入并发写冲突。
  - 缓解：沿用现有 lock + 原子写；task card 更新走同一写路径。
- 风险 R3：Board 状态失真。
  - 缓解：blocked 项必须带机读 `block_reason`，并与审计日志关联。

## 9) 基础设施可行性检查
- 调度/执行频率：阶段推进与任务卡更新均为低频控制面操作。
- 现有能力：`handler.sh` 原子写 + lock + route 派发满足规模需求。
- 结论：无需引入新调度系统，可在现有链路内增量实现 v2。
- 理由：复用已有稳定基础设施，降低迁移复杂度与上线风险。

## 10) M1-M4 里程碑蓝图（补充细化）

### M1：`dev-workflow-v2` 状态机落地（核心先行）
**一句话目标**：先把 5 阶段主干与终态保护做成“默认安全”，再叠加协作能力。

#### M1.1 子决策（独立呈现）
1. **阶段模型决策**
   - 结论：v2 采用 `Discovery -> Design -> Build -> Verify -> Release -> Completed` 六状态（含终态）。
   - 推导来源：Clowder 5 阶段目标 + Colony 终态不可操作要求（见 Stage 1 IR 的核心需求 1/2）。
   - 理由：保持阶段数精简，同时保留上线后不可误操作的硬边界。
2. **门禁策略决策**
   - 结论：`next` 必须满足 owner 权限、证据存在、必要 review 通过；任一缺失 fail-closed。
   - 推导来源：现有 v1 门禁语义与 `WF_PERMISSION_DENIED / WF_REVIEW_REQUIRED / WF_EVIDENCE_MISSING` 既有错误码体系。
   - 理由：将质量要求前置到状态机层，避免“先推进后补证据”。
3. **终态策略决策**
   - 结论：进入 `Completed` 后仅允许 `status`，禁止 `next/review/block/backtrack`。
   - 推导来源：旧流程 Stage 9 终态治理经验（已在已完成任务中验证）。
   - 理由：消除终态污染，确保审计链路只增不改。

#### M1.2 接口契约（控制面）
- `status` 响应新增并固定返回：`workflow_version`, `current_stage`, `stage_name`, `allowed_actions`。
- `next` 请求最小契约：`task_id`, `actor`, `evidence[]`（Design/Verify/Release 阶段需含 `review`）。
- 错误码稳定性：
  - 鉴权失败：`WF_PERMISSION_DENIED`
  - 证据缺失：`WF_EVIDENCE_MISSING`
  - 审核缺失：`WF_REVIEW_REQUIRED`
  - 非法转移：`WF_STAGE_TRANSITION_INVALID`
  - 终态阻断：`WF_TERMINAL_STAGE_LOCKED`

#### M1.3 验收与观测
- 合法转移通过率 = `通过的合法 next 次数 / 合法 next 总次数`，目标 **100%**。
- 非法转移拦截率 = `返回稳定错误码的非法请求数 / 非法请求总数`，目标 **100%**。
- 终态污染率 = `Completed 后发生状态变更的任务数 / Completed 任务总数`，目标 **0**。
- 指标来源：workflow history、路由返回码、事件日志三方对账。

---

### M2：`workflow-board` 告示牌模式落地（可观测）
**一句话目标**：让协作状态可一眼读取、可追溯回放、可按阻塞点定位责任人。

#### M2.1 子决策（独立呈现）
1. **双模型决策（Snapshot + Event Feed）**
   - 结论：同时维护当前态快照与事件流，不用事件流反算当前态。
   - 推导来源：运维查询以低延迟读为主，且回放需求与当前态读取需求并存。
   - 理由：读路径清晰，避免“查询当前态需要全量回放”的性能与复杂度问题。
2. **阻塞项强约束决策**
   - 结论：`board.blocked[]` 必填 `block_reason`（机读）和 `owner`。
   - 推导来源：Stage 7/8 复盘显示，缺机读原因会导致跨角色沟通成本显著上升。
   - 理由：统一阻塞语义，支持自动聚合和告警。
3. **查询契约收敛决策**
   - 结论：固定三类查询：`board.get`、`board.events`、`board.blockers`。
   - 推导来源：覆盖 80% 协作场景（看当前态、追变更、查阻塞）。
   - 理由：避免过度 API 设计，先满足高频查询。

#### M2.2 数据模型（文档化）
- `BoardSnapshot`
  - 字段：`task_id`, `workflow_version`, `stage_name`, `owner`, `todo[]`, `in_progress[]`, `blocked[]`, `done[]`, `updated_at`
- `BoardEvent`
  - 字段：`seq`, `event_id`, `task_id`, `actor`, `action`, `from_stage`, `to_stage`, `timestamp`, `evidence_refs[]`
- `BoardBlocker`
  - 字段：`id`, `title`, `owner`, `block_reason`, `created_at`, `related_event_id`

#### M2.3 验收与观测
- 一次查询可见当前关键信息命中率 = `1 次查询拿到 stage+owner+blocker 的任务数 / 抽样任务数`，目标 **100%**。
- 事件可追溯完整率 = `可从 stage change 追到 event+evidence 的事件数 / stage change 事件总数`，目标 **100%**。
- 分页回放正确率 = `无丢序/无重复分页查询次数 / 分页查询总次数`，目标 **100%**。

---

### M3：`cross-room-bridge` Phase 1（先消息桥）
**一句话目标**：先实现跨房间“消息可达 + 回执可审计 + 幂等不重放”。

#### M3.1 子决策（独立呈现）
1. **能力范围决策（仅消息桥）**
   - 结论：Phase 1 仅做 `BridgeMessage + BridgeAck`，不引入跨房间任务事务编排。
   - 推导来源：当前链路已有房间内工作流语义，跨房间事务会显著扩大失败域。
   - 理由：先做小闭环验证可达性，再演进复杂编排。
2. **幂等策略决策**
   - 结论：以 `idempotency_key` 作为消费端去重主键，重复投递返回同一处理结果。
   - 推导来源：网络抖动与重试机制天然会造成重复消息。
   - 理由：避免“至少一次投递”带来的重复执行副作用。
3. **追踪策略决策**
   - 结论：`trace_id` 全链路透传，bridge send/ack/error 共用同一追踪标识。
   - 推导来源：跨房间故障定位需要端到端关联，而非单点日志。
   - 理由：降低排障时间并提升审计可读性。

#### M3.2 协议契约（文档化）
- `BridgeMessage`
  - 字段：`message_id`, `source_room_id`, `target_room_id`, `payload`, `idempotency_key`, `trace_id`, `sent_at`
- `BridgeAck`
  - 字段：`message_id`, `target_room_id`, `status`, `error_code?`, `error_message?`, `processed_at`, `trace_id`

#### M3.3 验收与观测
- 消息可达率（按回执计） = `status=ok 的 ack 数 / 发送消息总数`，目标 **>=99.9%**。
- 去重正确率 = `重复投递且未重复处理的消息数 / 重复投递消息总数`，目标 **100%**。
- 失败可追踪率 = `带 error_code+timestamp+target_room_id 的失败记录数 / 失败总数`，目标 **100%**。

---

### M4：回归矩阵 + 灰度切换（上线控制）
**一句话目标**：通过“可灰度、可回退、可观测”确保 v2 切换期风险可控。

#### M4.1 子决策（独立呈现）
1. **灰度范围决策**
   - 结论：仅新任务默认 v2；旧任务保持原版本并允许只读收尾。
   - 推导来源：中间态迁移风险 > 新任务切换风险（依据 Stage 1 迁移边界）。
   - 理由：避免在切换窗口引入历史状态语义不一致。
2. **回退粒度决策**
   - 结论：按 `task_id` 粒度回退 workflow_version，不做全局一键回退。
   - 推导来源：问题通常是局部数据或任务配置问题，而非全局系统性故障。
   - 理由：缩小故障面，避免误伤稳定任务。
3. **发布门禁决策**
   - 结论：必须通过回归矩阵（状态流转/终态保护/证据校验/跨房间消息）后才扩大灰度。
   - 推导来源：本次 v2 实施中契约回归（尤其 backtrack）曾出现遗漏。
   - 理由：先证据后扩量，避免重复引入已知类型回归。

#### M4.2 回归矩阵（最小集）
- R1：状态流转正向/回退路径
- R2：终态锁定与只读校验
- R3：证据/评审缺失的 fail-closed
- R4：v1/v2 并存隔离（含 room-scoped idempotency）
- R5：Bridge 消息重试、去重、回执追踪

#### M4.3 发布后观测指标
- 阶段推进失败率 = `失败 next/backtrack 数 / 总 next/backtrack 数`
- 平均流转时延 = `Σ(阶段完成时间 - 阶段进入时间) / 阶段样本数`
- 阻塞平均时长 = `Σ(blocked 解除时间 - blocked 进入时间) / blocked 样本数`
- 灰度闭环率 = `在 v2 完成 Release->Completed 的新任务数 / v2 新任务总数`

#### M4.4 基础设施可行性复核
- 评估对象：事件写入频率、状态文件原子写、路由派发吞吐、日志追踪容量。
- 结论：当前控制面仍为低频写入，不需要新增调度器；优先用现有 `lock + atomic write + event log` 能力承载。
- 推导来源：已落地 v2 任务（`2f6c911d`）的真实运行轨迹与测试矩阵结果。
- 理由：在现有稳定链路上扩展观测与门禁，比引入新基础设施更稳妥。

## 11) 里程碑依赖与顺序
1. M1（状态机）为先决条件；未完成不得进入 M2/M3。
2. M2（可观测）与 M3（跨房间消息桥）可并行，但都需在 M4 前完成基线验证。
3. M4（灰度/回退/观测）是上线前硬门禁，不可跳过。

## 12) 文档持久化与审计要求
- 蓝图主文档：`docs/workflow/task-2f6c911d/architect-design-2026-03-31.md`
- 实施/测试/评审证据：同目录下 stage 文档与测试报告
- 审计对齐规则：每个里程碑至少包含“设计决策 + 契约/模型 + 验收指标 + 风险与缓解”。

## 13) 当前蓝图版本
- Blueprint Version: `v0.2`（在 `v0.1` 基础上补充 M1-M4 细化、验收指标与可观测定义）

