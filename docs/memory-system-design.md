# Colony Memory System Design

## Overview

Colony的记忆系统采用四层架构，从底层的索引到顶层的调度，为多Agent协作提供智能的上下文管理。

**重要说明**：Layer 1（上下文索引）由底层 CLI 工具（如 claude-code、codex）提供，Colony 的 Layer 2-4 是在这些工具能力之上构建的协作层。

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Layer 4: Context Scheduler (上下文调度)                 │
│  - Multi-agent memory sharing/isolation                 │
│  - Cross-session state transfer                         │
│  - Memory lifecycle management                          │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Layer 3: Context Assembler (上下文组装)                 │
│  - System prompt construction                           │
│  - Dynamic skill injection                              │
│  - Token budget management                              │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Layer 2: Memory Retrieval (上下文检索)                  │
│  - Short-term memory (conversation window)              │
│  - Long-term memory (Hindsight RAG)                     │
│  - Context lineage tracking                             │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Layer 1: Context Indexing (上下文索引)                  │
│  - Semantic embedding (vector store)                    │
│  - Code parsing & analysis                              │
│  - Knowledge graph construction                         │
└─────────────────────────────────────────────────────────┘
```

## Layer 1: Context Indexing (上下文索引)

### ⚠️ 实现说明

**Layer 1 由底层 CLI 工具提供**（如 claude-code、codex 等），Colony 不需要重复实现。

这些 AI 编程助手内部已经实现了：
- **语义理解**：通过 LLM 本身的能力理解代码语义
- **代码解析**：内置 AST 解析器、符号索引、代码跳转
- **上下文检索**：智能文件搜索、依赖分析、知识图谱

**设计理念**：
- Colony 专注于**多 Agent 协作层**（Layer 2-4）
- 底层代码理解能力由成熟的 CLI 工具提供
- 避免重复造轮子，充分利用现有工具生态

### Purpose
为记忆内容建立索引，支持高效的语义检索和关系查询。（由底层 CLI 提供）

### Components

#### 1.1 Semantic Embedder
- 使用embedding模型（如OpenAI text-embedding-3-small）将文本转换为向量
- 支持批量嵌入以提高效率
- 缓存常用嵌入结果

#### 1.2 Code Parser
- 解析代码文件，提取函数、类、变量等结构信息
- 支持多种语言（TypeScript, Python, Go等）
- 生成代码摘要和依赖关系

#### 1.3 Knowledge Graph
- 存储实体间的关系（Agent-Task, Task-File, File-Function等）
- 支持图查询（如"找到所有与X相关的任务"）
- 用于追踪上下文血缘（Context Lineage）

### Implementation
```typescript
interface ContextIndex {
  // 语义嵌入
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;

  // 代码解析
  parseCode(filePath: string, language: string): Promise<CodeStructure>;

  // 知识图谱
  addEntity(entity: Entity): Promise<void>;
  addRelation(from: string, to: string, type: RelationType): Promise<void>;
  query(pattern: GraphPattern): Promise<Entity[]>;
}
```

## Layer 2: Memory Retrieval (上下文检索)

### Purpose
根据当前上下文检索相关的历史记忆，包括短期对话和长期知识。

### Components

#### 2.1 Short-Term Memory
管理当前会话的对话窗口。

**Features:**
- 滑动窗口：保留最近N条消息
- 摘要压缩：当超过token限制时，压缩旧消息为摘要
- 重要性标记：标记关键消息（如任务分配、决策点）并优先保留

**Storage:**
- 内存中存储（Map<roomId, Message[]>）
- 可选持久化到文件系统

**Token Management:**
- 监控当前窗口的token使用
- 当接近限制时触发压缩
- 保留最近的原始消息 + 旧消息的摘要

#### 2.2 Long-Term Memory (Hindsight)
使用Hindsight作为长期记忆系统，支持语义检索。

**Operations:**
- **Retain**: 存储重要对话、决策、代码片段到向量数据库
- **Recall**: 根据当前查询检索相关历史记忆
- **Reflect**: 定期总结和提炼知识（如"我们在X项目中学到了什么"）

**Hindsight Integration:**
- Docker部署Hindsight服务
- 通过HTTP API调用retain/recall/reflect
- 配置向量数据库（Qdrant/Milvus）和嵌入模型

#### 2.3 Context Lineage
追踪上下文的来源和演化。

**Use Cases:**
- "这个决策是基于哪次对话做出的？"
- "这段代码是谁写的，为什么这样设计？"
- 跨会话追踪任务进展

**Implementation:**
- 为每条消息生成唯一ID
- 记录消息间的引用关系（reply-to, based-on）
- 在知识图谱中存储血缘关系

### Implementation
```typescript
interface ShortTermMemory {
  add(roomId: string, message: Message): void;
  get(roomId: string, limit?: number): Message[];
  compress(roomId: string): Promise<void>;
  markImportant(messageId: string): void;
}

