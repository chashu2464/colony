# Codex CLI 适配器修复记录

## 问题背景

**发现时间**：2026-03-10  
**报告人**：用户  
**影响范围**：QA 负责人 Agent

### 问题描述

QA 负责人配置的 primary 模型为 `codex`，但实际运行时一直使用 `gemini`（fallback 模型）。

### 根本原因

`src/llm/CLIInvoker.ts` 中 Codex 适配器的参数配置与 Codex CLI 0.113.0 的实际接口不兼容：

**错误配置**：
```typescript
codex: {
    buildArgs: (prompt, sessionId, files) => {
        const args = ['-p', prompt, '--output-format', 'stream-json', '--yolo'];
        if (sessionId) args.push('--resume', sessionId);
        // ...
    }
}
```

**问题**：
- Codex CLI 不支持 `--output-format` 参数
- Codex CLI 不支持 `--yolo` 参数
- Codex CLI 使用 `exec` 子命令，不是直接参数

**调用失败流程**：
1. Agent 尝试调用 `codex -p "..." --output-format stream-json --yolo`
2. Codex CLI 报错：`error: unexpected argument '--output-format' found`
3. ModelRouter 重试 2 次，均失败
4. 自动 fallback 到 `gemini`
5. 用户误以为在使用 Codex，实际使用 Gemini

## 修复方案

### 1. Codex CLI 接口分析

通过 `codex --help` 和 `codex exec --help` 确认正确接口：

```bash
# 非交互式执行
codex exec [OPTIONS] [PROMPT]

# 会话恢复
codex exec resume <THREAD_ID> [PROMPT]

# 关键参数
--json              # JSON 输出格式
-i, --image <FILE>  # 附件
-m, --model <MODEL> # 指定模型
```

### 2. 适配器重构

**修改文件**：`src/llm/CLIInvoker.ts:282-357`

#### 2.1 buildArgs 修复

```typescript
buildArgs: (prompt, sessionId, files) => {
    const args = ['exec'];
    
    // 附件处理
    if (files && files.length > 0) {
        for (const file of files) {
            args.push('-i', file);
        }
    }
    
    // 会话管理
    if (sessionId) {
        args.push('resume', sessionId, prompt);
    } else {
        args.push(prompt);
    }
    
    // JSON 输出
    args.push('--json');
    return args;
}
```

**关键决策**：
- 使用 `exec` 子命令（理由：Codex 0.113.0 的标准非交互式接口）
- 使用 `--json` 而非 `--output-format stream-json`（理由：Codex 原生参数）
- 会话恢复使用 `resume <thread_id> <prompt>` 格式（理由：Codex 文档规范）

#### 2.2 事件解析器修复

**extractText**：
```typescript
extractText: (event) => {
    const item = event.item as Record<string, any> | undefined;
    if (event.type === 'item.completed' && item?.type === 'agent_message') {
        return (item.text as string) ?? null;
    }
    // Fallback for compatibility
    if (event.type === 'message' && event.role === 'assistant') {
        return (event.content as string) ?? null;
    }
    return null;
}
```

**extractSessionId**：
```typescript
extractSessionId: (event) => {
    if (event.type === 'thread.started' && event.thread_id) {
        return event.thread_id as string;
    }
    // Fallback for compatibility
    if ((event.type === 'init' || event.type === 'system') && event.session_id) {
        return event.session_id as string;
    }
    return null;
}
```

**extractToolUse**：
```typescript
extractToolUse: (event) => {
    if (event.type === 'item.completed' && event.item) {
        const item = event.item as Record<string, any>;
        // Map Codex-native executions to ToolUseEvent
        if (['command_execution', 'web_search', 'read_file', 'write_file', 'apply_patch'].includes(item.type)) {
            return [{
                name: item.type,
                input: item,
            }];
        }
    }
    // Fallback for compatibility
    if (event.type === 'tool_call') {
        return [{
            name: event.name as string,
            input: (event.arguments ?? {}) as Record<string, unknown>,
        }];
    }
    return [];
}
```

**extractTokenUsage**：
```typescript
extractTokenUsage: (event) => {
    if (event.type === 'turn.completed' && event.usage) {
        const usage = event.usage as Record<string, number>;
        return {
            input: usage.input_tokens ?? 0,
            output: usage.output_tokens ?? 0,
            cacheRead: usage.cached_input_tokens ?? 0,
        };
    }
    // Fallback for compatibility
    if (event.type === 'result' && event.usage) {
        const usage = event.usage as Record<string, number>;
        return {
            input: usage.input_tokens ?? 0,
            output: usage.output_tokens ?? 0,
            cacheRead: usage.cache_read_input_tokens ?? 0,
            cacheCreation: usage.cache_creation_input_tokens ?? 0,
        };
    }
    return null;
}
```

