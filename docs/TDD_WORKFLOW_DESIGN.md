# 架构设计文档 (AR): TDD 质量门禁集成方案

## 1. 方案概述
本设计方案旨在 `dev-workflow` 体系中嵌入 TDD 循环和自动化质量指标验证。通过在 Stage 6 (开发实现) 增加门禁检查，确保所有交付代码均经过严格的测试验证。

## 2. 核心组件设计
### 2.1 门禁检查脚本 (`scripts/check-quality-gates.sh`)
- **职责**：执行测试套件，提取覆盖率和变异得分，并与阈值对比。
- **流程**：
  1. 调用 `vitest run --coverage`。
  2. 解析 `coverage/coverage-summary.json`。
  3. 调用 `stryker run`。
  4. 解析 `reports/mutation/mutation.json`。
  5. 若任一指标不达标，以非零状态码退出。

### 2.2 TDD 日志自动化脚本 (`scripts/generate-tdd-log.js`)
- **职责**：提取当前分支下带有 `tdd:red`, `tdd:green`, `tdd:refactor` 前缀的 commit。
- **产出**：自动汇总并更新 `docs/TDD_LOG.md`。

### 2.3 工作流脚本增强 (`skills/dev-workflow/scripts/handler.sh`)
- **修改点**：在 `next` 操作中，当 `CURRENT_STAGE` 为 6 时，强制执行 `check-quality-gates.sh`。
- **证据校验**：要求 Stage 6 必须提供 `docs/TDD_LOG.md` 和 `docs/QUALITY_REPORT.md` 的路径。

### 2.3 环境初始化脚本 (`scripts/setup-tdd.sh`)
- **职责**：自动安装 `vitest`, `@vitest/coverage-v8`, `@stryker-mutator/core` 等依赖。
- **配置生成**：生成默认的 `vitest.config.ts` 和 `stryker.config.json`。

## 3. 流程定义 (Stage 6 详解)
开发者在 Stage 6 的操作流程建议：
1. `npm run tdd:init`：初始化环境。
2. **Red**: 编写测试 -> `npm run test` (失败)。
3. **Green**: 编写代码 -> `npm run test` (通过)。
4. **Refactor**: 优化代码 -> `npm run test` (通过)。
5. 重复上述步骤，并记录至 `TDD_LOG.md`。
6. `npm run test:full`：生成完整质量报告。
7. `dev-workflow next`：触发门禁检查并推进。

## 4. 质量门禁指标 (Thresholds)
| 指标 | 阈值 | 备注 |
|------|------|------|
| 单元测试覆盖率 | >= 90% | 针对 `src/` 下的核心逻辑 |
| 集成测试覆盖率 | >= 80% | 针对 API 和跨模块流程 |
| 变异测试得分 | >= 70% | 初期设定为 70%，随着工具链成熟逐步提升至 80% |

### 4.1 测试套件规范 (Test Isolation)
为了便于自动化脚本差异化触发门禁，测试套件需遵循以下命名规范：
- **单元测试**：使用 `.spec.ts` 后缀，存放于 `src/tests/unit/`。
- **集成测试**：使用 `.test.ts` 后缀，存放于 `src/tests/integration/`。

### 4.2 覆盖率排除规范 (Exclusion Rules)
以下类型的文件不计入覆盖率门禁考核：
- 配置文件：`*.config.ts`, `*.yaml`
- 类型定义：`src/types.ts`
- 构建产物：`dist/`, `node_modules/`

## 5. 影响范围分析
- **性能优化**：变异测试必须支持增量模式以保证 CLI 响应速度。
- **自动化证据**：通过 Git 前缀自动生成 TDD 日志，降低开发者负担。
