# Mem0 组件调研报告

## 1. 项目概述

**Mem0** (Memory for AI Agents) 是一个为AI代理提供智能记忆层的开源系统，由Y Combinator S24孵化。

- **GitHub**: https://github.com/mem0ai/mem0
- **文档**: https://docs.mem0.ai
- **许可证**: Apache 2.0
- **语言**: Python (主要) + TypeScript SDK
- **安装**: `pip install mem0ai` 或 `npm install mem0ai`

### 核心优势（vs OpenAI Memory）

根据官方LOCOMO基准测试：
- **+26% 精度提升**
- **91% 更快响应**
- **90% 更少Token使用**

---

## 2. 核心架构

### 2.1 组件架构

```
┌─────────────────────────────────────────────────────────┐
│                    Mem0 Memory                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │     LLM      │  │   Embedder   │  │  Reranker    │ │
│  │  (提取记忆)   │  │  (向量化)     │  │  (重排序)     │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐                   │
│  │ Vector Store │  │ Graph Store  │                   │
│  │  (语义检索)   │  │  (关系检索)   │                   │
│  └──────────────┘  └──────────────┘                   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐ │
│  │         SQLite (History DB)                      │ │
│  │         存储记忆历史和元数据                        │ │
│  └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 2.2 核心类：Memory

```python
from mem0 import Memory

# 初始化
memory = Memory(config={
    "vector_store": {
        "provider": "qdrant",
        "config": {
            "host": "localhost",
            "port": 6333
        }
    },
    "llm": {
        "provider": "openai",
        "config": {
            "model": "gpt-4.1-nano-2025-04-14"
        }
    },
    "embedder": {
        "provider": "openai",
        "config": {
            "model": "text-embedding-3-small"
        }
    }
})
```

---

## 3. 核心功能

### 3.1 API接口

#### add() - 添加记忆

```python
def add(
    messages,                          # str 或 List[Dict]
    *,
    user_id: Optional[str] = None,     # 用户ID
    agent_id: Optional[str] = None,    # Agent ID
    run_id: Optional[str] = None,      # 运行ID
    metadata: Optional[Dict] = None,   # 元数据
    infer: bool = True,                # 是否推断记忆
    memory_type: Optional[str] = None, # 记忆类型
    prompt: Optional[str] = None       # 自定义提示
) -> Dict
```

**使用示例**：
```python
# 从对话中提取记忆
messages = [
    {"role": "user", "content": "我喜欢喝咖啡"},
    {"role": "assistant", "content": "好的，我记住了"}
]
memory.add(messages, user_id="user123")

# 直接添加记忆
memory.add("用户偏好使用Python", user_id="user123")
```

**返回值**：
```python
{
    "results": [
        {
            "id": "mem_abc123",
            "memory": "用户喜欢喝咖啡",
            "event": "ADD"  # ADD, UPDATE, DELETE, NOOP
        }
    ]
}
```

#### search() - 搜索记忆

```python
def search(
    query: str,                        # 查询文本
    *,
    user_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    run_id: Optional[str] = None,
    limit: int = 100,                  # 返回数量
    filters: Optional[Dict] = None,    # 过滤条件
    threshold: Optional[float] = None, # 相似度阈值
    rerank: bool = True                # 是否重排序
) -> Dict
```

**使用示例**：
```python
# 基本搜索
results = memory.search(
    query="用户喜欢什么饮料？",
    user_id="user123",
    limit=5
)

# 高级过滤
results = memory.search(
    query="最近的偏好",
    user_id="user123",
    filters={
        "created_at": {"gte": "2024-01-01"},
        "category": "preference"
    }
)
```

**返回值**：
```python
{
    "results": [
        {
            "id": "mem_abc123",
            "memory": "用户喜欢喝咖啡",
            "score": 0.95,
            "metadata": {
                "user_id": "user123",
                "created_at": "2024-02-18T10:00:00Z"
            }
        }
    ]
}
```

#### get_all() - 获取所有记忆

```python
def get_all(
    *,
    user_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    run_id: Optional[str] = None,
    limit: Optional[int] = None,
    filters: Optional[Dict] = None
) -> Dict
```

#### update() - 更新记忆

```python
def update(memory_id: str, data: str) -> Dict
```

#### delete() - 删除记忆

```python
def delete(memory_id: str) -> Dict
def delete_all(user_id=None, agent_id=None, run_id=None) -> Dict
```

### 3.2 高级过滤器

Mem0支持丰富的元数据过滤：

```python
filters = {
    # 精确匹配
    "category": "preference",

    # 比较操作
    "importance": {"gte": 0.8},
    "created_at": {"lt": "2024-02-01"},

    # 列表操作
    "tags": {"in": ["coffee", "tea"]},

    # 文本搜索
    "content": {"contains": "喜欢"},
    "content": {"icontains": "COFFEE"},  # 不区分大小写

    # 逻辑操作
    "AND": [
        {"category": "preference"},
        {"importance": {"gte": 0.8}}
    ],
    "OR": [
        {"tags": {"in": ["coffee"]}},
        {"tags": {"in": ["tea"]}}
    ],
    "NOT": [{"category": "temporary"}]
}
```

### 3.3 多层级记忆

Mem0支持三种记忆层级：

```python
# 1. User Memory（用户记忆）
memory.add(messages, user_id="user123")
memory.search(query, user_id="user123")

