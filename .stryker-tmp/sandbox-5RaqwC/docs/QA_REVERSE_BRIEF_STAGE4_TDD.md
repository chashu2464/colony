# Stage 4 Reverse Briefing (QA) - TDD Quality Gates Integration

## 1) QA 对技术方案的理解复述
目标是在不改变 9-stage 结构前提下，把 TDD 红绿重构和质量门禁强制落在 Stage 6，并在 Stage 6 -> 7 推进时自动校验：
- Unit coverage >= 90%
- Integration coverage >= 80%
- Mutation score >= 70%（阶段性硬门禁，长期目标 80%）
- 存在可追溯的 TDD 过程记录（`docs/TDD_LOG.md`）
- StrykerJS 支持增量模式（仅针对本次变更文件）

执行路径应为：
1. 开发在 Stage 6 执行 Red-Green-Refactor
2. 生成/更新 `docs/TDD_LOG.md`
3. `dev-workflow next` 在 CURRENT_STAGE=6 时触发门禁脚本
4. 任一门禁失败则阻断进入 Stage 7

## 2) 对 `check-quality-gates.sh` 逻辑的 QA 审核结论
结论：**当前方案方向正确，但尚未达到“可验证、可审计、可阻断”标准，暂不满足 QA 放行条件。**

### 阻塞项（P1）
1. **门禁脚本未落地**
- 现状：仓库中不存在 `scripts/check-quality-gates.sh`。
- 风险：Stage 6 -> 7 无法真实执行质量门禁，指标成为文档约定而非系统约束。

2. **`handler.sh` 未接入 Stage 6 门禁分支**
- 现状：`skills/dev-workflow/scripts/handler.sh` 的 `next` 逻辑未包含 CURRENT_STAGE=6 的质量校验调用。
- 风险：即使后续补了脚本，流程层面仍可能绕过校验。

3. **门禁证据链不完整**
- 现状：仅提出检查 `docs/TDD_LOG.md` 是否存在，未强制校验 commit 前缀证据与 hash。
- 风险：文件可伪造，不能证明 Red/Green/Refactor 真实发生，审计可信度不足。

### 重要改进项（P2）
1. **覆盖率口径需要硬约束**
- 需要在配置中固化 include/exclude，避免把 `dist/`、配置文件、类型声明等计入分母，导致门禁失真。

2. **变异测试范围与阈值口径需要固定**
- 必须明确基线：默认增量（变更集）+ 周期性全量（建议每日或主干合并前）策略，避免长期盲区。

3. **失败报告结构化**
- `docs/QUALITY_REPORT.md` 建议使用固定模板，包含时间、commit、阈值、实测值、失败项、重试建议。

## 3) 安全审查结论（架构+漏洞）

### 安全架构审查
1. **认证/授权**
- 当前门禁是本地脚本触发，缺少“谁有权绕过门禁”的策略定义。
- 建议：在 CI 主干合并链路追加同等门禁，避免仅靠本地约束。

2. **数据保护与可追溯性**
- `TDD_LOG` 与质量报告应记录 `task_id`、`branch`、`commit hash`，形成可追溯链。

3. **通信与执行安全**
- `handler.sh` 中已存在外部 HTTP 通知，需确保门禁脚本执行结果不会被通知成功掩盖（必须先 gate 再 notify）。

### 漏洞审查（OWASP 视角映射）
1. **A01 Broken Access Control（流程层面）**
- 若 `next` 不做 Stage 6 强制校验，属于流程控制缺失，可被直接推进绕过。

2. **A09 Security Logging and Monitoring Failures**
- 若报告不含 commit/task 关键信息，事后审计不足。

## 4) Stage 5 测试设计如何适配 TDD 循环（Given-When-Then）

1. Given 当前阶段为 6 且 Unit 覆盖率 89.9%
2. When 执行 `dev-workflow next`
3. Then 返回非零并阻断推进，报告标记 `unit_coverage_failed`

1. Given 当前阶段为 6 且 Integration 覆盖率 79.9%
2. When 执行 `dev-workflow next`
3. Then 返回非零并阻断推进，报告标记 `integration_coverage_failed`

