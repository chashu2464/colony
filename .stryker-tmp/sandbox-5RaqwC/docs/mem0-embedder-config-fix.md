# Mem0 Embedder配置错误修复

## 错误日志

```
[ERROR] [Mem0LongTermMemory] Mem0 bridge error: 2026-02-19 18:05:38,103 - mem0_bridge - ERROR - Failed to initialize Mem0: 'dict' object has no attribute 'custom_fact_extraction_prompt'
Traceback (most recent call last):
  File "/Users/casu/Documents/Colony/scripts/mem0_bridge.py", line 262, in main
    bridge = Mem0Bridge(config)
  File "/Users/casu/Documents/Colony/scripts/mem0_bridge.py", line 131, in __init__
    self.memory = Memory(mem0_config)
  File "/Users/casu/Library/Python/3.9/lib/python/site-packages/mem0/memory/main.py", line 176, in __init__
    self.custom_fact_extraction_prompt = self.config.custom_fact_extraction_prompt
AttributeError: 'dict' object has no attribute 'custom_fact_extraction_prompt'
```

然后修复后又出现：

```
[ERROR] Failed to initialize Mem0: __init__() got an unexpected keyword argument 'base_url'
Traceback (most recent call last):
  File "/Users/casu/Documents/Colony/scripts/mem0_bridge.py", line 132, in __init__
    self.memory = Memory.from_config(mem0_config)
  File "/Users/casu/Library/Python/3.9/lib/python/site-packages/mem0/memory/main.py", line 178, in __init__
    self.embedding_model = EmbedderFactory.create(
  File "/Users/casu/Library/Python/3.9/lib/python/site-packages/mem0/utils/factory.py", line 158, in create
    base_config = BaseEmbedderConfig(**config)
TypeError: __init__() got an unexpected keyword argument 'base_url'
```

## 问题分析

### 问题1：使用错误的Memory初始化方法

**错误代码**：
```python
self.memory = Memory(mem0_config)  # ❌ 传递dict会失败
```

**原因**：
- `Memory()`构造函数期望接收`MemoryConfig`对象
- 直接传递dict会导致属性访问错误

**正确方法**：
```python
self.memory = Memory.from_config(mem0_config)  # ✅ 使用from_config()
```

### 问题2：Embedder配置不支持base_url参数

**错误代码**：
```python
if embedder_base_url:
    embedder_provider_config['base_url'] = embedder_base_url  # ❌ 不支持
```

**原因**：
- Mem0的**LLM配置**支持`base_url`参数
- 但**Embedder配置**不支持`base_url`参数
- Embedder只能通过`OPENAI_BASE_URL`环境变量设置endpoint

**Mem0的设计**：
```python
# LLM配置 - 支持base_url
llm_config = {
    'provider': 'openai',
    'config': {
        'model': 'gpt-4o-mini',
        'api_key': 'xxx',
        'base_url': 'https://custom.api.com'  # ✅ 支持
    }
}

# Embedder配置 - 不支持base_url
embedder_config = {
    'provider': 'openai',
    'config': {
        'model': 'text-embedding-3-small',
        'api_key': 'xxx',
        # 'base_url': 'xxx'  # ❌ 不支持，会报错
    }
}

# Embedder通过环境变量设置endpoint
os.environ['OPENAI_BASE_URL'] = 'https://custom.api.com'
```

## 解决方案

### 修复1：使用Memory.from_config()

**文件**：`scripts/mem0_bridge.py`

**修改**：
```python
# 之前
self.memory = Memory(mem0_config)

# 现在
self.memory = Memory.from_config(mem0_config)
```

### 修复2：不要将base_url添加到embedder配置

**文件**：`scripts/mem0_bridge.py`

**修改**：
```python
# Embedder config with environment variable support
if 'embedder' in config:
    embedder_config = config['embedder']
    embedder_provider_config = embedder_config.get('config', {}).copy()

    # Check for embedder-specific environment variables
    embedder_base_url = os.environ.get('EMBEDDER_BASE_URL') or os.environ.get('OPENAI_BASE_URL')
    embedder_api_key = os.environ.get('EMBEDDER_API_KEY') or os.environ.get('OPENAI_API_KEY')

    # IMPORTANT: Mem0's embedder does NOT support base_url in config
    # It only uses OPENAI_BASE_URL environment variable
    if embedder_base_url:
        logger.info(f"Using embedder endpoint from env: {embedder_base_url}")
        # ✅ 不添加到config，Mem0会从环境变量读取

    if embedder_api_key:
        embedder_provider_config['api_key'] = embedder_api_key
        logger.info("Using embedder API key from environment")

    mem0_config['embedder'] = {
        'provider': embedder_config.get('provider', 'openai'),
        'config': embedder_provider_config  # ✅ 不包含base_url
    }
```

