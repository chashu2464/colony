# LLM和Embedder使用不同端点的配置指南

## 概述

Colony的Mem0集成支持为LLM和embedder配置不同的API端点和密钥。这在以下场景很有用：

1. **成本优化**: LLM使用付费API，embedder使用本地Ollama
2. **性能优化**: LLM使用云端高性能API，embedder使用本地快速模型
3. **供应商分离**: LLM使用OpenAI，embedder使用Cohere/HuggingFace
4. **配额管理**: 不同服务使用不同的API密钥以分散配额

## 配置方式

### 环境变量优先级

```bash
# 优先级从高到低：
# 1. 组件专用环境变量（最高优先级）
LLM_BASE_URL          # LLM专用端点
LLM_API_KEY           # LLM专用密钥
EMBEDDER_BASE_URL     # Embedder专用端点
EMBEDDER_API_KEY      # Embedder专用密钥

# 2. 共享环境变量（中等优先级）
OPENAI_BASE_URL       # LLM和embedder共享端点
OPENAI_API_KEY        # LLM和embedder共享密钥

# 3. YAML配置文件（最低优先级）
config/mem0.yaml      # 配置文件中的api_key和base_url
```

### 场景1: 使用相同端点（默认）

```bash
# .env
export OPENAI_BASE_URL=https://api.scihub.edu.kg
export OPENAI_API_KEY=sk-your-shared-key
```

两个组件都会使用相同的端点和密钥。

### 场景2: LLM和Embedder使用不同端点

```bash
# .env
# LLM使用云端API
export LLM_BASE_URL=https://api.openai.com/v1
export LLM_API_KEY=sk-your-openai-key

# Embedder使用本地Ollama
export EMBEDDER_BASE_URL=http://localhost:11434/v1
export EMBEDDER_API_KEY=ollama  # Ollama不需要真实密钥
```

### 场景3: 混合配置（部分独立）

```bash
# .env
# 共享端点
export OPENAI_BASE_URL=https://api.scihub.edu.kg

# 但使用不同的API密钥
export LLM_API_KEY=sk-llm-specific-key
export EMBEDDER_API_KEY=sk-embedder-specific-key
```

### 场景4: LLM独立，Embedder使用共享

```bash
# .env
# 共享配置（embedder会使用这个）
export OPENAI_BASE_URL=https://api.scihub.edu.kg
export OPENAI_API_KEY=sk-shared-key

# LLM使用独立配置（覆盖共享配置）
export LLM_BASE_URL=https://api.openai.com/v1
export LLM_API_KEY=sk-openai-key
```

## 实际应用示例

### 示例1: 成本优化配置

```bash
# LLM使用付费的GPT-4o-mini（高质量记忆提取）
export LLM_BASE_URL=https://api.openai.com/v1
export LLM_API_KEY=sk-your-openai-key

# Embedder使用免费的本地Ollama（快速向量化）
export EMBEDDER_BASE_URL=http://localhost:11434/v1
export EMBEDDER_API_KEY=ollama
```

对应的`config/mem0.yaml`:
```yaml
llm:
  provider: openai
  config:
    model: gpt-4o-mini
    # base_url和api_key从环境变量读取

embedder:
  provider: openai  # Ollama兼容OpenAI API
  config:
    model: nomic-embed-text
    embedding_dims: 768
    # base_url和api_key从环境变量读取
```

### 示例2: 多供应商配置

```bash
# LLM使用Groq（快速推理）
export LLM_BASE_URL=https://api.groq.com/openai/v1
export LLM_API_KEY=gsk_your_groq_key

# Embedder使用Together AI（高质量embedding）
export EMBEDDER_BASE_URL=https://api.together.xyz/v1
export EMBEDDER_API_KEY=your_together_key
```

对应的`config/mem0.yaml`:
```yaml
llm:
  provider: openai
  config:
    model: llama-3.1-70b-versatile

embedder:
  provider: openai
  config:
    model: togethercomputer/m2-bert-80M-8k-retrieval
    embedding_dims: 768
```

### 示例3: 开发vs生产环境

**开发环境** (`.env.development`):
```bash
# 全部使用本地Ollama
export OPENAI_BASE_URL=http://localhost:11434/v1
export OPENAI_API_KEY=ollama
```

