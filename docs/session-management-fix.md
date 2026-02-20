# Session Management Fix - Cross-CLI Session Conflicts

## 问题描述

在测试中发现当primary model（如claude）不可用时，系统切换到fallback model（如gemini），但会出现以下错误：

```
Error resuming session: Invalid session identifier "6168ee2b-ad01-451a-ad62-6d3818ca5b35".
gemini exited with code 42
```

## 根本原因

1. **Session ID跨CLI不兼容**
   - Agent为每个room维护一个session ID
   - Session ID是由CLI（如claude）创建并返回的
   - 当切换到不同的CLI（如gemini）时，这个session ID在新CLI中不存在

2. **Session存储结构**
   ```json
   {
     "agent-architect-room-992825d7-0127-42fc-b9c3-6fa5c23e6898": {
       "sessionId": "6168ee2b-ad01-451a-ad62-6d3818ca5b35",
       "cli": "claude",  // 这个session是claude创建的
       "updatedAt": "2026-02-19T09:35:17.102Z"
     }
   }
   ```

3. **错误流程**
   ```
   1. Agent使用claude创建session → sessionId: "6168ee2b..."
   2. 保存到sessions.json，标记为cli: "claude"
   3. 下次调用时，claude不可用
   4. ModelRouter切换到gemini fallback
   5. 但仍然传递了claude的sessionId给gemini
   6. Gemini CLI尝试恢复session，但找不到 → 错误
   ```

## 解决方案

### 修改位置：`src/llm/ModelRouter.ts`

在ModelRouter中，当切换到fallback model时，清除原来的sessionId：

```typescript
for (const model of modelsToTry) {
    if (!this.rateLimiter.canUse(model)) continue;

    // If we switched models, clear sessionId to avoid cross-CLI session conflicts
    const invokeOptions = model !== primary && options.sessionId
        ? { ...options, sessionId: undefined }
        : options;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        try {
            log.info(`Invoking ${model} (attempt ${attempt + 1})`);
            const result = await invoke(model, prompt, invokeOptions);
            // ...
        }
    }
}
```

### 修复逻辑

1. **检测model切换**：`model !== primary`
2. **清除sessionId**：如果切换了model且有sessionId，创建新的options对象，将sessionId设为undefined
3. **保持其他选项**：使用spread operator保留其他配置（env、sessionName等）

## 效果

### 修复前
```
[INFO] [RateLimitManager] Primary model claude unavailable, checking fallbacks...
[INFO] [RateLimitManager] Switching to fallback model: gemini
[INFO] [ModelRouter] Model switched: claude → gemini
[INFO] [ModelRouter] Invoking gemini (attempt 1)
[INFO] [CLIInvoker] Invoking gemini { sessionId: '6168ee2b-ad01-451a-ad62-6d3818ca5b35' }
[WARN] [ModelRouter] Retryable error for gemini (attempt 1): gemini exited with code 42
Error resuming session: Invalid session identifier "6168ee2b-ad01-451a-ad62-6d3818ca5b35"
```

### 修复后
```
[INFO] [RateLimitManager] Primary model claude unavailable, checking fallbacks...
[INFO] [RateLimitManager] Switching to fallback model: gemini
[INFO] [ModelRouter] Model switched: claude → gemini
[INFO] [ModelRouter] Invoking gemini (attempt 1)
[INFO] [CLIInvoker] Invoking gemini { sessionId: 'new' }
[INFO] [Agent] [架构师] ── LLM Response round 1 (234 chars) ──
✓ 成功创建新session
```

## 相关文件

- `src/llm/ModelRouter.ts` - 主要修复位置
- `src/llm/CLIInvoker.ts` - Session管理逻辑
- `src/agent/Agent.ts` - Per-room session存储
- `.data/sessions.json` - Session持久化存储

## 未来改进

### 1. Per-CLI Session Storage

当前实现：每个room只有一个session ID
```typescript
private roomSessions = new Map<string, string>();
```

改进方案：为每个CLI维护独立的session
```typescript
private roomSessions = new Map<string, Map<SupportedCLI, string>>();
```

这样切换CLI时可以恢复对应CLI的session，而不是丢弃。

### 2. Session Validation

在恢复session前验证CLI是否匹配：
```typescript
const saved = getSession(options.sessionName);
if (saved && saved.cli === cli) {
    sessionId = saved.sessionId;
} else if (saved) {
    log.warn(`Session CLI mismatch: saved=${saved.cli}, current=${cli}, creating new session`);
}
```

### 3. Automatic Session Cleanup

定期清理过期的session记录：
```typescript
function cleanupOldSessions(maxAge: number = 7 * 24 * 60 * 60 * 1000) {
    const sessions = loadSessions();
    const now = Date.now();
    for (const [name, record] of Object.entries(sessions)) {
        const age = now - new Date(record.updatedAt).getTime();
        if (age > maxAge) {
            delete sessions[name];
        }
    }
    saveSessionsFile(sessions);
}
```

## 测试建议

### 测试场景1：正常切换
1. 启动Colony，使用claude作为primary
2. 发送消息，验证session创建
3. 禁用claude（模拟quota exhausted）
4. 发送新消息，验证切换到gemini且创建新session
5. 检查日志确认没有"Invalid session identifier"错误

### 测试场景2：来回切换
1. 使用claude创建session
2. 切换到gemini（创建新session）
3. 恢复claude可用性
4. 验证能否恢复原来的claude session

### 测试场景3：多room隔离
1. 在room A使用claude
2. 在room B使用gemini
3. 验证两个room的session互不干扰

## 相关Issue

- Session ID跨CLI不兼容
- Fallback model切换时的状态管理
- Multi-agent系统中的session隔离

## 参考

- [CLIInvoker实现](../src/llm/CLIInvoker.ts)
- [ModelRouter实现](../src/llm/ModelRouter.ts)
- [Agent实现](../src/agent/Agent.ts)
