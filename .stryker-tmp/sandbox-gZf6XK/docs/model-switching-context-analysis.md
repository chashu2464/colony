# 模型切换时的上下文和记忆管理分析

## 问题概述

当primary model不可用，系统切换到fallback model时，可能会出现以下问题：

1. **CLI Session上下文丢失** - 不同CLI的session不互通
2. **短期记忆丢失风险** - 依赖session的对话历史会丢失
3. **长期记忆未启用** - 当前长期记忆集成未完成

## 当前实现分析

### 1. 上下文来源

Colony的上下文来自三个层次：

```typescript
// src/agent/Agent.ts - handleMessage()
const currentPrompt = await this.contextAssembler.assemble({
    agentId: this.id,
    roomId: message.roomId,
    currentMessage: message,
    tokenBudget: 8000,
    includeHistory: true,        // ✅ 短期记忆（从ShortTermMemory）
    includeLongTerm: false,      // ❌ 长期记忆（未启用）
});
```

#### Layer 1: Agent Identity & Rules（无状态，不受影响）
```typescript
// src/memory/ContextAssembler.ts
private buildIdentitySection(config: AgentConfig): string {
    return `# 你是 ${config.name}\n\n${config.personality}`;
}
```
- ✅ **不受影响**：这些是静态配置，不依赖session

#### Layer 2: 短期记忆（部分依赖session）
```typescript
// src/memory/ContextAssembler.ts
private buildHistorySection(roomId: string, currentMessage: Message): string {
    const allMessages = this.shortTermMemory.get(roomId);
    const history = allMessages.filter(m => m.id !== currentMessage.id);
    const recentHistory = history.slice(-10);  // 最近10条消息
    // ...
}
```

**关键发现**：
- ✅ **Colony自己维护短期记忆**：通过`ShortTermMemory`存储最近消息
- ✅ **不依赖CLI session**：每次调用都会重新组装完整prompt
- ⚠️ **但有限制**：只保留最近10条消息

#### Layer 3: CLI Session Context（会丢失）
```typescript
// src/llm/CLIInvoker.ts - claude配置
buildArgs: (prompt, sessionId) => {
    const args = ['-p', prompt, '--output-format', 'stream-json'];
    if (sessionId) args.push('--resume', sessionId);  // ❌ 切换model时会丢失
    return args;
}
```

**CLI Session包含的上下文**：
- 完整的对话历史（不限于10条）
- Tool use历史和结果
- 之前的思考过程
- 文件读取/编辑的上下文

### 2. 模型切换时的行为

#### 当前实现（已修复session冲突）
```typescript
// src/llm/ModelRouter.ts
const invokeOptions = model !== primary && options.sessionId
    ? { ...options, sessionId: undefined }  // ✅ 清除sessionId避免冲突
    : options;
```

**结果**：
- ✅ 不会报错（session冲突已解决）
- ⚠️ 但会创建新session，丢失CLI层面的上下文

#### 实际影响分析

**场景1：简单对话**
```
用户: @架构师 设计一个用户认证系统
架构师(claude): 好的，我建议使用JWT...
[claude quota exhausted, 切换到gemini]
用户: 那数据库用什么？
架构师(gemini): [收到的prompt包含]
  - Agent identity ✅
  - 最近10条消息 ✅（包括之前关于JWT的讨论）
  - 当前消息 ✅
```
**影响**：✅ 基本无影响，因为Colony自己维护了对话历史

**场景2：复杂多轮交互**
```
用户: @开发者 实现登录功能
开发者(claude): [读取了5个文件，写入了3个文件]
开发者(claude): 已完成，请测试
[claude quota exhausted, 切换到gemini]
用户: 有个bug，修复一下
开发者(gemini): [收到的prompt包含]
  - 最近10条消息 ✅
  - 但不包含：
    - 之前读取的文件内容 ❌
    - 之前的tool use上下文 ❌
    - 超过10条的历史消息 ❌