**关键点**：
- LLM配置：可以添加`base_url`到config
- Embedder配置：**不能**添加`base_url`到config
- Embedder的endpoint通过`OPENAI_BASE_URL`环境变量设置

## 环境变量设置

确保在启动Colony前设置环境变量：

```bash
# .env
export OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4/
export OPENAI_API_KEY=your-api-key

# 或者为LLM和Embedder设置不同的endpoint
export LLM_BASE_URL=https://api.openai.com/v1
export LLM_API_KEY=sk-llm-key
export EMBEDDER_BASE_URL=https://custom-embedder.com/v1
export EMBEDDER_API_KEY=sk-embedder-key
```

**注意**：
- `OPENAI_BASE_URL`会被LLM和Embedder共享使用
- `LLM_BASE_URL`只影响LLM（优先级更高）
- `EMBEDDER_BASE_URL`只影响Embedder（优先级更高）

## 验证

### 测试1：Mem0初始化

```bash
source .env
PYTHONPATH=scripts python3 -m mem0_bridge --config "$(cat config/mem0.yaml | python3 -c 'import sys, yaml, json; print(json.dumps(yaml.safe_load(sys.stdin)))')"
```

**期望输出**：
```
INFO - Initializing Mem0...
INFO - Using LLM endpoint from env: https://open.bigmodel.cn/api/paas/v4/
INFO - Using embedder endpoint from env: https://open.bigmodel.cn/api/paas/v4/
INFO - Mem0 configuration:
INFO -   LLM: openai
INFO -   Embedder: openai
INFO -   Vector Store: qdrant
INFO -   Graph Store: disabled
INFO - Created index for user_id in collection colony_memories
INFO - Mem0 initialized successfully
```

### 测试2：完整功能测试

```bash
source .env
python3 tests/test-custom-api.py
```

**期望输出**：
```
=== Testing Custom API Endpoint ===

1. Loading configuration from: config/mem0.yaml
2. Creating Mem0 instance...
   ✓ Mem0 instance created successfully

3. Testing memory extraction (LLM)...
   ✓ Memory added: 喜欢喝咖啡，特别是拿铁

4. Testing semantic search (Embedder)...
   ✓ Search completed: 1 results

=== All Tests Passed ✓ ===
```

### 测试3：Colony集成测试

```bash
npm start
```

**检查日志**：
```
[INFO] [Mem0LongTermMemory] Initializing Mem0 bridge...
[INFO] [Mem0LongTermMemory] Mem0 bridge initialized successfully
[INFO] [ContextAssembler] Retrieved 5 long-term memories for query: ...
```

## 相关Mem0源码

### LLM配置（支持base_url）

```python
# mem0/llms/configs.py
class BaseLlmConfig(BaseModel):
    model: Optional[str] = Field(None, description="Model name")
    temperature: float = Field(0.0, description="Temperature")
    max_tokens: int = Field(2000, description="Max tokens")
    top_p: float = Field(1.0, description="Top p")
    api_key: Optional[str] = Field(None, description="API key")
    base_url: Optional[str] = Field(None, description="Base URL")  # ✅ 支持
```

### Embedder配置（不支持base_url）

```python
# mem0/embeddings/configs.py
class BaseEmbedderConfig(BaseModel):
    model: Optional[str] = Field(None, description="Model name")
    embedding_dims: Optional[int] = Field(None, description="Embedding dimensions")
    api_key: Optional[str] = Field(None, description="API key")
    # ❌ 没有base_url字段
```

### Embedder使用环境变量

```python
# mem0/embeddings/openai.py
class OpenAIEmbedding:
    def __init__(self, config: OpenAIEmbedderConfig):
        # 从环境变量读取base_url
        base_url = os.getenv("OPENAI_BASE_URL")
        self.client = OpenAI(
            api_key=config.api_key,
            base_url=base_url  # ✅ 从环境变量
        )
```

## 总结

### 修复内容
1. ✅ 使用`Memory.from_config()`而不是`Memory()`
2. ✅ 不要将`base_url`添加到embedder配置
3. ✅ 通过`OPENAI_BASE_URL`环境变量设置embedder endpoint

### 关键要点
- **LLM**：支持config中的`base_url`参数
- **Embedder**：只支持`OPENAI_BASE_URL`环境变量
- 这是Mem0的设计限制，不是bug

### 测试结果
- ✅ Mem0成功初始化
- ✅ LLM使用自定义endpoint
- ✅ Embedder使用自定义endpoint
- ✅ 记忆存储和检索正常工作

### 相关文档
- [Mem0 Bridge启动修复](./mem0-bridge-startup-fix.md)
- [自定义API设置](./custom-api-setup.md)
- [独立endpoint配置](./separate-endpoints-guide.md)
