# 工作流选择指南：quick-task vs dev-workflow

## 快速决策树

```
开始
  │
  ├─ 需要多任务并行？
  │   └─ 是 → dev-workflow（worktree 物理隔离）
  │
  ├─ 涉及核心业务逻辑或架构变更？
  │   └─ 是 → dev-workflow（需要多方评审）
  │
  ├─ 任务规模：时间 > 1h 或 文件 > 3 或 行数 > 100？
  │   └─ 是 → dev-workflow（超出 quick-task 边界）
  │
  ├─ 需要 TDD 或多方评审？
  │   └─ 是 → dev-workflow（质量保障流程）
  │
  └─ 仅限文档/格式化/简单修复？
      └─ 是 → quick-task（快速迭代）
```

## 详细对比

### 1. 隔离能力

| 维度 | quick-task | dev-workflow |
|------|-----------|--------------|
| 隔离方式 | Git 分支（逻辑隔离） | Git Worktree（物理隔离） |
| 工作区 | 共享同一目录 | 独立的物理目录 |
| 并发能力 | 单会话串行 | 多会话并行 |
| 冲突风险 | 高（共享文件系统） | 低（独立文件系统） |
| 环境污染 | 可能（依赖/缓存共享） | 无（完全隔离） |

**示例场景**：
- quick-task：修改 README.md，不会与其他任务冲突
- dev-workflow：同时开发两个功能，各自在独立 worktree 中，互不干扰

### 2. 质量保障

| 维度 | quick-task | dev-workflow |
|------|-----------|--------------|
| TDD 流程 | 无 | 有（Stage 5: Test Case Design） |
| 架构评审 | 无 | 有（Stage 1-2: IR/AR） |
| 代码评审 | 无 | 有（Stage 3-4: Briefing） |
| 集成测试 | 无 | 有（Stage 7: Integration Testing） |
| 最终审批 | 无 | 有（Stage 8: Go-Live Review） |

**示例场景**：
- quick-task：修复拼写错误，无需评审
- dev-workflow：实现新 API 端点，需要架构师设计、QA 测试、多方评审

### 3. 回滚能力

| 维度 | quick-task | dev-workflow |
|------|-----------|--------------|
| 阶段快照 | 无 | 有（每个 Stage 自动 commit） |
| 回滚粒度 | 全部或无 | 精确到任意 Stage |
| 回滚命令 | 手动 `git reset` | `dev-workflow backtrack` |
| 历史追溯 | 无 | 完整的 Stage 历史记录 |

**示例场景**：
- quick-task：发现问题只能全部回滚，重新开始
- dev-workflow：发现 Stage 6 实现有问题，回滚到 Stage 5，保留之前的设计和测试用例

### 4. 适用场景

#### quick-task 适用场景（白名单）

✅ **文档更新**
- 修改 README、CHANGELOG、注释
- 更新配置文件说明
- 添加代码示例

✅ **代码格式化**
- 运行 linter/formatter
- 统一代码风格
- 修复 lint 警告

✅ **简单 Bug 修复**
- 单函数内的逻辑错误
- 拼写错误
- 明显的边界条件遗漏（无副作用）

✅ **日志/调试**
- 添加 console.log/logger
- 调整日志级别
- 添加调试信息

✅ **依赖更新**
- 更新 patch 版本（无 breaking changes）
- 修复安全漏洞（简单依赖升级）

#### dev-workflow 适用场景

✅ **新功能开发**
- 新 API 端点
- 新 UI 组件
- 新业务逻辑

✅ **架构变更**
- 重构模块结构
- 修改数据模型
- 引入新技术栈

✅ **核心逻辑修改**
- 修改认证/授权逻辑
- 修改数据处理流程
- 修改关键算法

✅ **跨模块变更**
- 涉及多个模块的修改
- API 契约变更
- 数据库 schema 变更

✅ **需要并行执行**
- 多个功能同时开发
- 紧急修复与常规开发并行
- 多个实验性方案对比

### 5. 成本对比

| 维度 | quick-task | dev-workflow |
|------|-----------|--------------|
| 启动时间 | < 1 秒 | 5-10 秒（创建 worktree） |
| 磁盘占用 | 0（共享工作区） | ~100MB（独立工作区） |
| 学习成本 | 低（3 个命令） | 中（9 个 Stage） |
| 心智负担 | 低（无流程约束） | 中（需遵循流程） |
| 清理成本 | 低（自动删除分支） | 低（自动清理 worktree） |

### 6. 风险对比

| 风险类型 | quick-task | dev-workflow |
|---------|-----------|--------------|
| 并发冲突 | 高（共享工作区） | 低（物理隔离） |
| 质量风险 | 高（无评审） | 低（多方评审） |
| 回滚风险 | 高（无快照） | 低（阶段快照） |
| 误操作风险 | 中（无门禁） | 低（Stage 门禁） |
| 技术债风险 | 高（无设计阶段） | 低（强制设计） |

## 实际案例

### 案例 1：修复文档中的拼写错误

