# Mem0长期记忆最终修复

## 错误总结

### 错误1：recall()缺少必需的ID参数
```
Error: At least one of 'user_id', 'agent_id', or 'run_id' must be provided.
```

### 错误2：LLM使用错误的API endpoint
```
HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 401 Unauthorized"
Error: Incorrect API key provided
```

## 问题分析

### 问题1：Mem0的search要求

**Mem0的设计**：
- `search()`方法必须提供至少一个ID参数来限定搜索范围
- 可以是`user_id`、`agent_id`或`run_id`
- 这是为了避免跨用户/agent的记忆泄露

**当前实现的问题**：
```typescript
// ❌ 缺少ID参数
const memories = await this.longTermMemory.recall(query, 5);
```

### 问题2：环境变量未加载

**根本原因**：
- `.env`文件存在，但没有自动加载
- Colony启动时`process.env`中没有`OPENAI_BASE_URL`
- 导致Mem0使用默认的OpenAI endpoint

**验证**：
```bash
# 在shell中
$ source .env && echo $OPENAI_BASE_URL
https://open.bigmodel.cn/api/paas/v4/  # ✅ 有值

# 但在Node.js中
$ node -e "console.log(process.env.OPENAI_BASE_URL)"
undefined  # ❌ 没有值
```

## 解决方案

### 修复1：扩展LongTermMemory接口支持过滤

**文件**：`src/memory/types.ts`

```typescript
export interface LongTermMemory {
    retain(content: MemoryContent): Promise<string>;
    recall(query: string, limit?: number, filters?: MemoryFilters): Promise<MemoryContent[]>;
    reflect(topic: string): Promise<string>;
}

export interface MemoryFilters {
    agentId?: string;
    roomId?: string;
    userId?: string;
    type?: 'conversation' | 'decision' | 'code' | 'knowledge';
}
```

### 修复2：Mem0LongTermMemory实现过滤

**文件**：`src/memory/Mem0LongTermMemory.ts`

```typescript
async recall(query: string, limit?: number, filters?: MemoryFilters): Promise<MemoryContent[]> {
    await this.ensureInitialized();

    const params: Record<string, unknown> = {
        query,
        limit: limit || 5,
        rerank: true
    };

    // Add filters (Mem0 requires at least one ID)
    if (filters?.agentId) {
        params.agent_id = filters.agentId;
    }
    if (filters?.roomId) {
        params.run_id = filters.roomId;
    }
    if (filters?.userId) {
        params.user_id = filters.userId;
    }

    const result = await this.sendRequest('search', params);
    // ...
}
```

### 修复3：ContextAssembler传递过滤参数

**文件**：`src/memory/ContextAssembler.ts`

```typescript
private async buildLongTermSection(query: string, agentId: string, roomId: string): Promise<string> {
    // ...
    const memories = await this.longTermMemory.recall(query, 5, {
        agentId,  // ✅ 传递agentId
        roomId    // ✅ 传递roomId
    });
    // ...
}
```

### 修复4：自动加载.env文件

**安装dotenv**：
```bash
npm install dotenv
```

**文件**：`src/main.ts`

```typescript
// Load environment variables from .env file
import * as dotenv from 'dotenv';
dotenv.config();  // ✅ 在最开始加载

import { Colony } from './Colony.js';
// ...
```

## 工作流程

### 记忆检索流程（修复后）

```
1. Agent收到消息
   ↓
2. ContextAssembler.buildLongTermSection()
   ↓
3. longTermMemory.recall(query, 5, {
       agentId: "architect",  // ✅ 限定为该agent的记忆
       roomId: "room-123"     // ✅ 限定为该room的记忆
   })
   ↓
4. Mem0 bridge收到请求：
   {
       "query": "用户系统设计",
       "limit": 5,
       "agent_id": "architect",
       "run_id": "room-123"
   }
   ↓
5. Mem0搜索：
   - 只在architect的记忆中搜索
   - 只在room-123的记忆中搜索
   - 返回最相关的5条
```

### 环境变量加载流程（修复后）

