# quick-task 文档约束强化 - 架构决策记录

## 决策背景

用户提出两个关键问题：
1. dev-workflow 虽然支持 worktree 物理隔离，但是否仍依赖分支，是否会有冲突？
2. 是否应该将 TDD 和 worktree 引入 quick-task，或直接删除 quick-task？

用户最终决策：**保留 quick-task，但加强文档约束**。

## 架构决策

### 决策 1：明确 quick-task 的定位和边界

**决策内容**：quick-task 定位为"轻量级快速迭代工具"，不提供物理隔离和并行执行能力。

**理由**：
- quick-task 和 dev-workflow 服务于不同的场景，不应强行统一
- quick-task 的价值在于"快"（秒级启动），引入 worktree 会失去这个优势
- 通过严格的文档约束和自动化检查，可以将 quick-task 限制在安全的使用范围内

**实现**：创建 `CONSTRAINTS.md` 文档，定义四大核心约束：
1. 并发限制（单会话串行）
2. 任务规模限制（< 1h，≤ 3 文件，≤ 100 行）
3. 质量保障缺失（无 TDD/评审/集成测试）
4. 适用场景白名单（文档/格式化/简单修复/日志/依赖更新）

### 决策 2：在 handler.sh 中强制执行约束

**决策内容**：通过代码层面的检查，自动拒绝违反约束的操作。

**理由**：
- 文档约束依赖人工遵守，容易被忽略
- 自动化检查可以在启动和完成时拦截违规操作
- 提供清晰的错误提示，引导用户使用正确的工具

**实现**：
1. **启动时检查**（`start` action）：
   - 检查是否已有活跃任务（防止并发）
   - 检查工作区是否干净（防止状态污染）
   - 违规时拒绝启动，提示使用 dev-workflow

2. **完成时验证**（`done` action）：
   - 检查变更文件数量（`git diff --name-only`）
   - 检查变更行数（`git diff --stat`）
   - 超过限制时发出警告，建议后续使用 dev-workflow

### 决策 3：创建工作流选择指南

**决策内容**：提供详细的决策树和案例分析，帮助用户选择正确的工具。

**理由**：
- 用户需要清晰的指引，而不是模糊的"小任务用 quick-task，大任务用 dev-workflow"
- 通过对比表格和实际案例，降低选择成本
- 明确两者的定位差异，避免误用

**实现**：创建 `docs/workflow-selection-guide.md`，包含：
1. 快速决策树（5 个判定条件）
2. 详细对比表格（隔离能力、质量保障、回滚能力、成本、风险）
3. 6 个实际案例（从简单到复杂）
4. 迁移路径（quick-task → dev-workflow）
5. 常见误区纠正

### 决策 4：在 SKILL.md 中突出约束提示

**决策内容**：在 quick-task 的 SKILL.md 顶部添加醒目的约束提示和快速判定清单。

**理由**：
- SKILL.md 是用户首先看到的文档，必须在此处明确约束
- 提供快速判定清单（✅ 可以使用 / ❌ 必须使用 dev-workflow），降低决策成本
- 引导用户阅读完整的 CONSTRAINTS.md 和选择指南

**实现**：
- 添加 "⚠️ 重要：使用前必读" 章节
- 提供快速判定清单（6 个条件）
- 链接到 CONSTRAINTS.md 和 workflow-selection-guide.md

## 关于 dev-workflow 并发能力的澄清

### 问题：dev-workflow 是否仍依赖分支，是否会有冲突？

**答案**：dev-workflow 通过 worktree 提供物理隔离，**不会**有跨会话冲突。

**技术原理**：
1. **物理隔离**：每个 dev-workflow 任务在独立的 worktree 目录中执行
   - 任务 A 在 `.claude/worktrees/task-123/` 中
   - 任务 B 在 `.claude/worktrees/task-456/` 中
   - 两者完全独立，不共享文件系统

2. **分支隔离**：每个 worktree 对应独立的 feature 分支
   - 任务 A 使用 `feature/task-123` 分支
   - 任务 B 使用 `feature/task-456` 分支
   - 分支名称不冲突，合并时机由各自的 Stage 8 控制

3. **合并策略**：各任务独立合并到主分支
   - 任务 A 完成后，将 `feature/task-123` 合并到 `master`
   - 任务 B 完成后，将 `feature/task-456` 合并到 `master`
   - 如果有代码冲突，在合并时解决（这是正常的 Git 流程）

**结论**：dev-workflow 的 worktree 机制确保了真正的并行执行能力，不会有环境污染或状态冲突。

### 对比：quick-task 的冲突风险

quick-task 使用分支策略，但**共享同一工作区**：
- 任务 A 在主工作区切换到 `feature/quick-123` 分支
- 任务 B 在主工作区切换到 `feature/quick-456` 分支
- 如果两个会话同时操作，会导致：
  - 分支切换冲突
  - 文件状态覆盖
  - 依赖/缓存污染

**这就是为什么 quick-task 必须限制为单会话串行执行。**

## 实施清单

已完成的工作：

- [x] 创建 `skills/quick-task/CONSTRAINTS.md`（核心约束文档）
- [x] 更新 `skills/quick-task/SKILL.md`（添加约束提示和快速判定）
- [x] 更新 `skills/quick-task/scripts/handler.sh`（启动检查 + 完成验证）
- [x] 创建 `docs/workflow-selection-guide.md`（详细选择指南）

## 后续建议

1. **监控违规使用**：
   - 收集 quick-task 的使用数据（文件数、行数、任务时长）
   - 识别频繁触发警告的场景，优化约束阈值

2. **用户教育**：
   - 在 Colony 启动时显示工作流选择指南链接
   - 在 quick-task 触发警告时，提供迁移到 dev-workflow 的快捷命令

3. **工具改进**：
   - 考虑添加 `quick-task migrate` 命令，自动迁移到 dev-workflow
   - 考虑在 dev-workflow 中添加"快速模式"，简化简单任务的流程

## 架构原则总结

1. **工具分层**：不同工具服务于不同场景，不强行统一
2. **约束前置**：通过文档和代码双重约束，防止误用
3. **自动化检查**：减少人工判断，提高可靠性
4. **清晰指引**：提供决策树和案例，降低选择成本
5. **物理隔离优先**：并行执行必须使用物理隔离（worktree），不依赖逻辑隔离（分支）

---

**决策日期**：2026-03-17
**决策人**：架构师
**文档版本**：v1.0