interface LongTermMemory {
  retain(content: MemoryContent): Promise<string>; // returns memory ID
  recall(query: string, limit?: number): Promise<MemoryContent[]>;
  reflect(topic: string): Promise<string>; // returns reflection summary
}

interface ContextLineage {
  track(messageId: string, parentId?: string): void;
  getAncestors(messageId: string): Message[];
  getDescendants(messageId: string): Message[];
}
```

## Layer 3: Context Assembler (上下文组装)

### Purpose
将各层的上下文信息组装成完整的System Prompt，供LLM使用。

### Components

#### 3.1 Prompt Builder
构建结构化的System Prompt。

**Sections:**
1. Agent Identity（身份）
2. Personality & Rules（个性和规则）
3. Available Skills（可用技能）
4. Short-Term Context（短期上下文：最近对话）
5. Long-Term Context（长期上下文：相关历史）
6. Current Task（当前任务）

#### 3.2 Skill Injector
动态注入Agent可用的技能定义。

**Features:**
- 根据Agent配置加载技能
- 生成技能的使用说明和示例
- 支持技能的条件注入（如"只在开发阶段注入write-file"）

#### 3.3 Token Budget Manager
管理prompt的token预算，确保不超过模型限制。

**Strategy:**
1. 计算固定部分的token（identity, skills）
2. 为短期上下文分配预算（如50%）
3. 为长期上下文分配预算（如30%）
4. 保留余量（如20%）用于用户消息和输出

**Compression:**
- 当超过预算时，优先压缩长期上下文
- 保留最近的短期消息
- 使用摘要替代完整历史

### Implementation
```typescript
interface ContextAssembler {
  assemble(options: AssembleOptions): Promise<string>;
}

interface AssembleOptions {
  agentId: string;
  roomId: string;
  currentMessage: Message;
  tokenBudget: number;
  includeHistory?: boolean;
  includeLongTerm?: boolean;
}

interface TokenBudget {
  total: number;
  fixed: number;        // identity + skills
  shortTerm: number;    // recent messages
  longTerm: number;     // historical context
  reserved: number;     // for output
}
```

## Layer 4: Context Scheduler (上下文调度)

### Purpose
管理多Agent间的记忆共享和隔离，以及跨会话的状态传递。

### Components

#### 4.1 Memory Sharing Policy
定义Agent间的记忆共享策略。

**Modes:**
- **Isolated**: 每个Agent有独立的记忆（默认）
- **Shared**: 同一房间的Agent共享短期记忆
- **Selective**: 根据规则选择性共享（如"开发者可以看到架构师的决策"）

**Configuration:**
```yaml
memory_sharing:
  mode: selective
  rules:
    - from: architect
      to: [developer, qa]
      scope: decisions
    - from: developer
      to: [qa]
      scope: code_changes
```

#### 4.2 Cross-Session Transfer
支持跨会话的状态传递。

**Use Cases:**
- 用户创建新会话继续之前的任务
- Agent从一个房间移动到另一个房间
- 任务从一个阶段进入下一个阶段

**Implementation:**
- 导出会话摘要（summary + key decisions）
- 在新会话中注入摘要作为初始上下文
- 保留任务ID和血缘关系

#### 4.3 Memory Lifecycle
管理记忆的生命周期。

**Stages:**
1. **Active**: 当前会话的活跃记忆
2. **Archived**: 会话结束后归档
3. **Indexed**: 提取关键信息到长期记忆
4. **Expired**: 超过保留期限后删除

**Policies:**
- 短期记忆：保留7天
- 长期记忆：永久保留（或根据重要性评分）
- 定期清理过期记忆

### Implementation
```typescript
interface ContextScheduler {
  // Memory sharing
  setPolicy(roomId: string, policy: SharingPolicy): void;
  getSharedMemory(agentId: string, roomId: string): Message[];

