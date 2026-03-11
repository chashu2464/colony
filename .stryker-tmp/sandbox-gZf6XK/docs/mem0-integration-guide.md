# Mem0 Integration Guide

## Overview

Colony now integrates Mem0 as its long-term memory backend, providing:
- **Semantic search** across conversation history
- **Automatic memory extraction** from conversations
- **Intelligent deduplication** and updates
- **Multi-level memory** (User, Agent, Room)
- **Graph-based relationships** (optional)

## Prerequisites

### 1. Python 3.8+

```bash
python3 --version
```

### 2. Install Python Dependencies

```bash
pip install -r requirements-mem0.txt
```

### 3. Vector Database

Choose one of the following:

#### Option A: Qdrant (Recommended for Production)

```bash
# Using Docker
docker run -p 6333:6333 qdrant/qdrant

# Or install locally
# See: https://qdrant.tech/documentation/quick-start/
```

#### Option B: Chroma (Good for Development)

```bash
# Installed automatically with mem0ai
# No separate service needed
```

#### Option C: Other Vector Stores

See `config/mem0.yaml` for configuration examples for:
- Pinecone (cloud service)
- Weaviate (multi-modal)
- FAISS (local, high-speed)
- Milvus (enterprise-grade)

### 4. Graph Database (Optional)

For entity relationship tracking:

```bash
# Neo4j using Docker
docker run -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password \
  neo4j:latest
```

### 5. Environment Variables

Create a `.env` file:

```bash
# Required
OPENAI_API_KEY=sk-...

# Optional (if using Neo4j)
NEO4J_PASSWORD=password

# Optional (if using Cohere reranker)
COHERE_API_KEY=...
```

## Configuration

Edit `config/mem0.yaml`:

```yaml
vector_store:
  provider: qdrant  # or chroma, pinecone, etc.
  config:
    host: localhost
    port: 6333
    collection_name: colony_memories

llm:
  provider: openai
  config:
    model: gpt-4o-mini  # Cheaper model for memory extraction
    api_key: ${OPENAI_API_KEY}

embedder:
  provider: openai
  config:
    model: text-embedding-3-small
    api_key: ${OPENAI_API_KEY}
    embedding_dims: 1536

# Optional: Enable graph store for entity relationships
graph_store:
  provider: neo4j
  config:
    url: bolt://localhost:7687
    username: neo4j
    password: ${NEO4J_PASSWORD}
```

## Usage

### 1. Initialize Mem0 in Colony

```typescript
import { Mem0LongTermMemory } from './memory/Mem0LongTermMemory.js';

const mem0 = new Mem0LongTermMemory({
    vectorStore: {
        provider: 'qdrant',
        config: {
            host: 'localhost',
            port: 6333,
            collection_name: 'colony_memories'
        }
    },
    llm: {
        provider: 'openai',
        config: {
            model: 'gpt-4o-mini',
            api_key: process.env.OPENAI_API_KEY
        }
    },
    embedder: {
        provider: 'openai',
        config: {
            model: 'text-embedding-3-small',
            api_key: process.env.OPENAI_API_KEY,
            embedding_dims: 1536
        }
    }
});

await mem0.initialize();
```

### 2. Store Memories

```typescript
// Store a conversation memory
await mem0.retain({
    content: '用户喜欢喝咖啡，特别是拿铁',
    metadata: {
        type: 'conversation',
        importance: 0.8,
        tags: ['preference', 'coffee'],
        agentId: 'agent1',
        roomId: 'room1'
    },
    timestamp: new Date()
});

// Store a decision
await mem0.retain({
    content: '团队决定使用PostgreSQL作为数据库',
    metadata: {
        type: 'decision',
        importance: 1.0,
        tags: ['decision', 'database'],
        agentId: 'architect',
        roomId: 'room1'
    },
    timestamp: new Date()
});
```

### 3. Search Memories

```typescript
// Semantic search
const results = await mem0.recall('用户喜欢什么饮料？', 5);

results.forEach(memory => {
    console.log(memory.content);
    console.log('Importance:', memory.metadata?.importance);
});
```

### 4. Get All Memories for a Session

```typescript
const memories = await mem0.getAll({
    agentId: 'agent1',
    roomId: 'room1',
    limit: 100
});
```

### 5. Generate Reflections

```typescript
const reflection = await mem0.reflect('项目决策');
console.log(reflection);
```

### 6. Update and Delete

```typescript
// Update a memory
await mem0.update(memoryId, '用户喜欢喝冰拿铁');

// Delete a memory
await mem0.delete(memoryId);
```

## Testing

### Run Integration Tests

```bash
# Set environment variables
export OPENAI_API_KEY=sk-...

# Build and run tests
npm run build:server
node dist/tests/mem0-integration-test.js
```

