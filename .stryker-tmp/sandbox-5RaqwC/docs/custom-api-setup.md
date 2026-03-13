# 使用自定义API端点的说明

## 当前配置

你已经配置了自定义的OpenAI兼容API端点：
- **端点**: `https://cursor.scihub.edu.kg/openai`
- **API密钥**: `cr_cd809c5e7b112aa5d8140d1c220be8801ff4cf3d5050d12bd9bfe9f35cd7c4ce`

## 配置方式

Mem0使用环境变量来配置自定义端点，而不是在YAML配置文件中直接指定`base_url`。

### 方法1: 使用.env文件（推荐）

```bash
# 1. 加载环境变量
source .env

# 2. 运行Colony
npm start
```

### 方法2: 手动设置环境变量

```bash
# 设置环境变量
export OPENAI_BASE_URL=https://cursor.scihub.edu.kg/openai
export OPENAI_API_KEY=cr_cd809c5e7b112aa5d8140d1c220be8801ff4cf3d5050d12bd9bfe9f35cd7c4ce

# 运行Colony
npm start
```

### 方法3: 在启动命令中设置

```bash
OPENAI_BASE_URL=https://cursor.scihub.edu.kg/openai \
OPENAI_API_KEY=cr_cd809c5e7b112aa5d8140d1c220be8801ff4cf3d5050d12bd9bfe9f35cd7c4ce \
npm start
```

## 验证配置

### 测试API端点是否可用

```bash
# 测试端点连接
curl -X POST https://cursor.scihub.edu.kg/openai/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer cr_cd809c5e7b112aa5d8140d1c220be8801ff4cf3d5050d12bd9bfe9f35cd7c4ce" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

如果返回401错误，说明：
1. API密钥不正确
2. 端点不支持该API密钥
3. 端点需要不同的认证方式

### 测试Mem0配置

```bash
# 加载环境变量
source .env

# 运行测试
python3 tests/test-custom-api.py
```

## 故障排除

### 问题1: 401 Authentication Error

**错误信息**:
```
openai.AuthenticationError: Error code: 401 - Incorrect API key provided
```

**解决方案**:
1. 检查API密钥是否正确
2. 确认端点是否支持该API密钥
3. 尝试直接用curl测试端点

### 问题2: 环境变量未生效

**检查环境变量**:
```bash
echo $OPENAI_BASE_URL
echo $OPENAI_API_KEY
```

如果为空，说明环境变量未设置。重新运行：
```bash
source .env
```

### 问题3: 端点不可达

**测试连接**:
```bash
curl -I https://cursor.scihub.edu.kg/openai/v1/models
```

如果超时或连接失败，检查：
1. 网络连接
2. 端点URL是否正确
3. 是否需要代理

## 配置文件说明

### config/mem0.yaml

```yaml
llm:
  provider: openai
  config:
    model: gpt-4o-mini
    api_key: cr_cd809c5e7b112aa5d8140d1c220be8801ff4cf3d5050d12bd9bfe9f35cd7c4ce
    # 注意：不要在这里设置base_url
    # 使用环境变量 OPENAI_BASE_URL 代替

embedder:
  provider: openai
  config:
    model: text-embedding-3-small
    api_key: cr_cd809c5e7b112aa5d8140d1c220be8801ff4cf3d5050d12bd9bfe9f35cd7c4ce
    embedding_dims: 1536
    # 注意：不要在这里设置base_url
    # 使用环境变量 OPENAI_BASE_URL 代替
```

### .env

```bash
# 自定义端点（必须）
export OPENAI_BASE_URL=https://cursor.scihub.edu.kg/openai

# API密钥（必须）
export OPENAI_API_KEY=cr_cd809c5e7b112aa5d8140d1c220be8801ff4cf3d5050d12bd9bfe9f35cd7c4ce
```

## 重要提示

1. **环境变量优先级最高**: Mem0会优先使用环境变量`OPENAI_BASE_URL`，而不是配置文件中的`base_url`

2. **两个环境变量都需要**:
   - `OPENAI_BASE_URL`: 自定义端点
   - `OPENAI_API_KEY`: API密钥

3. **不要在配置文件中设置base_url**: Mem0的配置结构不支持在YAML中直接设置`base_url`，必须使用环境变量

4. **验证API密钥**: 确保你的API密钥对该端点有效

## 下一步

1. 确认API密钥是否正确
2. 测试端点是否可用（用curl）
3. 如果端点和密钥都正确，运行：
   ```bash
   source .env
   npm start
   ```

## 参考

- Mem0文档: https://docs.mem0.ai
- OpenAI API兼容性: https://platform.openai.com/docs/api-reference
- Colony Mem0集成指南: `docs/mem0-integration-guide.md`
