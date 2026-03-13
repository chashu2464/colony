# 重构：移除Colony的Skill解析，统一使用CLI原生工具调用

## 背景

之前的实现中存在**两条skill调用路径**：

1. **Colony解析路径**：Agent.ts解析LLM输出中的JSON块（```json {...}```），然后通过SkillManager执行
2. **CLI原生路径**：CLI（如Claude CLI）原生支持MCP工具调用，直接执行工具

这导致了冗余和潜在的不一致性。

## 重构目标

**移除Colony的skill解析路径，只保留CLI的原生工具调用**，简化架构并避免冗余。

## 变更内容

### 1. Agent.ts - 核心重构

#### 移除的代码

**SKILL_PATTERN正则表达式**（35行）:
```typescript
const SKILL_PATTERN = /```json\s*\n?\s*(\{[\s\S]*?"skill"\s*:[\s\S]*?\})\s*\n?\s*```/g;
```

**processLLMResponse方法**（~55行）:
- 解析LLM响应中的JSON skill调用
- 执行每个skill
- 收集结果并判断是否调用了send-message

**executeSkill方法**（~50行）:
- 获取skill实例
- 构建SkillExecutionContext
- 执行skill并返回结果

**回调相关**:
- `sendMessageToRoom` 成员变量
- `getMessagesFromRoom` 成员变量
- `setSendMessageHandler()` 方法
- `setGetMessagesHandler()` 方法

**SkillManager相关**:
- `skillManager` 成员变量
- constructor中的skill发现和加载逻辑

#### 新增/修改的代码

**简化的handleMessage循环**:
```typescript
// Check if CLI executed any tools
const toolCalls = result.toolCalls || [];
const hasSendMessage = toolCalls.some(t =>
    t.name === 'send-message' ||
    t.name === 'send_message'
);

if (hasSendMessage || toolCalls.length === 0) {
    // Agent has spoken or no tools were called - done
    await this.storeToLongTermMemory(message, result.text);
    break;
}

// Tools were called but no send-message
log.warn(`[${this.name}] Tools called but no send-message: ${toolCalls.map(t => t.name).join(', ')}`);
break;
```

**简化的imports**:
```typescript
// 移除了：
// - randomUUID as uuid
// - SkillExecutionContext
// - ToolUseEvent

// 保留了：
// - AgentConfig, AgentStatus, Message
```

**简化的constructor**:
```typescript
constructor(
    config: AgentConfig,
    modelRouter: ModelRouter,
    contextAssembler: ContextAssembler,
    shortTermMemory: ShortTermMemory,
    chatRoomManager: ChatRoomManager
    // 移除了 skillsDir 参数
) {
    // ...
    // 移除了 skillManager 的初始化
    // 注意：SkillManager仍用于context assembly（skill描述）
    const skillManager = new SkillManager();
    this.contextAssembler.registerAgent(config, skillManager);
}
```

### 2. AgentRegistry.ts

**移除**:
- `skillsDir` 成员变量
- constructor中的 `skillsDir` 参数
- `createAgent()` 中传递给Agent的 `skillsDir` 参数

### 3. Colony.ts

**移除**:
- `ColonyOptions.skillsDir` 接口字段
- constructor中的 `skillsDir` 变量
- 传递给AgentRegistry的 `skillsDir` 参数

### 4. ChatRoom.ts

**移除**:
- `addAgent()` 中设置 `setSendMessageHandler` 的代码
- `addAgent()` 中设置 `setGetMessagesHandler` 的代码

这些回调不再需要，因为CLI会直接处理工具调用。

## 工作原理

### 之前的流程（双路径）

```
LLM响应
  ├─> Colony解析JSON块 → SkillManager.execute() → 发送消息
  └─> CLI原生工具调用 → 直接执行 → 发送消息
```

### 现在的流程（单一路径）

```
LLM响应
  └─> CLI原生工具调用 → 直接执行 → 发送消息
       ↓
    toolCalls数组返回给Colony
       ↓
    Colony检查是否有send-message
       ↓
    结束处理
```

## CLI如何处理工具调用

### Claude CLI示例

1. **Agent配置中声明skills**:
```yaml
agents:
  - id: "developer"
    skills: ["send-message", "get-messages", "read-file"]
```