# 2. Agent Memory（Agent记忆）
memory.add(messages, agent_id="agent456")
memory.search(query, agent_id="agent456")

# 3. Run Memory（运行记忆/会话记忆）
memory.add(messages, run_id="run789")
memory.search(query, run_id="run789")

# 组合使用
memory.add(messages, user_id="user123", agent_id="agent456")
```

---

## 4. 支持的后端

### 4.1 向量数据库

Mem0支持多种向量存储：

| 提供商 | 配置示例 | 特点 |
|--------|---------|------|
| **Qdrant** | `{"provider": "qdrant", "config": {"host": "localhost", "port": 6333}}` | 高性能，支持过滤 |
| **Chroma** | `{"provider": "chroma", "config": {"path": "./chroma_db"}}` | 轻量级，易部署 |
| **Pinecone** | `{"provider": "pinecone", "config": {"api_key": "...", "index_name": "..."}}` | 云服务，可扩展 |
| **Weaviate** | `{"provider": "weaviate", "config": {"url": "http://localhost:8080"}}` | 支持多模态 |
| **FAISS** | `{"provider": "faiss", "config": {"path": "./faiss_index"}}` | 本地，高速 |
| **Milvus** | `{"provider": "milvus", "config": {"host": "localhost", "port": 19530}}` | 企业级 |

### 4.2 图数据库（可选）

用于存储实体关系：

| 提供商 | 配置示例 |
|--------|---------|
| **Neo4j** | `{"provider": "neo4j", "config": {"url": "bolt://localhost:7687", "username": "neo4j", "password": "..."}}` |
| **Kuzu** | `{"provider": "kuzu", "config": {"path": "./kuzu_db"}}` |
| **Memgraph** | `{"provider": "memgraph", "config": {"host": "localhost", "port": 7687}}` |

### 4.3 LLM支持

| 提供商 | 模型示例 |
|--------|---------|
| **OpenAI** | gpt-4.1-nano, gpt-4o, gpt-3.5-turbo |
| **Anthropic** | claude-3-opus, claude-3-sonnet |
| **Google** | gemini-pro, gemini-1.5-pro |
| **Ollama** | llama3, mistral, codellama |
| **Azure OpenAI** | 自定义部署 |

### 4.4 Embedder支持

| 提供商 | 模型示例 |
|--------|---------|
| **OpenAI** | text-embedding-3-small, text-embedding-3-large |
| **HuggingFace** | sentence-transformers/all-MiniLM-L6-v2 |
| **Ollama** | nomic-embed-text |
| **Azure OpenAI** | 自定义部署 |

---

## 5. 记忆提取机制

### 5.1 自动记忆提取

Mem0使用LLM从对话中自动提取结构化记忆：

```python
# 输入对话
messages = [
    {"role": "user", "content": "我叫张三，今年30岁，住在北京"},
    {"role": "assistant", "content": "很高兴认识你，张三"}
]

# Mem0自动提取
memory.add(messages, user_id="user123")

# 提取的记忆：
# - "用户名字是张三"
# - "用户年龄是30岁"
# - "用户住在北京"
```

### 5.2 记忆去重与更新

Mem0会自动检测重复记忆并更新：

```python
# 第一次添加
memory.add("用户喜欢喝咖啡", user_id="user123")
# 结果：ADD

# 第二次添加相似内容
memory.add("用户喜欢喝拿铁咖啡", user_id="user123")
# 结果：UPDATE（更新为"用户喜欢喝拿铁咖啡"）

# 第三次添加矛盾内容
memory.add("用户不喜欢咖啡", user_id="user123")
# 结果：DELETE旧记忆，ADD新记忆
```

### 5.3 自定义提取提示

```python
custom_prompt = """
从对话中提取以下信息：
1. 用户偏好
2. 技术栈
3. 项目需求
格式：JSON
"""

