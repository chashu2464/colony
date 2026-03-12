# CLI工具调用机制深度分析：是否支持任务执行中的多次工具调用

## 问题

CLI（如Claude CLI、Gemini CLI）是否支持在**一个请求的任务执行过程中**主动多次调用工具？

例如：
- 任务运行到一半时发送进度消息
- 执行长时间任务时分阶段报告状态
- 不是同时调用多个工具，而是**顺序地、根据任务进度**调用

## CLI工具调用的工作原理

### 1. Anthropic API的工具调用机制

根据Anthropic API文档，工具调用遵循以下流程：

```
用户请求 → API调用 → 模型思考 → 返回tool_use →
执行工具 → 将结果发回API → 模型继续思考 → 返回响应或更多tool_use
```

**关键特性**：
- ✅ 支持**多轮**工具调用（tool use loop）
- ✅ 模型可以根据工具执行结果决定是否继续调用工具
- ✅ 每次工具调用后，结果会被发回给模型，模型可以基于结果做出下一步决策

### 2. Claude CLI的实现

#### 2.1 流式输出解析

```typescript
// src/llm/CLIInvoker.ts:300-326
const rl = createInterface({ input: child.stdout });

rl.on('line', (line) => {
    let event: Record<string, unknown>;
    try { event = JSON.parse(line); } catch { return; }

    // 提取session ID
    const sid = config.extractSessionId(event);
    if (sid) capturedSessionId = sid;

    // 提取文本输出
    const text = config.extractText(event);
    if (text) {
        textChunks.push(text);
        options.onToken?.(text);
    }

    // 提取工具调用
    const toolUse = config.extractToolUse(event);
    if (toolUse) {
        toolCalls.push(toolUse);
        options.onToolUse?.(toolUse);
    }
});
```

**关键发现**：
- ✅ CLI以**流式**方式输出JSON事件
- ✅ 每个工具调用都会触发一个 `tool_use` 事件
- ✅ 所有工具调用都会被收集到 `toolCalls` 数组
- ⚠️ 但这些事件是在**CLI进程运行期间**实时产生的

#### 2.2 工具调用提取

```typescript
// src/llm/CLIInvoker.ts:110-120 (Claude)
extractToolUse: (event) => {
    if (event.type !== 'assistant') return null;
    const content = (event.message as Record<string, unknown>)?.content;
    if (!Array.isArray(content)) return null;
    const toolBlock = content.find((b: Record<string, unknown>) => b.type === 'tool_use');
    if (!toolBlock) return null;
    return {
        name: (toolBlock as Record<string, unknown>).name as string,
        input: (toolBlock as Record<string, unknown>).input as Record<string, unknown>,
    };
}
```

**关键发现**：
- ✅ 从 `assistant` 消息中提取 `tool_use` 块
- ✅ 每个 `tool_use` 块代表一次工具调用
- ⚠️ 但这是模型**决定**要调用的工具，不是实际执行

#### 2.3 进程生命周期

```typescript
// src/llm/CLIInvoker.ts:332-357
function tryFinalize(): void {
    if (childExitCode === null || !rlClosed) return;

    if (childExitCode !== 0) {
        settle('reject', new InvokeError(...));
        return;
    }

    settle('resolve', {
        text: textChunks.join(''),
        sessionId: finalSessionId,
        tokenUsage,
        toolCalls, // 所有工具调用的列表
    });
}
```

**关键发现**：
- ⚠️ 只有在CLI进程**完全结束**后才会resolve
- ⚠️ 所有工具调用都在进程结束时一起返回
- ❌ 无法在进程运行中获取中间结果

## 核心问题：CLI是否支持中间工具调用？

### 场景分析

**场景1：模型在一次响应中决定调用多个工具**

```json
// 模型的输出
{
  "type": "assistant",
  "content": [
    {"type": "text", "text": "我需要先发送开始消息"},
    {"type": "tool_use", "name": "send-message", "input": {"content": "开始处理..."}},
    {"type": "text", "text": "然后执行任务"},
    {"type": "tool_use", "name": "run-command", "input": {"command": "sleep 5"}},
    {"type": "text", "text": "最后发送完成消息"},
    {"type": "tool_use", "name": "send-message", "input": {"content": "完成！"}}
  ]
}
```

