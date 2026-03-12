# Mem0错误排查指南

## 错误现象

```
[ERROR] [Agent] Failed to store to long-term memory: Error: Failed to retain memory
```

## 可能的原因

### 1. Python进程未启动或崩溃

**检查方法**：
```bash
# 检查Python进程是否运行
ps aux | grep "python.*mem0_bridge" | grep -v grep
```

**如果没有输出**，说明Python进程没有启动或已崩溃。

### 2. Python模块导入失败

**检查方法**：
```bash
# 测试Python模块是否可以导入
PYTHONPATH=scripts python3 -c "import mem0_bridge; print('OK')"
```

**如果报错**，说明mem0或依赖包未安装。

### 3. Qdrant未运行

**检查方法**：
```bash
# 检查Qdrant健康状态
curl http://localhost:6333/health
```

**期望输出**：`{"status":"ok"}`

### 4. 环境变量未设置

**检查方法**：
```bash
# 检查环境变量
node -e "require('dotenv').config(); console.log('OPENAI_BASE_URL:', process.env.OPENAI_BASE_URL)"
```

**期望输出**：显示你的自定义API endpoint

### 5. API密钥无效

**检查方法**：
```bash
# 测试API密钥
curl -X POST https://open.bigmodel.cn/api/paas/v4/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"glm-4-flash","messages":[{"role":"user","content":"test"}]}'
```

## 诊断步骤

### 步骤1：启用DEBUG日志

在`.env`文件中添加：
```bash
LOG_LEVEL=debug
```

然后重启Colony：
```bash
npm start
```

这样可以看到Python进程的所有stderr输出。

### 步骤2：查看详细错误

发送一条消息后，查看日志中的详细错误信息：

**期望看到**：
```
[DEBUG] [Mem0LongTermMemory] Mem0 bridge stderr: 2024-01-01 00:00:00 - mem0_bridge - INFO - Initializing Mem0...
[DEBUG] [Mem0LongTermMemory] Mem0 bridge stderr: 2024-01-01 00:00:00 - mem0_bridge - INFO - Using LLM endpoint from env: https://...
[DEBUG] [Mem0LongTermMemory] Mem0 bridge stderr: 2024-01-01 00:00:00 - mem0_bridge - INFO - Mem0 initialized successfully
```

**如果看到ERROR**：
```
[ERROR] [Mem0LongTermMemory] Mem0 bridge error: Traceback (most recent call last):
  ...
```

这会显示Python的具体错误。

### 步骤3：手动测试Python bridge

创建测试脚本`test_mem0.py`：

```python
import os
import json
from mem0 import Memory

# 设置环境变量
os.environ['OPENAI_BASE_URL'] = 'https://open.bigmodel.cn/api/paas/v4/'
os.environ['OPENAI_API_KEY'] = 'your-api-key'

# 配置
config = {
    'vector_store': {
        'provider': 'qdrant',
        'config': {
            'host': 'localhost',
            'port': 6333,
            'collection_name': 'test_memories'
        }
    },
    'llm': {
        'provider': 'openai',
        'config': {
            'model': 'glm-4-flash',
            'api_key': os.environ['OPENAI_API_KEY']
        }
    },
    'embedder': {
        'provider': 'openai',
        'config': {
            'model': 'embedding-3',
            'api_key': os.environ['OPENAI_API_KEY'],
            'embedding_dims': 1536
        }
    }
}

# 初始化
print('Initializing Mem0...')
memory = Memory.from_config(config)
print('Mem0 initialized')

# 测试添加记忆
print('Adding memory...')
result = memory.add(
    messages='This is a test memory',
    agent_id='test-agent',
    run_id='test-run'
)
print('Result:', json.dumps(result, indent=2))
```

运行测试：
```bash
python3 test_mem0.py
```

### 步骤4：检查Mem0版本

```bash
pip3 show mem0ai
```

确保版本是最新的：
```bash
pip3 install --upgrade mem0ai
```

