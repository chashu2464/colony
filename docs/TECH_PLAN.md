# 技术实现方案 (TECH_PLAN): TDD 质量门禁集成

## 1. 目标
在 `dev-workflow` 的 Stage 6 (开发实现) 中集成 TDD 循环和自动化质量门禁，确保代码质量符合 90/80/80 指标。

## 2. 关键任务与实现细节

### 2.1 环境初始化与依赖管理
- **文件**: `scripts/setup-tdd.sh`
- **内容**: 
  - 安装 `vitest`, `@vitest/coverage-v8`, `@stryker-mutator/core`, `@stryker-mutator/vitest-runner`, `@stryker-mutator/typescript-checker`。
  - 初始化 `vitest.config.ts`：配置覆盖率输出路径为 `coverage/`，包含 `json-summary` 格式。
  - 初始化 `stryker.config.json`：配置 `vitest` 作为 runner，并启用 `typescript-checker`。
  - 更新 `package.json` 脚本：
    - `"test:unit": "vitest run --dir src/tests/unit --coverage"`
    - `"test:int": "vitest run --dir src/tests/integration --coverage"`
    - `"test:mutation": "stryker run"`
    - `"tdd:log": "node scripts/generate-tdd-log.js"`

### 2.2 质量门禁验证脚本
- **文件**: `scripts/check-quality-gates.sh`
- **逻辑**:
  1. 运行单元测试并提取 `coverage/coverage-summary.json` 中的 `statements` 覆盖率，校验是否 >= 90%。
  2. 运行集成测试并校验覆盖率是否 >= 80%。
  3. 运行变异测试并解析 `reports/mutation/mutation.json` 中的 `mutationScore`，校验是否 >= 80%。
  4. 生成综合报告 `docs/QUALITY_REPORT.md`。

### 2.3 TDD 日志自动化生成与真实性校验
- **文件**: `scripts/generate-tdd-log.js`
- **逻辑**: 
  - 使用 `git log` 提取当前分支下带有 `tdd:red`, `tdd:green`, `tdd:refactor` 前缀的 commit。
  - **真实性校验 (P1-2 Fix)**: 脚本必须将提取到的 Commit Hash 与 `git rev-list` 的结果进行比对，确保日志中记录的所有步骤均真实存在于当前分支的提交链中。生成的 `docs/TDD_LOG.md` 将包含哈希校验签名，防止手动篡改。

### 2.4 工作流集成与强制门禁 (P1-1 Fix)
- **文件**: `skills/dev-workflow/scripts/handler.sh`
- **修改**: 在 `action: next` 逻辑中，针对 `CURRENT_STAGE == 6` 的处理块，插入以下强制指令：
  ```bash
  # 支持紧急降级开关
  if [ "$SKIP_QUALITY_GATES" = "true" ]; then
    echo "Warning: Quality Gates skipped by environment variable. This action will be logged."
    return 0
  fi

  # 强制调用质量门禁脚本
  if ! bash scripts/check-quality-gates.sh; then
    echo "{\"error\": \"Quality Gate Failed: One or more metrics (90/80/70) are not met. Check docs/QUALITY_REPORT.md for details.\"}"
    exit 1
  fi
  # 强制校验 TDD 日志真实性
  if ! node scripts/generate-tdd-log.js --verify; then
    echo "{\"error\": \"TDD Log Verification Failed: Log hashes do not match current branch history.\"}"
    exit 1
  fi
  ```
- **失败阻断**: 任何验证失败都将以非零状态码退出，阻止 workflow 进入 Stage 7。报告必须包含 `commit_hash`, `branch`, `task_id` 等审计字段。

### 2.5 测试套件规范
- 单元测试：`src/tests/unit/**/*.spec.ts`
- 集成测试：`src/tests/integration/**/*.test.ts`
- 排除项：`*.config.ts`, `node_modules/`, `dist/`, `types.ts` 等。

## 3. 风险与应对
- **变异测试耗时 (SLA)**: StrykerJS 在全量运行时非常慢。方案：在门禁检查时强制执行增量模式（只针对修改的文件），确保单次检查在 **5 分钟** 内完成。
- **环境隔离**: 确保 CI/本地环境中的门禁检查逻辑一致。
- **紧急交付**: 通过 `SKIP_QUALITY_GATES` 环境变量提供逃生口，但审计报告中将明确标注“跳过门禁”状态。

## 4. 进度计划
1. [ ] 完成脚本开发 (`setup-tdd.sh`, `check-quality-gates.sh`, `generate-tdd-log.js`)
2. [ ] 修改 `handler.sh` 并进行单元测试
3. [ ] 试点功能演示 (Stage 6 流程跑通)