**结果**：✅ **支持**
- 所有工具调用都在同一个 `assistant` 消息中
- CLI会**依次执行**这些工具
- 但这是模型**一次性决定**的，不是根据执行结果动态决定

**场景2：模型根据工具执行结果动态决定下一步**

```
Round 1:
  模型: "我先发送开始消息"
  工具调用: send-message("开始处理...")
  工具结果: {"success": true}

Round 2:
  模型: "现在执行任务"
  工具调用: run-command("sleep 5")
  工具结果: {"success": true, "output": "done"}

Round 3:
  模型: "任务完成，发送结果"
  工具调用: send-message("完成！结果是: done")
```

**结果**：⚠️ **理论支持，但有限制**

这需要**多轮API调用**（tool use loop），但：

1. **CLI层面**：
   - ✅ Claude CLI支持 `--resume` 参数继续会话
   - ✅ 可以在多次CLI调用之间保持上下文
   - ❌ 但每次CLI调用都是**独立的进程**

2. **Colony层面**：
   - ❌ 当前实现在**一次CLI调用**后就结束
   - ❌ 没有实现多轮tool use loop

### 关键限制

#### 限制1：Colony的循环逻辑

```typescript
// src/agent/Agent.ts:218-224
if (calledSendMessage || skillResults.length === 0) {
    await this.storeToLongTermMemory(message, result.text);
    break; // ⚠️ 立即结束，不会继续调用CLI
}
```

**问题**：
- 一旦调用了send-message，循环就结束
- 不会再次调用CLI来继续任务
- MAX_FOLLOW_UP_ROUNDS只用于处理数据返回的技能（如get-messages）

#### 限制2：CLI进程的原子性

```typescript
// src/llm/CLIInvoker.ts:241-256
return new Promise<InvokeResult>((resolve, reject) => {
    const child = spawn(cliPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, ...options.env },
    });

    const toolCalls: ToolUseEvent[] = [];

    // ... 收集所有工具调用

    // 只有在进程结束时才resolve
    settle('resolve', {
        text: textChunks.join(''),
        sessionId: finalSessionId,
        tokenUsage,
        toolCalls, // 一次性返回所有工具调用
    });
});
```

**问题**：
- CLI进程是**原子操作**
- 无法在进程运行中获取中间结果
- 所有工具调用都在进程结束时一起返回

## 实际能力总结

### ✅ 支持的场景

**1. 模型一次性决定多个工具调用**

```typescript
// 模型在一个响应中决定调用3次send-message
toolCalls = [
    { name: 'send-message', input: { content: '步骤1：开始' } },
    { name: 'send-message', input: { content: '步骤2：进行中' } },
    { name: 'send-message', input: { content: '步骤3：完成' } }
]
```

**执行方式**：
- CLI会**依次执行**这3个工具调用
- 每个工具调用都会实际发送消息
- 用户会看到3条消息

**限制**：
- 这3个调用是模型**一次性决定**的
- 不是根据任务执行进度动态决定的
- 模型无法看到第一个send-message的结果再决定第二个

### ❌ 不支持的场景

**2. 根据任务执行进度动态调用工具**

```typescript
// 期望的流程
1. 发送 "开始处理..."
2. 执行任务（可能需要5秒）
3. 根据任务结果决定发送什么消息
4. 发送 "完成！结果是: xxx"
```

**为什么不支持**：
- 需要**多轮CLI调用**（tool use loop）
- 每轮之间需要等待工具执行完成
- Colony当前没有实现这个循环

**3. 长时间任务的实时进度报告**

```typescript
// 期望的流程
1. 发送 "开始处理..."
2. 执行任务（30秒）
   - 10秒后发送 "进度：33%"
   - 20秒后发送 "进度：66%"
3. 发送 "完成！"
```

**为什么不支持**：
- 需要在**任务执行过程中**调用工具
- 但CLI的工具调用是由**模型决定**的，不是任务代码决定的
- 模型无法"暂停"等待任务执行，然后继续

## 技术原因

### 1. API设计

Anthropic API的工具调用是**同步的**：

```
用户 → API → 模型思考 → 返回tool_use →
用户执行工具 → 用户将结果发回API → 模型继续思考
```