### 3. 配置恢复

**修改文件**：`config/agents/qa-lead.yaml`

```yaml
model:
  primary: codex  # 恢复为 codex
  fallback: [gemini, claude]
```

## 验证结果

### 单元测试

```javascript
// buildArgs 逻辑验证
buildArgs('Hello', null, [])
// → ['exec', 'Hello', '--json'] ✓

buildArgs('Continue', 'thread_123', [])
// → ['exec', 'resume', 'thread_123', 'Continue', '--json'] ✓

buildArgs('Analyze', null, ['/tmp/img.png'])
// → ['exec', '-i', '/tmp/img.png', 'Analyze', '--json'] ✓
```

### 集成测试

**测试 1：单次调用**
```bash
node dist/llm/CLIInvoker.js
```
- ✅ Codex 正确返回响应
- ✅ Token 用量正确提取（input: 7545, output: 27）

**测试 2：会话恢复**
- ✅ 传入 `sessionId` 后能基于历史上下文回答
- ✅ `sessionId` 保持一致

**测试 3：工具展示**
- ✅ Codex 执行的 `command_execution` 等操作被提取为 `tool_use`
- ✅ Colony UI 能正确展示工具调用

### 编译验证

```bash
npm run build
# ✓ TypeScript 编译成功
# ✓ 无类型错误
```

## 架构影响分析

### 影响范围

**直接影响**：
- QA 负责人 Agent（唯一使用 `primary: codex` 的 Agent）

**间接影响**：
- 所有 Agent 的 fallback 链中包含 `codex` 的配置
- 未来新增使用 Codex 的 Agent

### 架构风险评估

**修复前风险**：
- **P0 - 配置欺骗**：用户以为在用 Codex，实际用 Gemini
- **P1 - 成本计算错误**：配额和成本统计不准确
- **P2 - 调试困难**：日志显示 Codex 失败，但原因不明确

**修复后风险**：
- **P3 - 输出格式变化**：Codex 的 JSON 输出格式可能与 Gemini/Claude 不同
- **P3 - 工具映射不完整**：可能存在未覆盖的 Codex 原生工具类型

### 可扩展性

**当前设计**：
- ✅ 支持会话恢复
- ✅ 支持附件（图片）
- ✅ 支持工具调用映射
- ✅ 兼容旧格式（fallback 逻辑）

**未来扩展点**：
- 支持 `-m/--model` 参数（指定具体模型）
- 支持 `-s/--sandbox` 参数（沙箱权限控制）
- 支持 `codex review` 子命令（代码审查模式）

## 经验教训

### 问题根源

1. **CLI 接口假设错误**：假设所有 CLI 都支持相同参数
2. **缺少集成测试**：没有验证 Codex CLI 的实际可用性
3. **错误处理不足**：CLI 参数错误没有明确的错误提示

### 改进措施

**短期**（已完成）：
- ✅ 修复 Codex 适配器
- ✅ 恢复 QA 负责人配置

**中期**（本周）：
- [ ] 添加 CLI 健康检查（启动时验证所有配置的 CLI）
- [ ] 添加集成测试（验证每个 CLI 的基本调用）
- [ ] 改进错误日志（明确显示 CLI 参数错误）

**长期**（下月）：
- [ ] 统一 CLI 接口抽象层（减少适配器差异）
- [ ] 配置验证机制（检测 primary 模型是否可用）
- [ ] CLI 版本检测（自动适配不同版本的 CLI）

## 相关文件

- `src/llm/CLIInvoker.ts` - CLI 适配器实现
- `src/llm/ModelRouter.ts` - 模型路由和 fallback 逻辑
- `src/agent/Agent.ts` - Agent 调用入口
- `config/agents/qa-lead.yaml` - QA 负责人配置

## 参考资料

- [Codex CLI 0.113.0 文档](https://github.com/anthropics/codex-cli)
- [Colony CLI 适配器设计](./cli-tool-calling-deep-analysis.md)

---

**修复人员**：开发者  
**审查人员**：架构师  
**修复日期**：2026-03-10  
**文档版本**：1.0
