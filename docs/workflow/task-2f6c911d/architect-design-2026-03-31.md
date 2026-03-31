# Colony 新 5 阶段 Workflow 蓝图（Stage 2 / Architect）

- Task ID: `2f6c911d`
- Stage: 2 (System/Architectural Design)
- Date: `2026-03-31`
- Blueprint Version: `v0.1`

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
