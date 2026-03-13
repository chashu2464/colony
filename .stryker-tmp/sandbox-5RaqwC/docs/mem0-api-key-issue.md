# Mem0错误：API密钥问题

## 问题根源

你遇到的错误：
```
[ERROR] [Agent] Failed to store to long-term memory: Error: Failed to retain memory
```

实际原因是：
```
openai.AuthenticationError: Error code: 401 - {'error': {'code': '401', 'message': '令牌已过期或验证不正确'}}
```

## 解决方案

### 1. 检查API密钥

```bash
# 查看当前密钥
cat .env | grep OPENAI_API_KEY
```

### 2. 更新API密钥

编辑`.env`文件，更新为有效的API密钥：

```bash
export OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4/
export OPENAI_API_KEY=your-new-valid-key-here
export QDRANT_HOST=localhost
export QDRANT_PORT=6333
```

### 3. 测试API密钥

```bash
# 测试密钥是否有效
curl -X POST https://open.bigmodel.cn/api/paas/v4/chat/completions \
  -H "Authorization: Bearer $(grep OPENAI_API_KEY .env | cut -d'=' -f2)" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "glm-4-flash",
    "messages": [{"role": "user", "content": "test"}]
  }'
```

**期望输出**：正常的JSON响应，包含`choices`字段

**如果401错误**：密钥无效，需要更新

### 4. 重启Colony

更新密钥后，重启Colony：

```bash
# 停止Colony
Ctrl+C

# 重新启动
npm start
```

## 为什么会出现这个错误？

1. **Mem0初始化成功** - Python进程启动正常
2. **尝试添加记忆时** - Mem0调用LLM API提取记忆
3. **API返回401** - 密钥无效或过期
4. **Python进程返回错误** - TypeScript收到错误响应
5. **显示"Failed to retain memory"** - 这是最终的错误消息

## 如何获取新的API密钥？

### 智谱AI (BigModel)

1. 访问：https://open.bigmodel.cn/
2. 登录账号
3. 进入"API Keys"页面
4. 创建新的API Key
5. 复制密钥到`.env`文件

### 检查余额

```bash
# 查看账户余额（如果API支持）
curl -H "Authorization: Bearer your-api-key" \
  https://open.bigmodel.cn/api/paas/v4/account/balance
```

## 临时禁用长期记忆

如果暂时无法获取有效密钥，可以临时禁用长期记忆：

### 方法1：重命名配置文件

```bash
mv config/mem0.yaml config/mem0.yaml.disabled
```

### 方法2：修改Agent代码

编辑`src/agent/Agent.ts`，将`includeLongTerm`设置为`false`：

```typescript
let currentPrompt = await this.contextAssembler.assemble({
    agentId: this.id,
    roomId: message.roomId,
    currentMessage: message,
    tokenBudget: 8000,
    includeHistory: true,
    includeLongTerm: false,  // ❌ 禁用长期记忆
});
```

然后rebuild：
```bash
npm run build:server
npm start
```

## 验证修复

更新密钥后，运行测试：

```bash
python3 test_mem0.py
```

**期望输出**：
```
=== 测试Mem0初始化 ===
OPENAI_BASE_URL: https://open.bigmodel.cn/api/paas/v4/
OPENAI_API_KEY: ✅ 已设置

1. 初始化Mem0...
✅ Mem0初始化成功

2. 测试添加记忆...
✅ 添加记忆成功
结果: {
  "results": [
    {
      "id": "...",
      "memory": "...",
      "event": "ADD"
    }
  ]
}

3. 测试搜索记忆...
✅ 搜索记忆成功
找到 1 条记忆

=== 测试完成 ===
```

## 总结

- ✅ Mem0集成正常
- ✅ Python进程可以启动
- ✅ Qdrant正常运行
- ❌ **API密钥无效或过期** - 这是唯一的问题

更新API密钥后，长期记忆功能就可以正常工作了。