memory.add(
    messages,
    user_id="user123",
    prompt=custom_prompt
)
```

---

## 6. 与Colony的集成方案

### 6.1 架构集成

```
┌─────────────────────────────────────────────────────────┐
│                  Colony System                          │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │         ShortTermMemory                          │  │
│  │  - 滑动窗口（最近50条消息）                        │  │
│  │  - 自动压缩                                        │  │
│  └──────────────────────────────────────────────────┘  │
│                      │                                  │
│                      ▼                                  │
│  ┌──────────────────────────────────────────────────┐  │
│  │      Mem0LongTermMemory (新增)                   │  │
│  │  - 封装Mem0 API                                   │  │
│  │  - 实现LongTermMemory接口                         │  │
│  └──────────────────────────────────────────────────┘  │
│                      │                                  │
│                      ▼                                  │
└──────────────────────┼──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                  Mem0 Service                           │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Qdrant     │  │   OpenAI     │  │   Neo4j      │ │
│  │ (向量存储)    │  │   (LLM)      │  │  (图存储)     │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 6.2 实现LongTermMemory接口

```typescript
// src/memory/Mem0LongTermMemory.ts
import { LongTermMemory, MemoryContent } from './types.js';

export class Mem0LongTermMemory implements LongTermMemory {
    private pythonProcess: ChildProcess;

    constructor(config: Mem0Config) {
        // 启动Python进程运行Mem0
        this.pythonProcess = spawn('python', [
            '-m', 'mem0_bridge',
            '--config', JSON.stringify(config)
        ]);
    }

    async retain(content: MemoryContent): Promise<string> {
        // 调用Mem0的add方法
        const result = await this.callMem0('add', {
            messages: content.content,
            user_id: content.metadata?.agentId,
            metadata: {
                roomId: content.metadata?.roomId,
                type: content.metadata?.type,
                importance: content.metadata?.importance,
                timestamp: content.timestamp.toISOString()
            }
        });

        return result.results[0].id;
    }

    async recall(query: string, limit?: number): Promise<MemoryContent[]> {
        // 调用Mem0的search方法
        const result = await this.callMem0('search', {
            query,
            limit: limit || 5,
            rerank: true
        });

        return result.results.map(r => ({
            id: r.id,
            content: r.memory,
            metadata: r.metadata,
            timestamp: new Date(r.metadata.timestamp)
        }));
    }

    async reflect(topic: string): Promise<string> {
        // 1. 检索相关记忆
        const memories = await this.recall(topic, 20);

        // 2. 使用LLM生成反思
        const prompt = `基于以下记忆，总结关于"${topic}"的关键要点：\n${
            memories.map(m => `- ${m.content}`).join('\n')
        }`;

        // 调用OpenAI生成总结
        const reflection = await this.generateReflection(prompt);

        return reflection;
    }
}
```

### 6.3 配置示例

```yaml
# config/memory.yaml
memory:
  short_term:
    window_size: 50
    max_tokens: 4000
    compression_threshold: 0.8

  long_term:
    provider: mem0
    config:
      vector_store:
        provider: qdrant
        config:
          host: localhost
          port: 6333
          collection_name: colony_memories

      llm:
        provider: openai
        config:
          model: gpt-4.1-nano-2025-04-14
          api_key: ${OPENAI_API_KEY}

      embedder:
        provider: openai
        config:
          model: text-embedding-3-small
          api_key: ${OPENAI_API_KEY}

      graph_store:
        provider: neo4j
        config:
          url: bolt://localhost:7687
          username: neo4j
          password: ${NEO4J_PASSWORD}
```

### 6.4 使用场景映射

| Colony场景 | Mem0功能 | 实现方式 |
|-----------|---------|---------|
| Agent记忆隔离 | `agent_id` | `memory.add(messages, agent_id="agent1")` |
| 用户记忆 | `user_id` | `memory.add(messages, user_id="user1")` |
| 会话记忆 | `run_id` | `memory.add(messages, run_id="room1")` |
| 决策溯源 | Graph Store | 启用Neo4j存储实体关系 |
| 语义检索 | Vector Search | 自动使用向量相似度搜索 |
| 重要性过滤 | Metadata Filters | `filters={"importance": {"gte": 0.8}}` |

---

## 7. Mem0 vs Hindsight对比

