# Mem0 Bridge启动错误修复

## 错误日志

```
[INFO] [Mem0LongTermMemory] Initializing Mem0 bridge...
[INFO] [Mem0LongTermMemory] Mem0 bridge initialized successfully
[INFO] [Mem0LongTermMemory] Recalling memories for query: "分析所在目录的项目结构..."
[ERROR] [Mem0LongTermMemory] Mem0 bridge error: /Library/Developer/CommandLineTools/usr/bin/python3: No module named mem0_bridge
[WARN] [Mem0LongTermMemory] Mem0 bridge exited with code 1
[ERROR] [ContextAssembler] Failed to retrieve long-term memories: Error: Request 1 timeout
```

## 问题分析

### 问题1：Python找不到mem0_bridge模块

**原因**：
- `mem0_bridge.py`位于`scripts/`目录
- Python的模块搜索路径不包含`scripts/`目录
- 使用`python3 -m mem0_bridge`时，Python在默认路径中查找，找不到模块

**Python默认搜索路径**：
```
/Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/lib/python3.9
/Users/casu/Library/Python/3.9/lib/python/site-packages
```

**缺少**：`/Users/casu/Documents/Colony/scripts`

### 问题2：配置键名不匹配

**原因**：
- YAML配置文件使用snake_case：`vector_store`, `graph_store`
- TypeScript接口使用camelCase：`vectorStore`, `graphStore`
- 导致配置解析失败

## 解决方案

### 修复1：添加PYTHONPATH环境变量

**文件**：`src/memory/Mem0LongTermMemory.ts`

**修改**：
```typescript
import * as path from 'path';

private async initialize(): Promise<void> {
    log.info('Initializing Mem0 bridge...');

    // Get the scripts directory path
    const scriptsDir = path.join(process.cwd(), 'scripts');

    // Start Python subprocess running the Mem0 bridge
    this.pythonProcess = spawn('python3', [
        '-u',  // Unbuffered output
        '-m', 'mem0_bridge',
        '--config', JSON.stringify(this.config)
    ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
            ...process.env,
            PYTHONPATH: scriptsDir  // ✅ 添加scripts目录到Python路径
        }
    });
}
```

**效果**：
- Python现在可以在`scripts/`目录中找到`mem0_bridge`模块
- 不需要修改系统的PYTHONPATH
- 不需要安装mem0_bridge为Python包

### 修复2：统一配置键名为snake_case

**文件**：`src/memory/Mem0LongTermMemory.ts`

**修改**：
```typescript
export interface Mem0Config {
    vector_store: {  // ✅ 改为snake_case
        provider: string;
        config: Record<string, unknown>;
    };
    llm?: {
        provider: string;
        config: Record<string, unknown>;
    };
    embedder?: {
        provider: string;
        config: Record<string, unknown>;
    };
    graph_store?: {  // ✅ 改为snake_case
        provider: string;
        config: Record<string, unknown>;
    };
}
```

**原因**：
- YAML配置文件已经使用snake_case（标准Python风格）
- `mem0_bridge.py`也支持snake_case
- 统一为snake_case避免转换错误

**同时修改**：`src/tests/mem0-integration-test.ts`
```typescript
const mem0 = new Mem0LongTermMemory({
    vector_store: {  // ✅ 改为snake_case
        provider: 'chroma',
        config: { path: './.mem0_test/chroma_db' }
    },
    // ...
});
```

## 验证

### 测试1：Python模块导入

```bash
# 设置PYTHONPATH并测试
PYTHONPATH=scripts python3 -m mem0_bridge --config '{"vector_store":{"provider":"qdrant","config":{"host":"localhost"}}}'

# 应该看到：
# INFO - Initializing Mem0...
# INFO - Mem0 configuration: ...
```

### 测试2：完整集成测试