**关键点**：
- 模型**等待**工具执行完成
- 工具执行是在**API调用之外**进行的
- 模型无法在工具执行过程中做任何事情

### 2. CLI实现

Claude CLI封装了这个流程：

```
CLI启动 → 发送prompt到API → 接收tool_use →
执行工具（通过MCP或skills） → 将结果发回API →
接收最终响应 → CLI退出
```

**关键点**：
- CLI是一个**完整的请求-响应周期**
- 工具执行是CLI内部处理的
- 外部无法干预这个过程

### 3. Colony的封装

Colony进一步封装了CLI：

```typescript
const result = await this.modelRouter.invoke(
    this.config.model.primary,
    currentPrompt,
    options
);

// result包含所有工具调用，但已经执行完毕
```

**关键点**：
- `invoke()` 是一个**原子操作**
- 返回时所有工具都已执行完毕
- 无法在执行过程中获取中间状态

## 解决方案

### 方案1：实现Tool Use Loop（推荐）

修改Agent的循环逻辑，支持多轮CLI调用：

```typescript
// 伪代码
while (round < MAX_ROUNDS) {
    const result = await this.modelRouter.invoke(prompt);

    // 执行工具调用
    const toolResults = await this.executeTools(result.toolCalls);

    // 检查是否需要继续
    if (hasTerminalTool(result.toolCalls)) {
        break; // send-message是终止工具
    }

    // 将工具结果反馈给模型
    prompt = buildFeedbackPrompt(toolResults);
    round++;
}
```

**优点**：
- ✅ 支持根据工具结果动态决定下一步
- ✅ 符合Anthropic API的设计
- ✅ 可以实现复杂的多步骤任务

**缺点**：
- ⚠️ 需要重新设计循环逻辑
- ⚠️ 需要定义哪些工具是"终止工具"
- ⚠️ 可能增加API调用次数和成本

### 方案2：使用流式工具调用（如果API支持）

某些API支持流式工具调用：

```typescript
const stream = await api.streamWithTools(prompt);

for await (const event of stream) {
    if (event.type === 'tool_use') {
        const result = await executeTool(event.tool);
        stream.sendToolResult(result);
    }
}
```

**优点**：
- ✅ 可以在任务执行中实时调用工具
- ✅ 更灵活的控制流

**缺点**：
- ❌ Anthropic API目前不支持这种模式
- ❌ 需要API层面的支持

### 方案3：使用进度报告工具（变通方案）

添加一个特殊的 `report-progress` 工具：

```typescript
// 不触发循环终止
if (invocation.skill === 'report-progress') {
    await this.executeSkill(invocation.skill, invocation.params, roomId);
    // 不设置calledSendMessage，继续执行
}
```

**优点**：
- ✅ 简单易实现
- ✅ 不需要改变核心循环逻辑

**缺点**：
- ⚠️ 仍然是模型一次性决定的
- ⚠️ 无法根据实际任务进度动态调用
- ⚠️ 只是语义上的区分，技术上没有本质区别

## 结论

### 直接回答你的问题

**CLI是否支持在任务执行过程中主动多次调用工具？**

**答案**：❌ **不支持**

**原因**：
1. **API设计限制**：Anthropic API的工具调用是同步的，模型必须等待工具执行完成
2. **CLI实现限制**：CLI是一个原子操作，无法在执行过程中暴露中间状态
3. **Colony实现限制**：当前循环逻辑在第一次send-message后就终止

### 什么是支持的

✅ **模型在一次响应中决定调用多个工具**
- 模型可以一次性决定调用3次send-message
- CLI会依次执行这些调用
- 但这是模型**预先决定**的，不是根据执行结果动态决定的

### 什么是不支持的

❌ **根据任务执行进度动态调用工具**
- 无法在任务运行到一半时根据实际情况决定发送什么消息
- 无法实现"执行5秒 → 发送进度 → 继续执行 → 发送完成"的流程
- 无法根据第一个工具的结果决定是否调用第二个工具

### 如何实现你想要的功能

如果你想实现"任务运行到一半发送进度消息"，需要：

1. **实现Tool Use Loop**：支持多轮CLI调用
2. **重新设计循环逻辑**：不要在第一次send-message后就终止
3. **定义工具语义**：区分"进度报告"和"最终响应"

这需要对Agent的核心循环逻辑进行重大改造。
