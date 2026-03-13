# 模型切换上下文保护 - 实施总结

## 已实施的改进（P0级别）

### 1. 增强短期记忆容量

**文件**：`src/memory/ContextAssembler.ts`

**改动**：
```typescript
// 之前：保留最近10条消息
const recentHistory = history.slice(-10);

// 现在：保留最近20条消息
const recentHistory = history.slice(-20);

// 添加截断提示
if (history.length > 20) {
    lines.push(`_（显示最近20条消息，共${history.length}条）_`);
}
```

**效果**：
- ✅ 模型切换时保留更多上下文（10条 → 20条）
- ✅ 用户能看到历史消息被截断的提示
- ✅ 减少因上下文丢失导致的理解错误

### 2. 模型切换警告系统

**文件**：`src/llm/ModelRouter.ts`

**改动**：
```typescript
if (model !== primary && options.sessionId) {
    // 清除session ID
    invokeOptions = { ...options, sessionId: undefined };

    // 记录警告日志
    log.warn(`Model switched from ${primary} to ${model}, CLI session context will be lost`);

    // 在prompt中添加系统提示
    modifiedPrompt = prompt + '\n\n---\n\n' +
        '⚠️ **系统提示**：由于模型切换，之前的CLI session上下文已丢失。' +
        '如需访问之前读取的文件内容或执行的操作结果，请重新执行相应的操作。';
}
```

**效果**：
- ✅ Agent明确知道上下文已丢失
- ✅ Agent会主动重新读取需要的文件
- ✅ 避免基于错误假设的响应
- ✅ 日志中记录切换事件，便于监控

## 使用示例

### 场景1：正常对话（无切换）

```
用户: @架构师 设计一个用户系统
架构师(claude): 好的，我建议...
用户: 数据库用什么？
架构师(claude): [看到完整对话历史，正常回复]
```

### 场景2：模型切换（有警告）

```
用户: @开发者 实现登录功能
开发者(claude): [读取auth.ts, 写入login.ts]
开发者(claude): 已完成
[claude quota exhausted]
用户: 有个bug，修复一下
开发者(gemini): [收到prompt包含]
  - 最近20条消息 ✅
  - 系统提示：上下文已丢失 ⚠️
开发者(gemini): 我看到之前实现了登录功能。让我重新读取login.ts查看代码...
[重新读取文件，定位bug，修复]
```

### 场景3：长对话截断提示

```
[25条消息的讨论]
架构师: [收到prompt显示]
  ## 最近对话
  _（显示最近20条消息，共25条）_
  [最近20条消息内容]
```

## 监控和日志

### 新增日志

```
[WARN] [ModelRouter] Model switched from claude to gemini, CLI session context will be lost
```

### 监控指标

可以通过日志分析：
1. 模型切换频率
2. 切换发生的时间点
3. 哪些agent最常遇到切换

```bash
# 统计模型切换次数
grep "Model switched" logs/*.log | wc -l

# 查看切换详情
grep "Model switched" logs/*.log | tail -20
```

## 测试验证

### 测试1：短对话切换
```bash
# 1. 启动Colony
npm start

# 2. 发送3条消息
# 3. 模拟claude不可用（修改rate limit）
# 4. 发送新消息
# 5. 验证：gemini能理解之前的对话
```

### 测试2：长对话切换
```bash
# 1. 发送25条消息
# 2. 触发模型切换
# 3. 验证：prompt中显示"显示最近20条消息，共25条"
# 4. 验证：agent能访问最近20条
```

### 测试3：文件操作切换
```bash
# 1. 让agent读取文件A
# 2. 触发模型切换
# 3. 要求修改文件A
# 4. 验证：agent会重新读取文件A（而不是假设已有内容）
```

## 性能影响

### Token消耗变化

**之前**：
- 短期记忆：~10条消息 × 50 tokens = 500 tokens
- 总计：~500 tokens

**现在**：
- 短期记忆：~20条消息 × 50 tokens = 1000 tokens
- 切换警告：~50 tokens（仅在切换时）
- 总计：~1000-1050 tokens

**增加**：~500 tokens/请求（+100%）

**评估**：
- ✅ 可接受：相比8000 token budget，增加6.25%
- ✅ 价值高：显著减少上下文丢失风险
- ✅ 仅在需要时生效：警告只在切换时添加

### 响应延迟

- ✅ 无影响：只是增加prompt长度，不影响处理速度

## 后续改进计划

### P1 - 近期（1-2周）

**Per-CLI Session管理**
```typescript
// 为每个CLI维护独立session
private roomSessions = new Map<string, Map<SupportedCLI, string>>();
```

**效果**：
- 切换回原model时可以恢复完整上下文
- 减少重复的文件读取

### P2 - 中期（1个月）

**启用Mem0长期记忆**
```typescript
const currentPrompt = await this.contextAssembler.assemble({
    includeLongTerm: true,  // 启用
});
```

**效果**：
- 完全独立于CLI session
- 语义检索相关记忆
- 跨session知识共享

### P3 - 长期（2-3个月）

**智能上下文压缩**
```typescript
private compressOldMessages(messages: Message[]): string {
    // 使用LLM压缩早期消息
    // 保留关键信息，减少token消耗
}
```

**效果**：
- 在有限token内保留更多历史
- 平衡上下文完整性和成本

## 回滚方案

如果发现问题，可以快速回滚：

```typescript
// src/memory/ContextAssembler.ts
const recentHistory = history.slice(-10);  // 改回10

// src/llm/ModelRouter.ts
// 删除modifiedPrompt相关代码，直接使用prompt
```

## 相关文档

- [模型切换上下文分析](./model-switching-context-analysis.md) - 详细分析
- [Session管理修复](./session-management-fix.md) - Session冲突修复
- [Mem0集成指南](./mem0-integration-guide.md) - 长期记忆方案

## 总结

### 已解决的问题
- ✅ Session冲突（不再报错）
- ✅ 短期记忆容量不足（10条 → 20条）
- ✅ Agent不知道上下文丢失（现在有明确提示）

### 仍存在的限制
- ⚠️ 超过20条的历史仍会丢失
- ⚠️ CLI session上下文无法恢复
- ⚠️ 长期记忆未启用

### 风险评估
- **简单对话**：✅ 完全可用
- **中等复杂度**：✅ 基本可用，偶尔需要重新读取
- **高复杂度**：⚠️ 建议等待P1/P2改进

### 生产就绪度
- **当前状态**：✅ 可用于测试和轻度使用
- **推荐配置**：确保primary model有足够quota，减少切换频率
- **监控重点**：关注模型切换日志，评估影响