  // Cross-session transfer
  exportSession(roomId: string): Promise<SessionSnapshot>;
  importSession(snapshot: SessionSnapshot, newRoomId: string): Promise<void>;

  // Lifecycle management
  archiveSession(roomId: string): Promise<void>;
  indexToLongTerm(roomId: string): Promise<void>;
  cleanup(olderThan: Date): Promise<void>;
}

interface SharingPolicy {
  mode: 'isolated' | 'shared' | 'selective';
  rules?: SharingRule[];
}

interface SessionSnapshot {
  roomId: string;
  summary: string;
  keyDecisions: Message[];
  participants: Participant[];
  createdAt: Date;
}
```

## Integration with Existing System

### Changes to Agent.ts
```typescript
class Agent {
  private contextAssembler: ContextAssembler;
  private shortTermMemory: ShortTermMemory;

  private async handleMessage(message: Message): Promise<void> {
    // 1. Add to short-term memory
    this.shortTermMemory.add(message.roomId, message);

    // 2. Assemble context (includes short-term + long-term)
    const prompt = await this.contextAssembler.assemble({
      agentId: this.id,
      roomId: message.roomId,
      currentMessage: message,
      tokenBudget: 8000, // Claude's context window
    });

    // 3. Invoke LLM with assembled prompt
    const result = await this.modelRouter.invoke(
      this.config.model.primary,
      prompt,
      { ... }
    );

    // 4. Store important results to long-term memory
    if (this.isImportant(result)) {
      await this.longTermMemory.retain({
        content: result.text,
        context: message,
        timestamp: new Date(),
      });
    }
  }
}
```

### Changes to ChatRoom.ts
```typescript
class ChatRoom {
  private contextScheduler: ContextScheduler;

  constructor(...) {
    // Set memory sharing policy for this room
    this.contextScheduler.setPolicy(this.id, {
      mode: 'shared', // All agents in this room share short-term memory
    });
  }

  async archive(): Promise<void> {
    // Archive session when room is closed
    await this.contextScheduler.archiveSession(this.id);
    await this.contextScheduler.indexToLongTerm(this.id);
  }
}
```

## Implementation Plan

### Phase 4.1: Short-Term Memory (Week 1)
- [ ] Implement `ShortTermMemory` class
- [ ] Add sliding window and compression
- [ ] Integrate with `Agent`

### Phase 4.2: Long-Term Memory (Week 2)
- [ ] Research and deploy Hindsight (Docker)
- [ ] Implement `LongTermMemory` wrapper
- [ ] Test retain/recall/reflect operations

### Phase 4.3: Context Assembly (Week 3)
- [ ] Implement `ContextAssembler`
- [ ] Add token budget management
- [ ] Refactor `Agent.buildPrompt()` to use assembler

### Phase 4.4: Context Scheduling (Week 4)
- [ ] Implement `ContextScheduler`
- [ ] Add memory sharing policies
- [ ] Add cross-session transfer
- [ ] Add lifecycle management

### Phase 4.5: Context Indexing (Future)
- [ ] Implement semantic embedder
- [ ] Add code parser
- [ ] Build knowledge graph

## Configuration

### memory.yaml
```yaml
memory:
  short_term:
    window_size: 50  # messages
    max_tokens: 4000
    compression_threshold: 0.8  # compress when 80% full

  long_term:
    provider: hindsight
    endpoint: http://localhost:8080
    embedding_model: text-embedding-3-small
    vector_db: qdrant

  scheduling:
    default_policy: shared
    archive_after_days: 7
    cleanup_after_days: 30
```

## Metrics & Monitoring

Track the following metrics:
- Short-term memory size (messages, tokens)
- Long-term memory size (entries, vectors)
- Compression ratio
- Retrieval latency
- Token budget utilization

## Future Enhancements

1. **Adaptive Compression**: Use LLM to generate better summaries
2. **Importance Scoring**: ML model to predict message importance
3. **Multi-Modal Memory**: Support images, code, diagrams
4. **Federated Memory**: Share memory across Colony instances
5. **Memory Visualization**: UI to explore memory graph
