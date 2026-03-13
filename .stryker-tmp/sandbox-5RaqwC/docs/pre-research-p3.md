# P3 技术预研报告：单一数据源重构与系统加固

## 1. 技术选型对比与推荐

| 维度 | 方案 A (推荐) | 方案 B | 理由 |
| :--- | :--- | :--- | :--- |
| **Markdown 解析** | **原生正则表达式** | `markdown-it` 库 | 零依赖，性能极高，适合受控格式的 `SKILL.md`。 |
| **配置加载** | **启动时加载 (process.env)** | 运行时热更新 | 实现简单，重启成本极低 (<5s)，满足当前需求。 |
| **运行时验证** | **轻量级验证函数** | `Zod` / `Joi` 库 | 避免引入额外依赖，通过纵深防御 (JSDoc + Bash + TS) 已足够。 |

## 2. 接口设计草案

### 2.1 Markdown 解析接口
```typescript
/**
 * 从 SKILL.md 解析阶段-角色映射表
 * 逻辑：匹配 | Stage | 阶段名称 | ... | 行，跳过表头，提取有效行。
 */
function parseStageRoleMapping(filePath: string): Map<number, StageProtocol> {
    // 正则示例: /^\|\s*(\d+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/
}

interface StageProtocol {
    stage: number;
    name: string;
    primaryRole: string;
    collaborators: string[];
    guidance: string;
}
```

### 2.2 环境变量加载逻辑
```typescript
const DEFAULT_CONCURRENCY = 2;
const MIN_CONCURRENCY = 1;
const MAX_CONCURRENCY = 5;

function getCLIDeclaredConcurrency(): number {
    const val = parseInt(process.env.COLONY_MAX_CLI_CONCURRENCY || '', 10);
    if (isNaN(val) || val < MIN_CONCURRENCY || val > MAX_CONCURRENCY) {
        if (process.env.COLONY_MAX_CLI_CONCURRENCY) {
            log.warn(`Invalid COLONY_MAX_CLI_CONCURRENCY: ${val}. Falling back to default: ${DEFAULT_CONCURRENCY}`);
        }
        return DEFAULT_CONCURRENCY;
    }
    return val;
}
```

## 3. 风险评估与降级策略

- **解析风险**：如果 `SKILL.md` 表格格式被破坏（如缺少分隔符）。
  - **降级**：解析器捕获异常，`log.error` 报警，并回退到 `ContextAssembler` 中的内置硬编码映射（Hardcoded Fallback）。
- **配置风险**：配置了非法并发数值。
  - **纠正**：自动修正到 [1, 5] 闭区间内，确保系统不因配置错误而崩溃。
- **性能评估**：正则表达式解析 500 行内的 Markdown 文件预期耗时 < 5ms，对 Agent 启动无感知。

## 4. 测试策略

- **单元测试**：
  - 提供多种畸形表格字符串（空单元格、多余空格、特殊字符）测试正则鲁棒性。
  - 测试环境变量在边界值（0, 1, 5, 6, "abc"）下的表现。
- **集成测试**：
  - 修改 `SKILL.md` 内容后，启动 Agent 确认注入的 `当前阶段指引` 实时更新。
  - 验证不同角色在同一阶段从 `SKILL.md` 获取到正确的个性化指引。

---
*注：本报告将根据 QA 提供的压力测试数据（特别是并发队列堆积情况）最终确定 `MAX_CONCURRENT_CLI` 的默认推荐值。*
