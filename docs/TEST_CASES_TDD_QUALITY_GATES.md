# Stage 5 Test Cases - TDD Quality Gates Integration

## Scope
本测试集用于验证 Stage 6 质量门禁在 `dev-workflow next` 的强制执行行为，覆盖：
- 覆盖率阈值边界（Unit 90%、Integration 80%）
- 变异测试阈值与时间线（70% 到 80%）
- 紧急降级开关 `SKIP_QUALITY_GATES=true` 的审计可追溯性
- 增量变异测试性能 SLA（单次 < 5 分钟）
- TDD 证据真实性（`tdd:red|green|refactor` 提交链）

## Entry Criteria
- 已完成 Stage 4 反向宣讲并获得架构批准。
- `docs/TDD_WORKFLOW_DESIGN.md` 与 `docs/TECH_PLAN.md` 为当前基线版本。
- 可执行脚本可用：`scripts/check-quality-gates.sh`、`scripts/generate-tdd-log.js`、`skills/dev-workflow/scripts/handler.sh`。

## Exit Criteria
- 所有 P0/P1 用例通过。
- 失败路径均可稳定阻断 Stage 6 -> 7。
- `docs/QUALITY_REPORT.md` 产生完整审计字段（`task_id`、`branch`、`commit_hash`、gate status、logs link）。

## Test Data Baseline
- 任务 ID：`1734766d`
- 阶段：Stage 6 -> Stage 7
- 阈值：
  - Unit coverage >= 90%
  - Integration coverage >= 80%
  - Mutation score:
    - 2026-06-11 前：>= 70%
    - 2026-06-11 及之后：>= 80%

## Functional Test Cases (Given-When-Then)

### TC-QG-001 Unit 阈值边界失败（P1）
- Given 当前在 Stage 6，Unit 覆盖率为 `89.9%`，其余指标达标
- When 执行 `dev-workflow next`
- Then 命令非零退出并阻断推进，`docs/QUALITY_REPORT.md` 标记 `unit_coverage_failed`

### TC-QG-002 Unit 阈值边界通过（P1）
- Given 当前在 Stage 6，Unit 覆盖率为 `90.0%`，其余指标达标
- When 执行 `dev-workflow next`
- Then 允许推进到 Stage 7，报告记录 `unit_coverage=90.0%` 且 gate=PASS

### TC-QG-003 Integration 阈值边界失败（P1）
- Given 当前在 Stage 6，Integration 覆盖率为 `79.9%`，其余指标达标
- When 执行 `dev-workflow next`
- Then 命令非零退出并阻断推进，报告标记 `integration_coverage_failed`

### TC-QG-004 Integration 阈值边界通过（P1）
- Given 当前在 Stage 6，Integration 覆盖率为 `80.0%`，其余指标达标
- When 执行 `dev-workflow next`
- Then 允许推进到 Stage 7，报告记录 `integration_coverage=80.0%` 且 gate=PASS

### TC-QG-005 Mutation 阈值边界失败（2026-06-11 前）（P1）
- Given 当前日期早于 `2026-06-11`，Mutation score 为 `69.9%`
- When 执行 `dev-workflow next`
- Then 命令非零退出并阻断推进，报告标记 `mutation_score_failed`

### TC-QG-006 Mutation 阈值边界通过（2026-06-11 前）（P1）
- Given 当前日期早于 `2026-06-11`，Mutation score 为 `70.0%`
- When 执行 `dev-workflow next`
- Then 允许推进，报告记录 `effective_mutation_threshold=70`

### TC-QG-007 Mutation 阈值自动提升校验（2026-06-11 及之后）（P1）
- Given 当前日期为 `2026-06-11` 或之后，Mutation score 为 `79.9%`
- When 执行 `dev-workflow next`
- Then 命令非零退出并阻断推进，报告记录 `effective_mutation_threshold=80`

### TC-QG-008 Mutation 阈值自动提升通过（2026-06-11 及之后）（P1）
- Given 当前日期为 `2026-06-11` 或之后，Mutation score 为 `80.0%`
- When 执行 `dev-workflow next`
- Then 允许推进到 Stage 7，报告标记 mutation gate=PASS