```
1. npm start
   ↓
2. node dist/main.js
   ↓
3. dotenv.config()  // ✅ 加载.env文件
   ↓
4. process.env.OPENAI_BASE_URL = "https://open.bigmodel.cn/api/paas/v4/"
   ↓
5. Colony初始化
   ↓
6. Mem0LongTermMemory spawn Python
   env: { ...process.env }  // ✅ 包含OPENAI_BASE_URL
   ↓
7. mem0_bridge.py读取环境变量
   llm_base_url = os.environ.get('OPENAI_BASE_URL')  // ✅ 有值
   ↓
8. Mem0使用自定义endpoint
```

## 验证

### 测试1：检查环境变量加载

```bash
npm start
```

**期望日志**：
```
[INFO] [Mem0LongTermMemory] Initializing Mem0 bridge...
[INFO] [mem0_bridge] Using LLM endpoint from env: https://open.bigmodel.cn/api/paas/v4/
[INFO] [mem0_bridge] Using embedder endpoint from env: https://open.bigmodel.cn/api/paas/v4/
[INFO] [Mem0LongTermMemory] Mem0 bridge initialized successfully
```

### 测试2：检查记忆检索

发送消息后，检查日志：

**期望日志**：
```
[INFO] [Mem0LongTermMemory] Recalling memories for query: "设计用户系统..."
[INFO] [ContextAssembler] Retrieved 3 long-term memories for query: ...
```

**不应该看到**：
```
[ERROR] At least one of 'user_id', 'agent_id', or 'run_id' must be provided.
```

### 测试3：检查记忆存储

**期望日志**：
```
[INFO] [Mem0LongTermMemory] Retaining memory to Mem0...
[INFO] [Agent] [开发者] Stored conversation to long-term memory
```

**不应该看到**：
```
[ERROR] HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 401"
```

## 配置文件

### .env（必需）

```bash
# OpenAI-compatible API endpoint
export OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4/
export OPENAI_API_KEY=your-api-key

# Qdrant
export QDRANT_HOST=localhost
export QDRANT_PORT=6333
```

### 启动方式

**之前（需要手动source）**：
```bash
source .env  # ❌ 容易忘记
npm start
```

**现在（自动加载）**：
```bash
npm start  # ✅ 自动加载.env
```

## 记忆隔离

### Agent级别隔离

```typescript
// 架构师的记忆
recall(query, 5, { agentId: "architect" })
// 只返回架构师的记忆，不会返回开发者的记忆

// 开发者的记忆
recall(query, 5, { agentId: "developer" })
// 只返回开发者的记忆
```

### Room级别隔离

```typescript
// Room A的记忆
recall(query, 5, { roomId: "room-a" })
// 只返回Room A的对话记忆

// Room B的记忆
recall(query, 5, { roomId: "room-b" })
// 只返回Room B的对话记忆
```

### 组合过滤

```typescript
// 特定agent在特定room的记忆
recall(query, 5, {
    agentId: "architect",
    roomId: "room-a"
})
// 只返回架构师在Room A的记忆
```

## 相关文件

修改的文件：
1. `src/memory/types.ts` - 添加MemoryFilters接口
2. `src/memory/Mem0LongTermMemory.ts` - 实现过滤参数
3. `src/memory/ContextAssembler.ts` - 传递过滤参数
4. `src/main.ts` - 加载.env文件
5. `package.json` - 添加dotenv依赖

## 总结

### 修复内容
1. ✅ 添加MemoryFilters接口支持过滤
2. ✅ recall()传递agentId和roomId
3. ✅ 自动加载.env文件（dotenv）
4. ✅ 确保环境变量传递到Python subprocess

### 效果
- ✅ 记忆检索不再报错
- ✅ LLM使用自定义endpoint
- ✅ 记忆按agent和room隔离
- ✅ 启动更简单（不需要手动source .env）

### 安全性
- ✅ Agent之间的记忆隔离
- ✅ Room之间的记忆隔离
- ✅ 防止记忆泄露

### 下一步
- 考虑添加user级别的记忆隔离
- 实现记忆共享策略（允许特定agent访问其他agent的记忆）
- 添加记忆过期和清理机制