| 特性 | Mem0 | Hindsight |
|------|------|-----------|
| **开源** | ✅ Apache 2.0 | ✅ MIT |
| **语言** | Python + TypeScript | Python |
| **向量数据库** | 7+ (Qdrant, Chroma, Pinecone等) | 需自行集成 |
| **图数据库** | ✅ Neo4j, Kuzu, Memgraph | ❌ |
| **自动记忆提取** | ✅ LLM驱动 | ❌ 需手动 |
| **记忆去重** | ✅ 自动 | ❌ |
| **多层级记忆** | ✅ User/Agent/Run | ❌ |
| **重排序** | ✅ 内置Reranker | ❌ |
| **托管服务** | ✅ app.mem0.ai | ❌ |
| **性能** | 91%更快 | - |
| **Token效率** | 90%更少 | - |
| **社区活跃度** | ⭐ 高（YC支持） | ⭐ 中 |
| **文档质量** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **集成难度** | ⭐ 简单 | ⭐⭐⭐ 复杂 |

### 推荐：使用Mem0

**理由**：
1. **开箱即用**：无需复杂配置，`pip install mem0ai`即可
2. **功能完整**：自动记忆提取、去重、多层级支持
3. **性能优异**：经过LOCOMO基准测试验证
4. **生态丰富**：支持7+向量数据库，3+图数据库
5. **持续维护**：YC支持，社区活跃
6. **文档完善**：详细的API文档和示例

---

## 8. 部署方案

### 8.1 本地开发环境

```bash
# 1. 安装Mem0
pip install mem0ai

# 2. 启动Qdrant（Docker）
docker run -p 6333:6333 qdrant/qdrant

# 3. 配置环境变量
export OPENAI_API_KEY="sk-..."

# 4. 测试
python -c "from mem0 import Memory; m = Memory(); print('OK')"
```

### 8.2 生产环境（Docker Compose）

```yaml
# docker-compose.yml
version: '3.8'

services:
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage

  neo4j:
    image: neo4j:latest
    ports:
      - "7474:7474"
      - "7687:7687"
    environment:
      NEO4J_AUTH: neo4j/password
    volumes:
      - neo4j_data:/data

  colony:
    build: .
    ports:
      - "3000:3000"
    environment:
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      QDRANT_HOST: qdrant
      NEO4J_URI: bolt://neo4j:7687
    depends_on:
      - qdrant
      - neo4j

volumes:
  qdrant_data:
  neo4j_data:
```

### 8.3 托管服务（可选）

使用Mem0 Platform（app.mem0.ai）：
- 无需自建基础设施
- 自动扩展
- 企业级安全（SOC 2 Type II, GDPR）
- 分析仪表板

---

## 9. 迁移路径

### Phase 1: 基础集成（1周）
- [ ] 安装Mem0和依赖
- [ ] 实现Mem0LongTermMemory类
- [ ] 编写单元测试
- [ ] 更新配置文件

### Phase 2: 功能对接（1周）
- [ ] 集成到ContextAssembler
- [ ] 实现retain/recall/reflect
- [ ] 添加Agent/Room级别记忆
- [ ] 测试端到端流程

### Phase 3: 优化与监控（1周）
- [ ] 性能调优
- [ ] 添加监控指标
- [ ] 编写文档
- [ ] 生产环境部署

---

## 10. 成本估算

### 自托管成本

| 组件 | 配置 | 月成本（AWS） |
|------|------|--------------|
| Qdrant | t3.medium (2vCPU, 4GB) | ~$30 |
| Neo4j | t3.small (2vCPU, 2GB) | ~$15 |
| OpenAI API | ~1M tokens/月 | ~$2 |
| **总计** | | **~$47/月** |

### 托管服务成本

Mem0 Platform定价（预估）：
- Free: 1000次API调用/月
- Pro: $49/月，10万次调用
- Enterprise: 定制

---

## 11. 风险与限制

### 风险
1. **依赖Python**：Colony是TypeScript项目，需要跨语言调用
2. **LLM成本**：记忆提取需要调用LLM
3. **延迟**：向量检索 + LLM推理可能增加延迟

### 缓解措施
1. 使用Python子进程或HTTP API桥接
2. 使用更便宜的模型（gpt-4.1-nano）
3. 启用缓存和批处理

### 限制
1. 需要外部服务（Qdrant, OpenAI）
2. 记忆提取质量依赖LLM
3. 向量数据库需要额外存储

---

## 12. 结论

**推荐使用Mem0作为Colony的长期记忆后端**。

**核心优势**：
- ✅ 功能完整，开箱即用
- ✅ 性能优异，经过验证
- ✅ 生态丰富，易于扩展
- ✅ 文档完善，社区活跃
- ✅ 持续维护，有商业支持

**下一步**：
1. 实现Mem0LongTermMemory类
2. 编写集成测试
3. 更新文档
4. 部署到开发环境

---

## 参考资料

- Mem0 GitHub: https://github.com/mem0ai/mem0
- Mem0 文档: https://docs.mem0.ai
- Mem0 论文: https://mem0.ai/research
- LOCOMO基准测试: https://mem0.ai/research
