# Colony 新 5 阶段 Workflow 蓝图 IR（Architect）

- Task ID: `2f6c911d`
- Stage: 1 (Initial Requirements)
- Date: `2026-03-31`
- 分类：新功能（协作工作流重构）

## 1. 目标与边界
### 目标
在保持 Colony 现有 fail-closed 与审计能力前提下，参考 Clowder 的精简流程思想，定义可落地的 **5 阶段新 workflow**，并纳入：
1) 告示牌模式（Board/Billboard）
2) 跨猫协作（Cross-Agent/Cross-Role Collaboration）

### 边界
- In Scope（本蓝图）
  - 阶段模型（5 阶段）
  - 阶段角色映射与门禁
  - 接口契约与数据模型
  - 迁移策略（仅新任务启用）
  - 告示牌模式与跨猫协作扩展点
- Out of Scope（后续迭代）
  - 业务执行器重构
  - 全量历史任务自动迁移
  - 多房间跨实例调度器改造

## 2. 三套 workflow 对比（结论化）
### Clowder（参考）
- 特征：阶段少、责任清晰、交接产物导向。
- 价值：降低流程切换成本，提高并行协作效率。

### Colony 旧 workflow（0-9）
- 特征：门禁细、控制面强、审计完整。
- 成本：阶段较多，状态转换复杂，跨角色交接成本高。

### Colony 新 workflow（提案）
- 路线：采用 5 阶段主干 + 扩展模式插件化。
- 保留：fail-closed、审计链路、角色 assignment 决策。
- 新增：告示牌模式与跨猫协作能力。

## 3. 新 5 阶段定义（冻结）
1. **Discovery**（需求澄清）
   - Owner: architect
   - 输出：范围、约束、验收标准
2. **Design**（架构设计）
   - Owner: architect
   - 输出：接口契约、数据模型、风险与回滚策略
3. **Build**（实现）
   - Owner: developer
   - 输出：实现代码、单测、实现说明
4. **Verify**（验证）
   - Owner: qa_lead
   - 输出：测试报告、缺陷闭环结果
5. **Release**（上线评审与归档）
   - Owner: architect
   - 输出：发布结论、风险接受、归档产物

## 4. 核心需求（可验收）
1. **阶段机需求**
- 必须支持 5 阶段顺序推进与受控回退。
- 阶段推进必须记录结构化审计信息。

2. **门禁需求**
- Design、Verify、Release 前必须具备有效 review（可配置）。
- 缺失 review / assignment / 证据时 fail-closed。

3. **告示牌模式需求**
- 每阶段维护 board：`todo / in_progress / blocked / done`。
- blocked 条目必须附 `block_reason`（机读）与 `owner`。

4. **跨猫协作需求**
- 支持同阶段内“主负责人 + 协作方”并行任务卡。
- 交接必须有 `handoff_contract`（输入/输出/风险）。

5. **兼容需求**
- 旧 10 阶段任务不强制迁移；仅新任务启用 5 阶段。
- 状态文件需携带 `workflow_version` 以区分引擎行为。

## 5. 子决策（按三原则独立呈现）
### 决策 A：采用“新任务启用新流程”的迁移策略
- 结论：不迁移中间态旧任务；新开任务走 5 阶段。
- 推导来源：当前房间状态核验已无中间 stage 任务在跑（本轮确认）；历史任务存在状态差异风险。
- 一句话理由：避免迁移不确定性影响当前交付稳定性。

### 决策 B：告示牌模式做成可选能力，不绑死主流程
- 结论：Board 作为 `workflow_extensions.board` 挂载。
- 推导来源：并非所有任务都需要可视化拆解；轻量任务应保持低摩擦。
- 一句话理由：把复杂度留给复杂任务，默认路径仍简洁。

### 决策 C：跨猫协作采用“主责单写 + 协作多写”模型
- 结论：阶段推进权只归主负责人，协作方可更新子任务卡与评审意见。
- 推导来源：现有 stage owner 语义清晰，若多方都可推进会破坏确定性。
- 一句话理由：保证状态机单写入者，降低并发冲突与误推进风险。

## 6. 验收标准
1. 能创建 `workflow_version=v2`（5 阶段）任务并完成端到端推进。
2. Board 扩展开启后，可见 `todo/in_progress/blocked/done` 且 blocked 有机读原因。
3. 跨猫协作场景下，协作方可提交任务卡更新，但仅 owner 可 `next`。
4. 审计链路可按 `event_id` 串联“阶段推进→路由决策→消息派发”。
5. 旧 v1（10 阶段）任务不受影响。

## 7. 基础设施可行性检查
- 调度频率评估：workflow stage 推进属于低频控制面事件（单任务通常 <20 次状态变更）。
- 承载能力：现有 `handler.sh + /api/workflow/events + room message` 链路可承载 v2。
- 结论：无需新增调度器；优先复用现有链路并扩展状态模型。
- 一句话理由：低频控制面最适合“最小改动、可审计增强”路径。