## 常见错误及解决方案

### 错误1：No module named 'mem0'

**原因**：mem0未安装

**解决**：
```bash
pip3 install mem0ai
```

### 错误2：Connection refused (Qdrant)

**原因**：Qdrant未运行

**解决**：
```bash
# 使用Docker启动Qdrant
docker run -d -p 6333:6333 qdrant/qdrant
```

### 错误3：401 Unauthorized

**原因**：API密钥无效或未设置

**解决**：
1. 检查`.env`文件中的`OPENAI_API_KEY`
2. 确保密钥有效且有余额
3. 重启Colony以重新加载环境变量

### 错误4：Request timeout

**原因**：API响应太慢或网络问题

**解决**：
1. 检查网络连接
2. 尝试使用不同的模型（如glm-4-flash更快）
3. 增加timeout时间（在Mem0LongTermMemory.ts中）

### 错误5：Empty results

**原因**：Mem0没有提取到任何记忆

**可能原因**：
- 消息内容太短或无意义
- LLM提取失败
- 配置问题

**解决**：
1. 检查消息内容是否有意义
2. 查看DEBUG日志中的LLM请求/响应
3. 尝试发送更长、更有内容的消息

### 错误6：Python process exited

**原因**：Python进程崩溃

**解决**：
1. 查看完整的错误堆栈
2. 检查Python依赖是否完整
3. 手动运行mem0_bridge测试

## 临时禁用长期记忆

如果需要临时禁用长期记忆功能：

### 方法1：环境变量

在`.env`中添加：
```bash
DISABLE_LONG_TERM_MEMORY=true
```

然后修改`Colony.ts`：
```typescript
if (options.enableLongTermMemory !== false
    && !process.env.DISABLE_LONG_TERM_MEMORY
    && fs.existsSync(mem0ConfigPath)) {
    // ...
}
```

### 方法2：删除配置文件

临时重命名配置文件：
```bash
mv config/mem0.yaml config/mem0.yaml.disabled
```

### 方法3：修改Agent配置

在`Agent.ts`中禁用长期记忆：
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

## 完整诊断命令

运行以下命令进行完整诊断：

```bash
#!/bin/bash
echo "=== Colony Mem0 诊断 ==="

echo -e "\n1. 检查Python进程"
ps aux | grep "python.*mem0_bridge" | grep -v grep || echo "❌ Python进程未运行"

echo -e "\n2. 检查Qdrant"
curl -s http://localhost:6333/health || echo "❌ Qdrant未运行"

echo -e "\n3. 检查环境变量"
node -e "require('dotenv').config(); console.log('OPENAI_BASE_URL:', process.env.OPENAI_BASE_URL || '❌ 未设置')"
node -e "require('dotenv').config(); console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅ 已设置' : '❌ 未设置')"

echo -e "\n4. 检查Python模块"
PYTHONPATH=scripts python3 -c "import mem0_bridge; print('✅ mem0_bridge可导入')" 2>&1

echo -e "\n5. 检查mem0版本"
pip3 show mem0ai | grep Version || echo "❌ mem0ai未安装"

echo -e "\n6. 检查会话文件"
ls -lh .data/sessions/ 2>/dev/null || echo "❌ 会话目录不存在"

echo -e "\n=== 诊断完成 ==="
```

保存为`diagnose.sh`并运行：
```bash
chmod +x diagnose.sh
./diagnose.sh
```

## 获取帮助

如果以上步骤都无法解决问题，请提供以下信息：

1. 完整的错误日志（启用DEBUG级别）
2. `diagnose.sh`的输出
3. Python版本：`python3 --version`
4. mem0版本：`pip3 show mem0ai`
5. 操作系统版本

## 相关文档

- [Mem0集成完整总结](./mem0-integration-complete-summary.md)
- [重启指南](./restart-guide.md)
- [Mem0 base_url限制](./mem0-base-url-limitation.md)