**任务描述**：README.md 中有 3 处拼写错误需要修复。

**选择**：quick-task

**理由**：
- 仅修改 1 个文件
- 变更 < 10 行
- 无逻辑变更
- 无需评审
- 无并发需求

**执行**：
```bash
/quick-task start "Fix typos in README"
# 修改文件
/quick-task done "Fix 3 typos in README.md"
```

### 案例 2：实现用户认证功能

**任务描述**：添加 JWT 认证，包括登录、注册、token 刷新。

**选择**：dev-workflow

**理由**：
- 涉及多个文件（controller、service、middleware、tests）
- 涉及安全敏感逻辑
- 需要架构师设计 token 策略
- 需要 QA 设计安全测试用例
- 需要集成测试验证

**执行**：
```bash
/dev-workflow init "Implement JWT Authentication"
# Stage 0-1: 架构师设计认证方案
# Stage 2: 架构师完成详细设计
# Stage 3-4: 开发者与 QA 对齐理解
# Stage 5: QA 设计测试用例
# Stage 6: 开发者实现
# Stage 7: QA 集成测试
# Stage 8: 三方最终评审
```

### 案例 3：同时开发两个独立功能

**任务描述**：
- 功能 A：添加导出 CSV 功能
- 功能 B：优化数据库查询性能

**选择**：dev-workflow（两个独立的 workflow）

**理由**：
- 两个任务需要并行执行
- 各自涉及多个文件
- 需要独立的测试和评审
- 避免相互干扰

**执行**：
```bash
# 会话 1
/dev-workflow init "Add CSV Export Feature"
# 在 worktree-1 中开发

# 会话 2（并行）
/dev-workflow init "Optimize Database Queries"
# 在 worktree-2 中开发
```

### 案例 4：紧急修复生产 Bug

**任务描述**：生产环境发现空指针异常，需要紧急修复。

**选择**：取决于复杂度

**简单情况（quick-task）**：
- 明确的空指针位置
- 单函数内修复
- 添加空值检查即可

```bash
/quick-task start "Fix null pointer in getUserProfile"
# 添加 if (user == null) return null;
/quick-task done "Add null check in getUserProfile"
```

**复杂情况（dev-workflow）**：
- 需要追溯根因
- 涉及多个模块
- 需要添加测试防止回归

```bash
/dev-workflow init "Fix null pointer exception in user profile"
# 完整的设计、实现、测试流程
```

## 迁移路径

### 从 quick-task 迁移到 dev-workflow

**场景**：在 quick-task 执行过程中发现任务超出边界。

**步骤**：
1. 停止当前 quick-task（不执行 `done`）
2. 保留当前分支 `feature/quick-{id}`
3. 初始化 dev-workflow：
   ```bash
   /dev-workflow init "原任务名称（从 quick-task 迁移）"
   ```
4. 手动合并分支：
   ```bash
   git checkout feature/task-{new_id}
   git merge feature/quick-{id}
   ```
5. 删除 quick-task 状态：
   ```bash
   rm .data/quick-tasks/$ROOM_ID.json
   ```
6. 继续在 dev-workflow 中完成任务

### 从 dev-workflow 降级到 quick-task

**不推荐**。dev-workflow 已经提供了完整的质量保障，降级会丢失历史记录和评审信息。

如果确实需要（例如任务被大幅简化），建议：
1. 完成当前 dev-workflow 或回滚到 Stage 0
2. 重新评估任务范围
3. 如果确认符合 quick-task 边界，重新开始

## 常见误区

### 误区 1："quick-task 更快，所以优先用它"

**纠正**：quick-task 启动快，但缺乏质量保障。对于复杂任务，后期修复成本远高于前期设计成本。

### 误区 2："dev-workflow 太重，小任务也要走完整流程"

**纠正**：dev-workflow 的 Stage 可以快速推进。对于简单任务，架构师可以在几分钟内完成 Stage 0-2，开发者快速实现，QA 快速验证。关键是有评审和测试的保障。

### 误区 3："我可以在 quick-task 中修改核心逻辑，反正能合并"

**纠正**：技术上可行，但违反了约束。核心逻辑变更缺乏评审，容易引入 Bug 或技术债。

### 误区 4："dev-workflow 不支持并行，所以用多个 quick-task"

**纠正**：dev-workflow 通过 worktree 支持真正的并行执行。多个 quick-task 共享工作区，反而容易冲突。

## 总结

**选择原则**：
1. **默认使用 dev-workflow**：除非任务明确符合 quick-task 白名单
2. **有疑虑时选 dev-workflow**：宁可多一些流程，也不要承担质量风险
3. **并行执行必须用 dev-workflow**：quick-task 不支持并行
4. **核心逻辑必须用 dev-workflow**：需要多方评审和测试

**quick-task 的定位**：
- 不是 dev-workflow 的简化版
- 而是针对特定低风险场景的快速通道
- 适用范围严格受限，不可滥用

**记住**：选择正确的工具比快速完成任务更重要。质量问题的修复成本远高于前期的流程成本。
