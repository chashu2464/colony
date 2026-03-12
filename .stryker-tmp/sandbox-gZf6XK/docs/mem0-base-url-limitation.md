# Mem0配置关键发现：LLM和Embedder都不支持base_url参数

## 重要发现

经过测试发现，**Mem0的LLM和Embedder配置都不支持`base_url`参数**！

### 错误的理解（之前）

```python
# ❌ 错误：以为LLM支持base_url
llm_config = {
    'provider': 'openai',
    'config': {
        'model': 'gpt-4o-mini',
        'api_key': 'xxx',
        'base_url': 'https://custom.api.com'  # ❌ 不支持！
    }
}
```

### 正确的理解（现在）

```python
# ✅ 正确：LLM和Embedder都只能通过环境变量设置endpoint
os.environ['OPENAI_BASE_URL'] = 'https://custom.api.com'

llm_config = {
    'provider': 'openai',
    'config': {
        'model': 'gpt-4o-mini',
        'api_key': 'xxx'
        # 不包含base_url
    }
}

embedder_config = {
    'provider': 'openai',
    'config': {
        'model': 'text-embedding-3-small',
        'api_key': 'xxx'
        # 不包含base_url
    }
}
```

## Mem0的设计

### 统一的endpoint设置

Mem0使用**统一的环境变量**来设置OpenAI-compatible endpoint：

```bash
# 这个环境变量同时影响LLM和Embedder
export OPENAI_BASE_URL=https://custom.api.com
```

### 为什么这样设计？

1. **简化配置**：一个环境变量控制所有OpenAI-compatible服务
2. **安全性**：endpoint通常是部署时配置，不应该硬编码在代码中
3. **一致性**：LLM和Embedder使用相同的endpoint（通常是同一个服务提供商）

### 如何使用不同的endpoint？

如果需要LLM和Embedder使用不同的endpoint，有两个选择：

#### 方案1：使用不同的provider

```yaml
llm:
  provider: openai  # 使用OpenAI
  config:
    model: gpt-4o-mini
    api_key: sk-openai-key

embedder:
  provider: huggingface  # 使用HuggingFace
  config:
    model: sentence-transformers/all-MiniLM-L6-v2
```

#### 方案2：修改Mem0源码（不推荐）

修改Mem0的LLM和Embedder类，添加base_url支持。但这会导致维护困难。

## 修复后的mem0_bridge.py

```python
# LLM config
if 'llm' in config:
    llm_config = config['llm']
    llm_provider_config = llm_config.get('config', {}).copy()

    llm_base_url = os.environ.get('LLM_BASE_URL') or os.environ.get('OPENAI_BASE_URL')
    llm_api_key = os.environ.get('LLM_API_KEY') or os.environ.get('OPENAI_API_KEY')

    # ✅ 只记录日志，不添加到config
    if llm_base_url:
        logger.info(f"Using LLM endpoint from env: {llm_base_url}")

    if llm_api_key:
        llm_provider_config['api_key'] = llm_api_key

    mem0_config['llm'] = {
        'provider': llm_config.get('provider', 'openai'),
        'config': llm_provider_config  # ✅ 不包含base_url
    }

# Embedder config
if 'embedder' in config:
    embedder_config = config['embedder']
    embedder_provider_config = embedder_config.get('config', {}).copy()

    embedder_base_url = os.environ.get('EMBEDDER_BASE_URL') or os.environ.get('OPENAI_BASE_URL')
    embedder_api_key = os.environ.get('EMBEDDER_API_KEY') or os.environ.get('OPENAI_API_KEY')

    # ✅ 只记录日志，不添加到config
    if embedder_base_url:
        logger.info(f"Using embedder endpoint from env: {embedder_base_url}")

    if embedder_api_key:
        embedder_provider_config['api_key'] = embedder_api_key

    mem0_config['embedder'] = {
        'provider': embedder_config.get('provider', 'openai'),
        'config': embedder_provider_config  # ✅ 不包含base_url
    }
```

## 环境变量优先级

```bash
# 1. 专用环境变量（最高优先级）
export LLM_BASE_URL=https://llm.custom.com
export EMBEDDER_BASE_URL=https://embedder.custom.com

# 2. 共享环境变量（中等优先级）
export OPENAI_BASE_URL=https://shared.custom.com

# 3. Mem0默认值（最低优先级）
# https://api.openai.com/v1
```

**实际行为**：
- 如果设置了`LLM_BASE_URL`，LLM使用它
- 否则，LLM使用`OPENAI_BASE_URL`
- 如果都没设置，LLM使用默认的OpenAI endpoint

## 配置示例

### 场景1：使用相同的自定义endpoint

```bash
# .env
export OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4/
export OPENAI_API_KEY=your-api-key
```

**效果**：
- LLM使用：`https://open.bigmodel.cn/api/paas/v4/`
- Embedder使用：`https://open.bigmodel.cn/api/paas/v4/`

### 场景2：LLM和Embedder使用不同endpoint（不支持）

```bash
# ❌ 这样配置无效！
export LLM_BASE_URL=https://llm.custom.com
export EMBEDDER_BASE_URL=https://embedder.custom.com
```

**实际效果**：
- 两个环境变量都会被读取
- 但Mem0内部只使用`OPENAI_BASE_URL`
- `LLM_BASE_URL`和`EMBEDDER_BASE_URL`会被忽略

**解决方案**：
使用不同的provider，或者接受使用相同的endpoint。

## 验证

### 测试1：检查日志

```bash
npm start
```

**期望日志**：
```
[INFO] [mem0_bridge] Using LLM endpoint from env: https://open.bigmodel.cn/api/paas/v4/
[INFO] [mem0_bridge] Using embedder endpoint from env: https://open.bigmodel.cn/api/paas/v4/
[INFO] [mem0_bridge] Mem0 initialized successfully
```

**不应该看到**：
```
[ERROR] __init__() got an unexpected keyword argument 'base_url'
```

### 测试2：验证实际使用的endpoint

查看HTTP请求日志：

```
[INFO] [httpx] HTTP Request: POST https://open.bigmodel.cn/api/paas/v4/chat/completions
[INFO] [httpx] HTTP Request: POST https://open.bigmodel.cn/api/paas/v4/embeddings
```

## 总结

### 关键要点
1. ✅ **LLM和Embedder都不支持config中的base_url参数**
2. ✅ **必须通过OPENAI_BASE_URL环境变量设置endpoint**
3. ✅ **LLM和Embedder使用相同的endpoint**
4. ❌ **无法为LLM和Embedder配置不同的endpoint（使用相同provider时）**

### 配置清单
- [ ] 设置`OPENAI_BASE_URL`环境变量
- [ ] 设置`OPENAI_API_KEY`环境变量
- [ ] 确保`.env`文件被加载（dotenv.config()）
- [ ] **不要**在config中添加`base_url`参数
- [ ] 验证日志中显示正确的endpoint

### 相关文档
- [Mem0 Embedder配置修复](./mem0-embedder-config-fix.md)
- [独立endpoint配置指南](./separate-endpoints-guide.md)（注意：对于Mem0不适用）
- [Mem0最终修复](./mem0-final-fixes.md)
