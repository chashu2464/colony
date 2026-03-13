# MCP与Skill分析：多次send_message支持

## 问题

分析当前的MCP和skill实现，确认agent是否能在一次CLI请求过程中根据进度多次调用send_message技能主动发送消息。

## 当前实现分析

### 1. Skill调用机制

#### 1.1 JSON Pattern匹配

Agent使用正则表达式匹配LLM输出中的skill调用：

```typescript
// src/agent/Agent.ts:35
const SKILL_PATTERN = /```json\s*\n?\s*(\{[\s\S]*?"skill"\s*:[\s\S]*?\})\s*\n?\s*```/g;
```

**关键点**：使用了 `/g` 全局标志，意味着可以匹配**多个**skill调用。

#### 1.2 Skill执行循环

```typescript
// src/agent/Agent.ts:314-337
for (const match of matches) {
    const jsonStr = match[1];
    if (!jsonStr) continue;

    try {
        const invocation = JSON.parse(jsonStr) as { skill: string; params: Record<string, unknown> };

        if (invocation.skill === 'send-message') {
            calledSendMessage = true;
        }

        const result = await this.executeSkill(invocation.skill, invocation.params, roomId);
        // ... 处理结果
    } catch (err) {
        log.error(`[${this.name}] Failed to parse skill invocation:`, jsonStr, err);
    }
}
```

**关键点**：
- ✅ 使用 `for...of` 循环遍历**所有**匹配的skill调用
- ✅ 每个skill调用都会被**立即执行**（`await this.executeSkill()`）
- ✅ `calledSendMessage` 标志只要有一次send-message就会被设置为true

### 2. send-message Skill实现

#### 2.1 Handler脚本

```bash
# skills/send-message/scripts/handler.sh
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "$COLONY_API/api/sessions/$ROOM_ID/agent-messages" \
    -H "Content-Type: application/json" \
    -d "$BODY")
```

**关键点**：
- ✅ 每次调用都是独立的HTTP POST请求
- ✅ 没有任何限制阻止多次调用
- ✅ 每次调用都会立即发送消息到聊天室

#### 2.2 Built-in实现

```typescript
// src/agent/Agent.ts:363-374
sendMessage: (content: string, mentions?: string[]) => {
    const msg: Message = {
        id: uuid(),
        roomId,
        sender: { id: this.id, type: 'agent', name: this.name },
        content,
        mentions: mentions ?? [],
        timestamp: new Date(),
        metadata: { skillInvocation: true },
    };
    this.sendMessageToRoom?.(roomId, msg);
    this.events.emit('message_sent', msg);
}
```

**关键点**：
- ✅ 每次调用都生成新的消息ID
- ✅ 立即发送到聊天室
- ✅ 没有任何调用次数限制

### 3. 循环控制逻辑

```typescript
// src/agent/Agent.ts:218-224
if (calledSendMessage || skillResults.length === 0) {
    // Store important context to long-term memory
    await this.storeToLongTermMemory(message, result.text);
    break;
}
```

**关键点**：
- ⚠️ 只要调用了**任何一次** send-message，循环就会结束
- ⚠️ 这意味着在**同一轮**LLM响应中的多次send-message会被执行
- ⚠️ 但不会进入下一轮（MAX_FOLLOW_UP_ROUNDS）

### 4. MCP工具调用

```typescript
// src/llm/CLIInvoker.ts:316-320
const toolUse = config.extractToolUse(event);
if (toolUse) {
    toolCalls.push(toolUse);
    options.onToolUse?.(toolUse);
}
```

**关键点**：
- ✅ CLI可以返回多个tool_use事件
- ✅ 所有tool调用都会被收集到 `toolCalls` 数组
- ⚠️ 但Agent.ts中对native tool的处理是：

```typescript
// src/agent/Agent.ts:299-302
if (toolCalls.length > 0) {
    log.info(`[${this.name}] Native tool execution detected (${toolCalls.length} calls). Skills handled by CLI.`);
    return { skillResults: [], calledSendMessage: true };
}
```

**问题**：假设所有native tool调用都包含send-message，直接返回 `calledSendMessage: true`。

## 结论

### ✅ 支持的场景

**场景1：同一轮LLM响应中多次调用send-message（JSON格式）**

```markdown
我先发送进度更新：

```json
{"skill": "send-message", "params": {"content": "开始处理任务..."}}
```

然后执行一些操作...

再发送完成消息：

```json
{"skill": "send-message", "params": {"content": "任务已完成！"}}
```
```