**生产环境** (`.env.production`):
```bash
# LLM使用云端高性能API
export LLM_BASE_URL=https://api.openai.com/v1
export LLM_API_KEY=sk-prod-openai-key

# Embedder使用专用embedding服务
export EMBEDDER_BASE_URL=https://api.cohere.ai/v1
export EMBEDDER_API_KEY=your-cohere-key
```

## 验证配置

### 1. 检查环境变量

```bash
# 加载环境变量
source .env

# 验证设置
echo "LLM endpoint: $LLM_BASE_URL"
echo "LLM key: ${LLM_API_KEY:0:10}..."
echo "Embedder endpoint: $EMBEDDER_BASE_URL"
echo "Embedder key: ${EMBEDDER_API_KEY:0:10}..."
```

### 2. 运行测试

```bash
# 测试配置
python3 tests/test-custom-api.py
```

查看日志输出，确认使用了正确的端点：
```
INFO - Using LLM endpoint from env: https://api.openai.com/v1
INFO - Using embedder endpoint from env: http://localhost:11434/v1
```

### 3. 测试TypeScript集成

```bash
# 运行Colony测试
npm test -- src/tests/mem0-integration-test.ts
```

## 故障排除

### 问题1: 环境变量未生效

**症状**: 日志显示使用了错误的端点

**解决方案**:
```bash
# 确保正确加载环境变量
source .env

# 验证变量已设置
env | grep -E "(LLM|EMBEDDER|OPENAI)"

# 在同一shell会话中运行程序
npm start
```

### 问题2: API密钥错误

**症状**: 401 Authentication Error

**解决方案**:
1. 检查API密钥是否正确
2. 确认密钥对应的端点是否正确
3. 验证密钥是否有足够的配额

```bash
# 测试LLM端点
curl -X POST $LLM_BASE_URL/chat/completions \
  -H "Authorization: Bearer $LLM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"test"}]}'

# 测试Embedder端点
curl -X POST $EMBEDDER_BASE_URL/embeddings \
  -H "Authorization: Bearer $EMBEDDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"text-embedding-3-small","input":"test"}'
```

### 问题3: 模型不兼容

**症状**: Model not found 或 Invalid model

**解决方案**:
确保`config/mem0.yaml`中的模型名称与端点支持的模型匹配：

```bash
# 查询LLM端点支持的模型
curl $LLM_BASE_URL/models \
  -H "Authorization: Bearer $LLM_API_KEY"

# 查询Embedder端点支持的模型
curl $EMBEDDER_BASE_URL/models \
  -H "Authorization: Bearer $EMBEDDER_API_KEY"
```

## 性能对比

| 配置方案 | LLM延迟 | Embedder延迟 | 月成本估算 |
|---------|---------|-------------|-----------|
| 全部OpenAI | ~500ms | ~200ms | $50-100 |
| LLM: OpenAI<br>Embedder: Ollama | ~500ms | ~50ms | $30-60 |
| LLM: Groq<br>Embedder: Ollama | ~200ms | ~50ms | $10-20 |
| 全部Ollama | ~300ms | ~50ms | $0 (本地) |

## 推荐配置

### 个人开发
```bash
# 全部本地，零成本
export OPENAI_BASE_URL=http://localhost:11434/v1
export OPENAI_API_KEY=ollama
```

### 小团队
```bash
# LLM使用快速的Groq，embedder本地
export LLM_BASE_URL=https://api.groq.com/openai/v1
export LLM_API_KEY=gsk_your_key
export EMBEDDER_BASE_URL=http://localhost:11434/v1
export EMBEDDER_API_KEY=ollama
```

### 生产环境
```bash
# 全部使用可靠的云服务
export LLM_BASE_URL=https://api.openai.com/v1
export LLM_API_KEY=sk-your-key
export EMBEDDER_BASE_URL=https://api.openai.com/v1
export EMBEDDER_API_KEY=sk-your-key
```

## 参考

- [Mem0自定义API指南](./mem0-custom-api-guide.md)
- [Mem0集成指南](./mem0-integration-guide.md)
- [自定义API设置](./custom-api-setup.md)