Expected output:
```
=== Testing Mem0 Integration ===

1. Initializing Mem0...
✓ Mem0 initialized

2. Testing retain (add memories)...
✓ Memory 1 retained: mem_abc123
✓ Memory 2 retained: mem_def456
✓ Memory 3 retained: mem_ghi789

3. Testing recall (search memories)...
✓ Search "用户喜欢什么饮料？" returned 1 results:
  1. 用户喜欢喝咖啡，特别是拿铁 (importance: 0.8)

...

=== All Tests Passed ✓ ===
```

## Integration with Colony

### Update Colony.ts

```typescript
import { Mem0LongTermMemory } from './memory/index.js';

export class Colony {
    readonly longTermMemory: Mem0LongTermMemory;

    constructor(options: ColonyOptions = {}) {
        // ... existing initialization ...

        // Initialize Mem0
        this.longTermMemory = new Mem0LongTermMemory({
            vectorStore: {
                provider: 'qdrant',
                config: { host: 'localhost', port: 6333 }
            },
            llm: {
                provider: 'openai',
                config: {
                    model: 'gpt-4o-mini',
                    api_key: process.env.OPENAI_API_KEY
                }
            },
            embedder: {
                provider: 'openai',
                config: {
                    model: 'text-embedding-3-small',
                    api_key: process.env.OPENAI_API_KEY
                }
            }
        });

        // Initialize asynchronously
        this.longTermMemory.initialize().catch(err => {
            log.error('Failed to initialize Mem0:', err);
        });
    }
}
```

### Update ContextAssembler

```typescript
async assemble(options: AssembleOptions): Promise<string> {
    // ... existing code ...

    // Add long-term context if enabled
    if (options.includeLongTerm && this.longTermMemory) {
        const query = this.buildSemanticQuery(options.currentMessage);
        const relevantMemories = await this.longTermMemory.recall(query, 5);

        if (relevantMemories.length > 0) {
            sections.push({
                name: 'long_term',
                content: this.buildLongTermSection(relevantMemories),
                priority: 50,
                tokenCount: 0
            });
        }
    }

    // ... rest of assembly ...
}
```

## Performance Tuning

### 1. Choose the Right Vector Store

| Store | Use Case | Performance |
|-------|----------|-------------|
| Chroma | Development | Good |
| Qdrant | Production | Excellent |
| FAISS | Local, high-speed | Excellent |
| Pinecone | Cloud, scalable | Good |

### 2. Optimize LLM Costs

```yaml
llm:
  provider: openai
  config:
    model: gpt-4o-mini  # $0.15/1M input tokens (vs gpt-4: $30/1M)
```

### 3. Enable Caching

Mem0 automatically caches embeddings and search results.

### 4. Batch Operations

```typescript
// Store multiple memories at once
const memories = [memory1, memory2, memory3];
await Promise.all(memories.map(m => mem0.retain(m)));
```

## Monitoring

### Check Mem0 Status

```bash
# Check if Qdrant is running
curl http://localhost:6333/collections

# Check if Neo4j is running (if enabled)
curl http://localhost:7474
```

### View Logs

```bash
# Mem0 bridge logs (stderr)
tail -f /path/to/colony/logs/mem0-bridge.log
```

### Metrics to Track

- Memory count per agent/room
- Search latency
- LLM API costs
- Vector store size

## Troubleshooting

### Issue: "Mem0 bridge not initialized"

**Solution**: Ensure Python dependencies are installed:
```bash
pip install -r requirements-mem0.txt
```

### Issue: "Connection refused to Qdrant"

**Solution**: Start Qdrant:
```bash
docker run -p 6333:6333 qdrant/qdrant
```

### Issue: "OpenAI API key not found"

**Solution**: Set environment variable:
```bash
export OPENAI_API_KEY=sk-...
```

### Issue: High LLM costs

**Solution**: Use a cheaper model:
```yaml
llm:
  config:
    model: gpt-4o-mini  # or gpt-3.5-turbo
```

### Issue: Slow search performance

**Solutions**:
1. Enable reranker for better quality with fewer results
2. Use FAISS for local high-speed search
3. Reduce search limit

## Migration from Existing System

If you have existing memories in another format:

```typescript
// Export from old system
const oldMemories = await oldSystem.getAll();

// Import to Mem0
for (const old of oldMemories) {
    await mem0.retain({
        content: old.content,
        metadata: {
            type: 'conversation',
            importance: old.score || 0.5,
            agentId: old.agentId,
            roomId: old.roomId
        },
        timestamp: new Date(old.timestamp)
    });
}
```

## Next Steps

1. ✅ Install dependencies
2. ✅ Configure Mem0
3. ✅ Run integration tests
4. ✅ Update Colony to use Mem0
5. ⏭️ Deploy to production
6. ⏭️ Monitor performance
7. ⏭️ Optimize costs

## Resources

- Mem0 Documentation: https://docs.mem0.ai
- Mem0 GitHub: https://github.com/mem0ai/mem0
- Colony Mem0 Research: `docs/mem0-research.md`
- Configuration Examples: `config/mem0.yaml`