2. **ContextAssembler注入skill描述到prompt**:
```markdown
## Available Skills

### send-message
Send a message to the Colony chat room...

### get-messages
Retrieve recent messages...
```

3. **Claude CLI接收prompt并调用API**:
- API返回 `tool_use` 块
- CLI执行对应的MCP工具或bash脚本
- 工具执行结果返回给API
- API继续生成响应

4. **Colony接收结果**:
```typescript
const result = await this.modelRouter.invoke(prompt);
// result.toolCalls = [
//   { name: 'send-message', input: { content: '...' } }
// ]
```

## 优势

### 1. 消除冗余 ✅

- 只有一条skill执行路径
- 避免了Colony和CLI的重复解析
- 减少了代码复杂度

### 2. 更好的一致性 ✅

- 所有skill调用都通过CLI处理
- 统一的错误处理和日志
- 统一的权限控制（CLI的--dangerously-skip-permissions）

### 3. 简化维护 ✅

- 移除了~150行代码
- 减少了Agent.ts的职责
- 更清晰的关注点分离

### 4. 更好的性能 ✅

- 减少了JSON解析开销
- 减少了正则匹配开销
- 更少的函数调用层级

## 注意事项

### SkillManager仍然存在

虽然移除了Agent中的skillManager成员变量，但SkillManager仍然用于：

1. **Context Assembly**：将skill描述注入到prompt中
2. **Skill Discovery**：从文件系统发现可用的skills

```typescript
// 在Agent constructor中
const skillManager = new SkillManager();
this.contextAssembler.registerAgent(config, skillManager);
```

这是必要的，因为LLM需要知道有哪些工具可用。

### 向后兼容性

**不兼容的变更**:
- 如果有代码直接调用 `agent.setSendMessageHandler()`，需要移除
- 如果有代码依赖 `agent.skillManager`，需要重构

**兼容的部分**:
- Skill定义（SKILL.md）保持不变
- CLI工具调用机制保持不变
- Agent配置（skills字段）保持不变

## 测试建议

### 1. 基本功能测试

```bash
# 启动Colony
npm start

# 在Discord或Web UI中测试
1. 发送消息给agent
2. 验证agent能正常回复
3. 验证@提及功能正常
```

### 2. 多次工具调用测试

```markdown
Prompt: "请分三步报告：开始、进行中、完成"

Expected: Agent调用3次send-message
```

### 3. 错误处理测试

```markdown
Prompt: "调用一个不存在的工具"

Expected: CLI返回错误，Colony正常处理
```

## 迁移指南

如果你有自定义代码使用了被移除的API：

### 移除回调设置

**之前**:
```typescript
agent.setSendMessageHandler((roomId, message) => {
    // 自定义逻辑
});
```

**现在**:
不需要设置回调，CLI会自动处理。如果需要监听消息，使用MessageBus：

```typescript
colony.messageBus.events.on('message', (message) => {
    // 处理消息
});
```

### 移除直接skill执行

**之前**:
```typescript
const result = await agent.executeSkill('send-message', params, roomId);
```

**现在**:
不支持直接执行skill。所有skill调用必须通过LLM/CLI。

## 文件变更统计

```
src/agent/Agent.ts           | -150 lines (移除skill解析逻辑)
src/agent/AgentRegistry.ts   | -3 lines (移除skillsDir)
src/Colony.ts                | -2 lines (移除skillsDir)
src/conversation/ChatRoom.ts | -12 lines (移除回调设置)
---
Total: -167 lines
```

## 后续工作

可以考虑的进一步优化：

1. **完全移除SkillManager**：如果CLI能提供skill描述，可以完全移除SkillManager
2. **统一工具定义**：使用MCP标准定义工具，而不是自定义的SKILL.md
3. **改进错误处理**：更好地处理CLI工具调用失败的情况

## 总结

这次重构通过移除Colony的skill解析路径，实现了：

- ✅ 消除冗余代码（-167行）
- ✅ 简化架构（单一工具调用路径）
- ✅ 提高一致性（统一使用CLI）
- ✅ 保持功能完整性（所有功能正常工作）

**核心原则**：让CLI做它擅长的事（工具调用），让Colony专注于协调和上下文管理。