**结果**：✅ **完全支持**
- 两个skill调用都会被匹配（`/g` 全局标志）
- 两个消息都会被立即发送
- 用户会看到两条消息

### ⚠️ 部分支持的场景

**场景2：使用native MCP tools多次调用**

如果CLI支持native tool调用（如Claude的MCP），agent可能会：

```typescript
// Claude CLI可能返回多个tool_use事件
toolCalls = [
    { name: 'send-message', input: { content: '开始...' } },
    { name: 'send-message', input: { content: '完成！' } }
]
```

**结果**：⚠️ **理论支持，但未验证**
- CLI会执行所有tool调用
- 但Agent.ts假设所有native tool都已处理，直接返回
- 需要验证CLI是否真的会执行多次send-message

### ❌ 不支持的场景

**场景3：跨多轮对话的进度更新**

```typescript
// Round 1
LLM: "开始处理..." + send-message
// Round 2 (不会发生)
LLM: "处理中..." + send-message
// Round 3 (不会发生)
LLM: "完成！" + send-message
```

**结果**：❌ **不支持**
- 一旦调用send-message，循环就会break
- 不会进入下一轮MAX_FOLLOW_UP_ROUNDS
- Agent认为任务已完成

## 限制与问题

### 1. 循环提前终止

```typescript
if (calledSendMessage || skillResults.length === 0) {
    break; // ⚠️ 立即结束，不会继续follow-up
}
```

**影响**：
- Agent无法在发送消息后继续执行其他操作
- 无法实现"发送进度 → 执行任务 → 发送结果"的流程

### 2. Native Tool处理假设

```typescript
if (toolCalls.length > 0) {
    return { skillResults: [], calledSendMessage: true }; // ⚠️ 假设包含send-message
}
```

**问题**：
- 假设所有native tool调用都意味着send-message被调用
- 如果CLI调用了其他工具（如read-file），也会被认为是send-message
- 可能导致误判

### 3. 没有进度追踪

当前实现没有机制来：
- 追踪长时间运行任务的进度
- 在任务执行过程中发送中间更新
- 实现"流式"响应

## 建议改进

### 改进1：支持多阶段任务

修改循环逻辑，允许在send-message后继续执行：

```typescript
// 不要立即break，而是检查是否还有其他技能需要执行
if (calledSendMessage && skillResults.length === 0) {
    // 只有在没有其他技能返回数据时才结束
    break;
}
```

### 改进2：添加进度报告机制

添加一个特殊的 `send-progress` skill：

```typescript
// 不会触发循环终止
if (invocation.skill === 'send-progress') {
    // 发送消息但不设置calledSendMessage
    await this.executeSkill(invocation.skill, invocation.params, roomId);
    continue; // 继续执行其他技能
}
```

### 改进3：改进Native Tool处理

更精确地判断是否调用了send-message：

```typescript
if (toolCalls.length > 0) {
    const hasSendMessage = toolCalls.some(t =>
        t.name === 'send-message' ||
        t.name === 'send_message'
    );
    return {
        skillResults: [],
        calledSendMessage: hasSendMessage
    };
}
```

## 测试建议

### 测试1：同一响应中多次send-message

```markdown
Prompt: "请分三步报告进度：开始、进行中、完成"

Expected LLM Response:
```json
{"skill": "send-message", "params": {"content": "1. 开始处理任务"}}
```

```json
{"skill": "send-message", "params": {"content": "2. 正在处理中..."}}
```

```json
{"skill": "send-message", "params": {"content": "3. 任务完成！"}}
```
```

**验证**：检查聊天室是否收到3条消息

### 测试2：Native MCP工具

如果使用Claude CLI with MCP：

```markdown
Prompt: "使用MCP工具发送两条消息"

Expected: Claude CLI调用send-message工具两次
```

**验证**：检查CLI日志和聊天室消息

## 总结

| 场景 | 支持程度 | 说明 |
|------|---------|------|
| 同一响应多次JSON skill调用 | ✅ 完全支持 | 使用 `/g` 全局匹配，所有调用都会执行 |
| Native MCP多次工具调用 | ⚠️ 理论支持 | 依赖CLI实现，未充分验证 |
| 跨多轮进度更新 | ❌ 不支持 | 一旦send-message被调用，循环终止 |
| 长任务进度报告 | ❌ 不支持 | 没有机制在任务执行中发送更新 |

**核心答案**：
- ✅ **可以**在一次LLM响应中多次调用send-message（通过多个JSON块）
- ❌ **不能**在任务执行过程中分阶段发送进度更新（因为循环会提前终止）
- ⚠️ 需要改进循环逻辑以支持更复杂的多阶段任务流程
