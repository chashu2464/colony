# Mem0超时错误修复

## 错误现象

```
[ERROR] [Mem0LongTermMemory] Failed to retain memory: Error: Request 4 timeout
```

请求在30秒后超时，没有收到Python进程的响应。

## 根本原因

**.env文件格式错误** - 使用了`export`关键字，但dotenv库不支持。

### 错误的格式

```bash
# ❌ 错误：dotenv不支持export
export OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4/
export OPENAI_API_KEY=your-api-key
```

### 正确的格式

```bash
# ✅ 正确：dotenv期望的格式
OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4/
OPENAI_API_KEY=your-api-key
```

## 问题链

1. `.env`文件使用了`export`关键字
2. dotenv库无法正确解析带`export`的变量
3. 环境变量没有被加载到`process.env`
4. Python子进程没有收到`OPENAI_API_KEY`
5. Mem0初始化失败（缺少API密钥）
6. Python进程立即退出
7. TypeScript等待响应超时（30秒）

## 解决方案

### 1. 修复.env文件

移除所有`export`关键字：

```bash
# Colony Environment Variables for Custom API
# This file is loaded by dotenv (DO NOT use 'export' keyword)

# Option 1: Use same endpoint for both LLM and embedder (shared)
OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4/
OPENAI_API_KEY=your-api-key-here

# Qdrant
QDRANT_HOST=localhost
QDRANT_PORT=6333

# Log level (debug, info, warn, error)
LOG_LEVEL=info
```

### 2. 重启Colony

```bash
# 停止Colony
Ctrl+C

# 重新启动
npm start
```

## 验证修复

### 1. 检查环境变量加载

```bash
node -e "require('dotenv').config(); console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅ 已设置' : '❌ 未设置')"
```

**期望输出**：
```
OPENAI_API_KEY: ✅ 已设置
```

### 2. 测试Python bridge启动

```bash
python3 test_mem0.py
```

**期望输出**：
```
✅ Mem0初始化成功
✅ 添加记忆成功
✅ 搜索记忆成功
```

### 3. 发送消息测试

在Colony中发送消息，查看日志：

**期望日志**：
```
[INFO] [Mem0LongTermMemory] Initializing Mem0 bridge...
[INFO] [Mem0LongTermMemory] Mem0 bridge initialized successfully
[INFO] [Mem0LongTermMemory] Retaining memory to Mem0...
[INFO] [Mem0LongTermMemory] Memory retained: xxx (event: ADD)
```

**不应该看到**：
```
[ERROR] Request timeout
[ERROR] Failed to retain memory
```

## 为什么会有export关键字？

`.env`文件最初可能是为了shell脚本设计的：

```bash
# 用于shell脚本
source .env  # 需要export关键字
```

但dotenv库期望的是简单的键值对格式：

```bash
# 用于dotenv
# 不需要export关键字
KEY=value
```

## 两种使用方式

### 方式1：dotenv（推荐）

**优点**：
- 自动加载，无需手动source
- 跨平台（Windows/Linux/macOS）
- 与Node.js集成良好

**格式**：
```bash
# .env
OPENAI_API_KEY=xxx
```

**使用**：
```typescript
import * as dotenv from 'dotenv';
dotenv.config();  // 自动加载.env
```

### 方式2：Shell source

**优点**：
- 可以在shell中直接使用
- 支持复杂的shell语法

**格式**：
```bash
# .env
export OPENAI_API_KEY=xxx
```

**使用**：
```bash
source .env
npm start
```

**注意**：如果使用这种方式，需要每次启动前手动source。

## 最佳实践

### 1. 使用dotenv格式

```bash
# .env - 不要使用export
OPENAI_BASE_URL=https://...
OPENAI_API_KEY=xxx
```

### 2. 添加注释说明

```bash
# This file is loaded by dotenv (DO NOT use 'export' keyword)
```

### 3. 提供示例文件

创建`.env.example`：

```bash
# Copy this file to .env and fill in your values
OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4/
OPENAI_API_KEY=your-api-key-here
QDRANT_HOST=localhost
QDRANT_PORT=6333
```

### 4. 添加到.gitignore

```bash
# .gitignore
.env
.env.local
```

## 相关错误

如果遇到类似的错误：

### 错误1：环境变量未定义

```
[ERROR] The api_key client option must be set
```

**检查**：
```bash
node -e "require('dotenv').config(); console.log(process.env.OPENAI_API_KEY)"
```

### 错误2：Python进程立即退出

```
[WARN] Mem0 bridge exited with code 1
```

**检查**：
```bash
LOG_LEVEL=debug npm start
```

查看详细的Python错误日志。

### 错误3：Request timeout

```
[ERROR] Request 4 timeout
```

**原因**：
- Python进程没有启动
- Python进程崩溃
- API调用太慢

**检查**：
```bash
ps aux | grep "python.*mem0_bridge"
```

## 总结

- ❌ **错误原因**：.env文件使用了`export`关键字
- ✅ **解决方案**：移除`export`，使用纯键值对格式
- ✅ **验证方法**：检查环境变量加载，测试Python bridge启动
- ✅ **最佳实践**：使用dotenv格式，添加注释说明

修复后，Mem0长期记忆功能应该可以正常工作了。