### TC-QG-009 紧急降级开关生效（P1）
- Given 当前在 Stage 6 且存在至少一项质量指标不达标，并设置 `SKIP_QUALITY_GATES=true`
- When 执行 `dev-workflow next`
- Then 允许推进，但必须在审计记录中标注 `quality_gates_skipped=true`、操作者、时间戳、原因

### TC-QG-010 紧急降级开关审计完整性（P1）
- Given 使用 `SKIP_QUALITY_GATES=true` 推进成功
- When 检查 `docs/QUALITY_REPORT.md` 与 workflow 审计历史
- Then 两处均存在同一条 skip 事件（`task_id`、`branch`、`commit_hash` 一致），且可追溯

### TC-QG-011 无降级开关时不得绕过（P1）
- Given 当前在 Stage 6 且质量门禁不达标，未设置 `SKIP_QUALITY_GATES`
- When 执行 `dev-workflow next`
- Then 必须阻断推进，不得存在默认降级路径

### TC-QG-012 增量变异测试范围校验（P1）
- Given 本次仅修改 `src/module-a.ts` 与 `src/module-b.ts`
- When 执行门禁检查
- Then 变异测试仅覆盖改动文件或其直接影响范围，报告记录 `mutation_scope` 明细

### TC-QG-013 增量变异测试性能 SLA（P1）
- Given 改动文件数量 <= 10 且基线机器配置满足团队约定
- When 执行 `dev-workflow next` 触发全套门禁
- Then 从门禁启动到完成耗时 < `5m`，并在报告中输出耗时字段

### TC-QG-014 TDD 日志缺失阻断（P1）
- Given 当前在 Stage 6，`docs/TDD_LOG.md` 不存在
- When 执行 `dev-workflow next`
- Then 非零退出并阻断推进，提示先生成 TDD 日志

### TC-QG-015 TDD 日志真实性失败阻断（P1）
- Given `docs/TDD_LOG.md` 存在，但包含不在当前分支提交链中的哈希
- When 执行 `node scripts/generate-tdd-log.js --verify` 或 `dev-workflow next`
- Then 非零退出并阻断推进，报告标记 `tdd_log_verification_failed`

### TC-QG-016 TDD 三态证据完整性（P2）
- Given 当前 Stage 6 仅有 `tdd:green` 与 `tdd:refactor` 提交，无 `tdd:red`
- When 触发门禁
- Then 判定证据不完整并阻断，提示缺失的 TDD 状态

## Security Test Cases (OWASP-focused)

### TC-SEC-001 流程绕过防护（A01）
- Given 开发者尝试直接修改本地状态文件伪造 Stage 完成
- When 执行 `dev-workflow next`
- Then 门禁仍基于真实脚本执行结果与证据文件校验，无法绕过

### TC-SEC-002 审计日志防篡改（A09）
- Given 已生成 `docs/QUALITY_REPORT.md`
- When 人工篡改其中 `commit_hash` 或阈值字段
- Then 下一次校验识别异常并标记审计不一致

### TC-SEC-003 环境变量注入健壮性
- Given `SKIP_QUALITY_GATES` 被设置为非预期值（如 `TRUE `、`1`、`yes`）
- When 执行 `dev-workflow next`
- Then 仅 `true`（严格匹配）触发降级，其他值一律按未开启处理

## Non-Functional Test Cases

### TC-PERF-001 门禁执行时延监控
- Given 持续集成环境中最近 20 次 Stage 6 门禁运行数据
- When 统计 `p50/p95` 耗时
- Then `p95 < 5m`，超阈值触发性能告警

### TC-RELI-001 重试幂等性
- Given 门禁第一次因临时资源抖动失败
- When 在代码未变更前提下重试
- Then 输出结果一致，不产生重复或冲突审计记录

## Bug Reporting Template (for Stage 7)
- Bug ID
- Severity (`P0/P1/P2/P3`)
- Environment
- Preconditions
- Repro Steps
- Expected
- Actual
- Impact
- Root Cause Hypothesis
- Fix Proposal
- Evidence (log/report/screenshot path)

## P0/P1 Closure Template
每个 P0/P1 缺陷必须回答以下三项：
1. 修复内容是什么（What changed）
2. 引入原因是什么（Why introduced）
3. 归因路径是什么（How escaped and where process broke）