```
**影响**：⚠️ 可能需要重新读取文件，效率降低

**场景3：长对话（>10条消息）**
```
[15条消息的讨论]
用户: 回到第3条消息说的那个方案
架构师(gemini): [只能看到最近10条消息]
```
**影响**：❌ 无法访问更早的上下文

## 风险评估

### 高风险场景
1. **长时间复杂任务**：涉及多个文件、多轮交互
2. **需要回溯的讨论**：引用早期消息内容
3. **状态依赖的操作**：依赖之前tool use的结果

### 低风险场景
1. **简单问答**：单轮或少量轮次
2. **独立任务**：不依赖之前的上下文
3. **最近10条消息内的讨论**

## 解决方案

### 方案1：增强短期记忆（推荐，短期）

**目标**：让Colony自己维护更完整的上下文，减少对CLI session的依赖

```typescript
// src/memory/ContextAssembler.ts
private buildHistorySection(roomId: string, currentMessage: Message): string {
    const allMessages = this.shortTermMemory.get(roomId);
    const history = allMessages.filter(m => m.id !== currentMessage.id);

    // 改进1：增加消息数量限制
    const recentHistory = history.slice(-20);  // 10 → 20

    // 改进2：智能压缩更早的消息
    const compressedHistory = this.compressOldMessages(history.slice(0, -20));

    // 改进3：包含tool use摘要
    const toolSummary = this.summarizeToolUse(history);

    return this.formatHistory(compressedHistory, recentHistory, toolSummary);
}
```

**优点**：
- ✅ 不依赖CLI session
- ✅ 模型切换时上下文保持一致
- ✅ 实现相对简单

**缺点**：
- ⚠️ 增加token消耗
- ⚠️ 需要实现压缩逻辑

### 方案2：Per-CLI Session管理（推荐，中期）

**目标**：为每个CLI维护独立的session，切换时能恢复

```typescript
// src/agent/Agent.ts
private roomSessions = new Map<string, Map<SupportedCLI, string>>();

private getSessionId(roomId: string, cli: SupportedCLI): string | undefined {
    const roomMap = this.roomSessions.get(roomId);
    return roomMap?.get(cli);
}

private setSessionId(roomId: string, cli: SupportedCLI, sessionId: string): void {
    if (!this.roomSessions.has(roomId)) {
        this.roomSessions.set(roomId, new Map());
    }
    this.roomSessions.get(roomId)!.set(cli, sessionId);
}
```

```typescript
// src/llm/ModelRouter.ts
const invokeOptions = model !== primary && options.sessionId
    ? {
        ...options,
        sessionId: undefined,  // 清除primary的session
        sessionName: `${options.sessionName}-${model}`  // 使用model-specific session name
      }
    : options;
```

**优点**：
- ✅ 切换回原model时可以恢复完整上下文
- ✅ 每个CLI维护自己的对话历史
- ✅ 不增加token消耗

**缺点**：
- ⚠️ 首次切换到fallback时仍会丢失上下文
- ⚠️ 需要修改session存储结构

### 方案3：启用长期记忆（推荐，长期）

**目标**：使用Mem0存储重要上下文，不依赖session

```typescript
// src/agent/Agent.ts
const currentPrompt = await this.contextAssembler.assemble({
    agentId: this.id,
    roomId: message.roomId,
    currentMessage: message,
    tokenBudget: 8000,
    includeHistory: true,
    includeLongTerm: true,  // ✅ 启用长期记忆
});
```

```typescript
// src/memory/ContextAssembler.ts
// 7. Long-Term Memory (if enabled)
if (options.includeLongTerm && this.longTermMemory) {
    const relevantMemories = await this.longTermMemory.recall(
        options.currentMessage.content,
        { limit: 5, agentId: options.agentId, roomId: options.roomId }
    );

    if (relevantMemories.length > 0) {
        sections.push({
            name: 'long-term',
            content: this.buildLongTermSection(relevantMemories),
            priority: 65,
            tokenCount: 0,
        });
    }
}
```

**优点**：
- ✅ 完全独立于CLI session
- ✅ 语义检索，只加载相关记忆
- ✅ 支持跨session、跨room的知识共享
- ✅ 模型切换完全无影响

**缺点**：
- ⚠️ 需要完成Mem0集成（当前未启用）
- ⚠️ 需要调优检索策略

### 方案4：混合策略（最佳，综合）

结合以上三个方案：

1. **短期**：增强短期记忆（方案1）
   - 增加消息数量到20条
   - 添加tool use摘要

2. **中期**：Per-CLI session管理（方案2）
   - 为每个CLI维护独立session
   - 切换回原model时恢复上下文

3. **长期**：启用长期记忆（方案3）
   - 完成Mem0集成
   - 自动存储重要上下文
   - 语义检索相关记忆

## 实现优先级

### P0 - 立即实施（防止严重问题）
```typescript
// 1. 增加短期记忆消息数量
const recentHistory = history.slice(-20);  // 10 → 20