1. Given 当前阶段为 6 且 Mutation score 69.9%
2. When 执行 `dev-workflow next`
3. Then 返回非零并阻断推进，报告标记 `mutation_score_failed`

1. Given 当前阶段为 6 且 `docs/TDD_LOG.md` 缺失
2. When 执行 `dev-workflow next`
3. Then 返回非零并阻断推进，提示先生成 TDD 日志

1. Given 当前阶段为 6 且质量指标全部达标
2. When 执行 `dev-workflow next`
3. Then 成功推进到 Stage 7，并落地 `docs/QUALITY_REPORT.md`

1. Given 当前阶段为 6 且存在文件改动清单
2. When 执行 `dev-workflow next`
3. Then 变异测试仅针对改动文件执行，并在报告中记录增量范围

1. Given `docs/TDD_LOG.md` 存在但无 `tdd:red|tdd:green|tdd:refactor` 证据
2. When 执行 `dev-workflow next`
3. Then 视为审计失败并阻断推进

## 5) 对开发者的变异测试建议（用于提升有效性而非刷分）
优先关注会暴露“弱断言”问题的算子类别：
- 条件与布尔逻辑：`if` 条件翻转、逻辑运算替换
- 比较运算：`==/!=/>/<` 互换
- 返回值与边界：返回常量替换、空值/异常分支
- 算术变换：`+/-/*//` 替换（仅对核心业务计算）
- 副作用与调用链：函数调用移除、参数替换、异常吞没

并要求 Stage 5 用例对每个关键业务规则至少包含：
- 一个正向断言
- 一个反向断言（非法输入/越权输入/边界输入）
- 一个异常路径断言（抛错或错误码）
- 一个状态不变式断言（副作用结果，如数据未被错误写入）

### Stage 5 变异算子建议模板（交付给开发）
- 业务规则 ID
- 对应代码入口（函数/接口）
- 目标变异算子（最少 2 类）
- 预期被杀死的测试用例 ID
- 若未杀死的补测建议

## 6) P1 归零要求（本轮）

### P1-1: Stage 6 门禁未真正执行
- 修复内容：新增 `scripts/check-quality-gates.sh` 并在 `handler.sh` 的 Stage 6 `next` 分支强制调用。
- 引入原因：设计文档先行，代码实现未同步落地。
- 归因路径：需求/设计 -> 技术方案 -> 实现脱节（缺少“文档项到代码项”的验收清单）。

### P1-2: TDD 证据可伪造
- 修复内容：`generate-tdd-log.js` 从 git commit 提取并记录 hash，门禁校验日志与当前分支提交一致性。
- 引入原因：仅校验文件存在性，未定义真实性校验。
- 归因路径：可用性优先导致审计性约束缺失。

## 7) 阶段门禁声明（Stage 4）
- 已验证场景：技术方案与现有实现差距审查、Stage 6 门禁可执行性审查、安全与审计风险识别。
- 结论：**Stage 4 反向理解一致，但实现尚未达到可放行标准；需先消除上述 P1 阻塞项。**
- 遗留风险：脚本尚未实现，无法进行真实门禁回归验证与性能基线测量。

## 8) 校准附录（2026-03-11）
基于 `docs/TDD_WORKFLOW_DESIGN.md` 与 `docs/TECH_PLAN.md` 最新修订，Stage 4 结论校准如下：

- 章节编号冲突已修正（环境初始化章节为 2.4）。
- 变异测试阈值采用时间线策略：
  - `2026-06-11` 前硬门禁为 70%
  - `2026-06-11` 及之后硬门禁为 80%
- 失败处理机制已文档化：
  - 默认硬阻断 Stage 6 -> 7
  - `SKIP_QUALITY_GATES=true` 紧急降级仅用于例外场景，且必须审计留痕
- 性能与可观测性要求已明确：
  - 增量门禁执行 SLA `< 5 分钟`
  - `QUALITY_REPORT.md` 需包含趋势对比与审计字段

校准结论：**Stage 4 文档理解已与架构评审意见一致，可进入 Stage 5 测试用例设计与评审。**
