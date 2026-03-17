# quick-task 使用约束与边界

## 设计定位

quick-task 是轻量级快速迭代工具，**不提供物理隔离和并行执行能力**。它通过分支策略提供基础的逻辑隔离，适用于单会话、低风险的小型任务。

## 核心约束

### 1. 并发限制（硬性约束）
- **单会话串行执行**：同一房间内同时只能有一个 quick-task 处于活跃状态
- **无跨会话隔离**：不同会话的 quick-task 共享同一工作区，存在冲突风险
- **分支冲突风险**：多个会话同时操作可能导致分支冲突或状态覆盖

**判定标准**：如果需要多个任务并行执行，必须使用 dev-workflow（提供 worktree 物理隔离）。

### 2. 任务规模限制（硬性约束）
- **时间上限**：< 1 小时的任务
- **文件数量**：≤ 3 个文件的修改
- **代码行数**：≤ 100 行的变更
- **复杂度**：无架构变更、无跨模块依赖

**判定标准**：超过任一指标，必须使用 dev-workflow。

### 3. 质量保障缺失（风险提示）
- **无 TDD 流程**：不强制测试先行
- **无多方评审**：无架构师/QA 的设计评审环节
- **无集成测试**：仅依赖开发者自测
- **无回滚机制**：无阶段性快照，回退困难

**判定标准**：涉及核心业务逻辑、安全敏感操作、用户数据处理的任务，必须使用 dev-workflow。

### 4. 适用场景（白名单）
仅限以下场景使用 quick-task：
- 文档更新（README、注释、配置说明）
- 代码格式化（linting、formatting）
- 简单 Bug 修复（单函数内的逻辑错误，无副作用）
- 日志/调试代码添加
- 依赖版本更新（无 breaking changes）

**判定标准**：不在白名单内的任务，默认使用 dev-workflow。

## 使用前检查清单

在启动 quick-task 前，必须确认以下所有条件：

- [ ] 当前房间内无其他活跃的 quick-task（执行 `status` 确认）
- [ ] 工作区干净（`git status` 无未提交变更）
- [ ] 任务符合规模限制（时间 < 1h，文件 ≤ 3，行数 ≤ 100）
- [ ] 任务在适用场景白名单内
- [ ] 无需多方评审或 TDD 流程
- [ ] 无其他会话正在执行 dev-workflow（避免分支冲突）

**如果任一条件不满足，停止使用 quick-task，改用 dev-workflow。**

## 与 dev-workflow 的对比

| 维度 | quick-task | dev-workflow |
|------|-----------|--------------|
| 隔离方式 | 分支（逻辑隔离） | worktree（物理隔离） |
| 并发能力 | 单会话串行 | 多会话并行 |
| 质量保障 | 无 | TDD + 多方评审 |
| 适用规模 | < 1h，≤ 3 文件 | 无上限 |
| 回滚能力 | 无 | 阶段性快照 |
| 冲突风险 | 高（共享工作区） | 低（独立工作区） |
| 启动成本 | 低（秒级） | 中（需创建 worktree） |

## 强制执行机制

### 启动时检查
`quick-task start` 时自动执行以下检查：
1. 检查当前房间是否已有活跃任务（读取 state file）
2. 检查工作区是否干净（`git status --porcelain`）
3. 如果检查失败，拒绝启动并提示使用 dev-workflow

### 完成时验证
`quick-task done` 时自动执行以下验证：
1. 检查变更文件数量（`git diff --name-only`）
2. 检查变更行数（`git diff --stat`）
3. 如果超过限制，警告并建议后续使用 dev-workflow

## 迁移路径

如果在 quick-task 执行过程中发现任务超出边界：

1. **立即停止当前 quick-task**（不执行 `done`）
2. **保留当前分支**（`feature/quick-{id}`）
3. **初始化 dev-workflow**：
   ```bash
   echo '{"action": "init", "task_name": "原任务名称", "description": "从 quick-task 迁移"}' | bash skills/dev-workflow/scripts/handler.sh
   ```
4. **手动合并分支到 dev-workflow 的 feature 分支**
5. **删除 quick-task 状态文件**：`rm .data/quick-tasks/$ROOM_ID.json`

## 违规处理

如果发现以下违规行为，必须立即停止并回滚：
- 在 quick-task 中修改核心业务逻辑
- 在 quick-task 中进行架构变更
- 多个会话同时使用 quick-task 导致冲突
- 任务执行时间超过 1 小时

**回滚步骤**：
1. `git checkout master` 或 `git checkout main`
2. `git branch -D feature/quick-{id}`
3. `rm .data/quick-tasks/$ROOM_ID.json`
4. 使用 dev-workflow 重新开始

## 文档更新记录
- 2026-03-17: 初始版本，定义核心约束和使用边界