// 2. 添加模型切换警告
if (model !== primary) {
    log.warn(`Model switched from ${primary} to ${model}, CLI session context will be lost`);
}

// 3. 在prompt中添加上下文恢复提示
if (modelSwitched) {
    prompt += "\n\n⚠️ 注意：由于模型切换，之前的CLI session上下文已丢失。如需访问之前的文件或数据，请重新读取。";
}
```

### P1 - 近期实施（提升体验）
```typescript
// 1. Per-CLI session管理
private roomSessions = new Map<string, Map<SupportedCLI, string>>();

// 2. Tool use摘要
private summarizeToolUse(messages: Message[]): string {
    // 提取所有tool use，生成摘要
}

// 3. 智能消息压缩
private compressOldMessages(messages: Message[]): string {
    // 压缩早期消息，保留关键信息
}
```

### P2 - 长期规划（完整解决）
```typescript
// 1. 启用Mem0长期记忆
includeLongTerm: true

// 2. 自动记忆存储
await this.longTermMemory.retain({
    content: importantContext,
    metadata: { agentId, roomId, timestamp }
});

// 3. 跨session知识共享
const sharedKnowledge = await this.longTermMemory.recall(query, {
    scope: 'global'  // 不限于当前room
});
```

## 测试建议

### 测试1：短对话切换
```
1. 用户发送3条消息
2. 触发模型切换
3. 验证：agent能正确理解之前的对话
```

### 测试2：长对话切换
```
1. 用户发送15条消息
2. 触发模型切换
3. 验证：agent能访问最近20条消息
4. 验证：agent知道更早的消息已不可见
```

### 测试3：Tool use切换
```
1. Agent读取5个文件
2. 触发模型切换
3. 用户要求修改之前读取的文件
4. 验证：agent会重新读取文件（而不是假设已有内容）
```

### 测试4：来回切换
```
1. 使用claude创建session
2. 切换到gemini
3. 切换回claude
4. 验证：claude session恢复（如果实现了方案2）
```

## 监控指标

### 关键指标
1. **模型切换频率**：多久发生一次切换
2. **切换后错误率**：切换后agent的响应质量
3. **重复tool use**：切换后是否需要重新读取文件
4. **用户满意度**：切换是否影响用户体验

### 日志增强
```typescript
log.info('Model switch detected', {
    from: primary,
    to: fallback,
    roomId,
    messageCount: historyLength,
    toolUseCount: previousToolUses.length,
    sessionLost: true
});
```

## 结论

**当前状态**：
- ✅ Session冲突已修复（不会报错）
- ⚠️ 短期记忆有限（10条消息）
- ❌ 长期记忆未启用
- ❌ CLI session上下文会丢失

**推荐行动**：
1. **立即**：增加短期记忆到20条，添加切换警告
2. **本周**：实现per-CLI session管理
3. **本月**：完成Mem0长期记忆集成

**风险可控性**：
- 对于简单对话：✅ 影响很小
- 对于复杂任务：⚠️ 需要尽快实施改进
- 对于生产环境：❌ 建议先实施P0和P1改进