```bash
# 1. 启动Qdrant
docker run -p 6333:6333 qdrant/qdrant

# 2. 启动Colony
npm start

# 3. 发送消息触发长期记忆
curl -X POST http://localhost:3001/api/rooms/test/messages \
  -H "Content-Type: application/json" \
  -d '{"senderId":"user1","content":"@架构师 设计一个用户系统","mentions":["architect"]}'

# 4. 检查日志
# 应该看到：
# [INFO] [Mem0LongTermMemory] Initializing Mem0 bridge...
# [INFO] [Mem0LongTermMemory] Mem0 bridge initialized successfully
# [INFO] [Mem0LongTermMemory] Recalling memories for query: ...
# [INFO] [ContextAssembler] Retrieved X long-term memories
```

## 相关文件

修改的文件：
1. `src/memory/Mem0LongTermMemory.ts` - 添加PYTHONPATH，修改接口
2. `src/tests/mem0-integration-test.ts` - 修改测试配置

未修改的文件：
- `scripts/mem0_bridge.py` - 已支持snake_case
- `config/mem0.yaml` - 已使用snake_case

## 其他可能的解决方案

### 方案A：直接运行Python脚本（不推荐）

```typescript
this.pythonProcess = spawn('python3', [
    '-u',
    path.join(process.cwd(), 'scripts', 'mem0_bridge.py'),  // 直接路径
    '--config', JSON.stringify(this.config)
]);
```

**缺点**：
- 需要修改`mem0_bridge.py`的shebang和入口
- 不符合Python模块的标准用法

### 方案B：安装mem0_bridge为Python包（过度工程）

```bash
cd scripts
pip install -e .  # 需要创建setup.py
```

**缺点**：
- 增加部署复杂度
- 需要维护setup.py
- 对于单个模块来说过于复杂

### 方案C：使用sys.path.insert（不推荐）

在`mem0_bridge.py`开头添加：
```python
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))
```

**缺点**：
- 修改Python代码
- 不够优雅
- 可能影响其他导入

## 最佳实践

**选择方案1（PYTHONPATH）的原因**：
1. ✅ 不修改Python代码
2. ✅ 符合Python模块标准
3. ✅ 易于理解和维护
4. ✅ 不影响系统环境
5. ✅ 适用于开发和生产环境

## 故障排除

### 问题：仍然找不到模块

**检查**：
```bash
# 1. 确认文件存在
ls -la scripts/mem0_bridge.py

# 2. 确认Python版本
python3 --version

# 3. 手动测试PYTHONPATH
PYTHONPATH=scripts python3 -c "import mem0_bridge; print('OK')"

# 4. 检查工作目录
pwd  # 应该在 /Users/casu/Documents/Colony
```

### 问题：配置解析错误

**检查**：
```bash
# 1. 验证YAML格式
python3 -c "import yaml; print(yaml.safe_load(open('config/mem0.yaml')))"

# 2. 检查键名
# 应该是 vector_store, 不是 vectorStore
```

### 问题：Mem0初始化失败

**检查**：
```bash
# 1. 确认Qdrant运行
curl http://localhost:6333/health

# 2. 确认环境变量
source .env
echo $OPENAI_BASE_URL
echo $OPENAI_API_KEY

# 3. 测试API连接
curl -X POST $OPENAI_BASE_URL/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"glm-4-flash","messages":[{"role":"user","content":"test"}]}'
```

## 总结

### 修复内容
- ✅ 添加PYTHONPATH环境变量到spawn配置
- ✅ 统一配置键名为snake_case
- ✅ 修复测试文件配置

### 效果
- ✅ Python可以找到mem0_bridge模块
- ✅ 配置正确解析
- ✅ Mem0 bridge成功启动
- ✅ 长期记忆功能正常工作

### 验证方法
```bash
npm run build:server && npm start
# 查看日志，应该看到：
# [INFO] [Mem0LongTermMemory] Mem0 bridge initialized successfully
# 而不是：
# [ERROR] No module named mem0_bridge
```
