# P3阶段设计文档：单一数据源重构与智能上下文压缩

## 1. 目标
1. **单一数据源重构**: 统一工作流中的角色映射逻辑，消除代码冗余，支持环境变量配置系统参数。
2. **智能上下文压缩**: 在有限的 Token 预算内，通过分层压缩策略保留更多历史信息，提升长对话稳定性。

## 2. 架构方案

### 2.1 单一数据源重构 (Direction 1)

#### 2.1.1 Markdown 解析器
- **文件**: `src/utils/MarkdownParser.ts`
- **功能**: 使用原生正则表达式解析 `skills/dev-workflow/SKILL.md` 中的“阶段-角色映射表”。
- **接口契约**:
```typescript
interface StageProtocol {
    stage: number;
    name: string;
    primaryRole: string;
    collaborators: string[];
    guidance: string;
}

class MarkdownParser {
    /**
     * 解析 SKILL.md 中的表格。
     * @returns 阶段编号到协议的映射。
     * @throws 解析失败时抛出异常，触发降级逻辑。
     */
    static parseStageRoleMapping(filePath: string): Map<number, StageProtocol>;
}
```

#### 2.1.2 跨语言数据共享 (Node CLI)
- **工具**: `scripts/parse-workflow-table.js`
- **实现**: 一个轻量级的 Node 脚本，调用 `MarkdownParser` 并将结果以 JSON 格式输出到 stdout。
- **Bash 集成**: `skills/dev-workflow/scripts/handler.sh` 通过 `node scripts/parse-workflow-table.js` 获取数据，使用 `jq` 提取负责人。

#### 2.1.3 环境变量加载
- **配置项**: `COLONY_MAX_CLI_CONCURRENCY` (默认: 2, 范围: 1-5)。
- **实现**: 在 `src/llm/CLIInvoker.ts` 中启动时加载，并在日志中记录生效值。

### 2.2 智能上下文压缩 (Direction 2)

#### 2.2.1 分层压缩策略
1. **Level 1 (最近 10 条)**: 始终保留原始文本，确保即时对话的精准度。
2. **Level 2 (11-30 条)**: 使用 LLM 总结摘要。摘要需包含关键决策、技术路径及未解决问题。
3. **Level 3 (30 条以前)**: 仅保留关键决策点的索引或彻底移除。

#### 2.2.2 压缩执行流
- **触发器**: `ContextAssembler` 检测到消息数超过 20 条。
- **异步处理**: 压缩任务在后台执行，不阻塞当前消息发送。压缩结果缓存于 `SessionManager`。
- **LLM Prompt**: 专门的压缩 Prompt，要求输出 Markdown 列表格式。

## 3. 性能测试与验证

### 3.1 性能指标
- **Markdown 解析**: < 5ms (使用 `console.time` 测量 100 次迭代的平均值)。
- **上下文组装**: 增加压缩逻辑后，单次组装耗时增长需 < 50ms (不含 LLM 异步压缩时间)。

### 3.2 验证方案
- **单元测试**: `MarkdownParser` 需覆盖空行、畸形表格、特殊字符等边界情况。
- **压力测试**: 模拟 50 条以上消息的会话，验证压缩后的 Prompt 是否能让 Agent 保持对早期决策的认知。

## 4. 实施计划
1. **Stage 2 (当前)**: 完成本设计文档补正及评审。
2. **Stage 3-5**: 编写 `MarkdownParser` 单元测试及 `scripts/parse-workflow-table.js`。
3. **Stage 6**: 
   - **Phase A**: 实现 Direction 1 (单一数据源 + 环境变量)。
   - **Phase B**: 实现 Direction 2 (异步压缩逻辑 + 缓存)。
4. **Stage 7**: 进行性能基准测试及高并发 OOM 验证。

## 5. 风险与降级
- **解析失败**: 若 `SKILL.md` 格式损坏，`ContextAssembler` 捕获异常并回退至硬编码的 `FALLBACK_MAPPING`。
- **LLM 压缩失败**: 若总结模型不可用，系统自动回退至当前的“简单截断”模式，并向用户发出警告。
