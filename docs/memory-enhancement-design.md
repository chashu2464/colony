# Memory System Enhancement - Architectural Design

**Task ID**: 317c9ca3
**Version**: 1.0
**Date**: 2026-03-07
**Author**: Architect

## 1. Design Overview

This document provides the detailed architectural design for enhancing Colony's memory system with structured storage, improved retrieval, and intelligent classification.

## 2. System Architecture

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         Agent                                │
│  ┌────────────────────────────────────────────────────┐    │
│  │  handleMessage()                                    │    │
│  │    ↓                                                │    │
│  │  ContextAssembler.assemble()                        │    │
│  │    ├─ buildLongTermSection()                        │    │
│  │    │   └─ LongTermMemory.recall() ← Enhanced       │    │
│  │    └─ Build complete prompt                         │    │
│  │    ↓                                                │    │
│  │  LLM Invocation                                     │    │
│  │    ↓                                                │    │
│  │  storeToLongTermMemory()                            │    │
│  │    ├─ MemoryClassifier.classify() ← New            │    │
│  │    └─ LongTermMemory.retain() ← Enhanced           │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
         │                                    │
         ↓                                    ↓
┌──────────────────────┐          ┌──────────────────────┐
│  ContextAssembler    │          │  MemoryClassifier    │
│  - assemble()        │          │  - classify()        │
│  - buildLongTerm()   │          │  - scoreImportance() │
└──────────────────────┘          └──────────────────────┘
         │
         ↓
┌──────────────────────────────────────────────────────────┐
│              Mem0LongTermMemory                          │
│  - retain(content, metadata) ← Enhanced metadata        │
│  - recall(query, limit, filters) ← Enhanced filters     │
└──────────────────────────────────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────────────────────────┐
│              mem0_bridge.py (Python)                     │
│  - add(messages, metadata) ← Passthrough metadata       │
│  - search(query, filters) ← Passthrough filters         │
└──────────────────────────────────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────────────────────────┐
│              Mem0 Library + Vector DB                    │
└──────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

#### Storage Flow (Enhanced)
```
User Message → Agent.handleMessage()
              ↓
              LLM Response
              ↓
              MemoryClassifier.classify(message, response)
              ├─ Detect subtype (decision/task/question/discussion)
              └─ Score importance (1-5)
              ↓
              storeToLongTermMemory(message, response, classification)
              ├─ Build conversationContext
              ├─ Construct enhanced metadata
              │   ├─ subtype
              │   ├─ importance
              │   ├─ participants
              │   ├─ workflowStage (if in workflow)
              │   └─ tags
              └─ LongTermMemory.retain(content, metadata)
                  ↓
                  mem0_bridge.py → Mem0 Library
```

#### Retrieval Flow (Enhanced)
```
User Message → ContextAssembler.assemble()
              ↓
              buildLongTermSection(currentMessage, agentId, roomId)
              ├─ Get recent 3 messages from ShortTermMemory
              ├─ Clean messages (remove code blocks, tool outputs)
              ├─ Build contextQuery = cleaned messages + current
              ├─ Construct filters
              │   ├─ timeWindow: last 7 days
              │   ├─ importance: >= 3
              │   ├─ workflowStage: current stage (if in workflow)
              │   └─ agentId, roomId
              └─ LongTermMemory.recall(contextQuery, 5, filters)
                  ↓
                  mem0_bridge.py → Mem0 Library
                  ↓
                  Return top 5 relevant memories
```

## 3. Interface Definitions

### 3.1 Phase 1: Enhanced Metadata

**File**: `src/memory/types.ts`

```typescript
/**
 * Memory metadata with enhanced structure.
 */
export interface MemoryMetadata {
  /** Memory type */
  type: 'conversation' | 'decision' | 'task';

  /** Conversation subtype (Phase 1) */
  subtype?: 'decision' | 'discussion' | 'task' | 'question';

  /** Importance score, 1=low, 5=critical (Phase 1) */
  importance?: number; // Recommended: 1-5

  /** Agent ID */
  agentId: string;

  /** Room ID */
  roomId: string;

  /** Tags for categorization */
  tags: string[];

  /** Participant IDs (Phase 1) */
  participants?: string[];

  /** Associated workflow stage index 0-9 (Phase 1) */
  workflowStage?: number;

  /** Related memory IDs for context chain (Phase 1) */
  relatedMemoryIds?: string[];
}

/**
 * Memory content structure.
 */
export interface MemoryContent {
  content: string;
  timestamp: Date;
  metadata?: MemoryMetadata;
}
```

### 3.2 Phase 2: Enhanced Filters

**File**: `src/memory/types.ts`

```typescript
/**
 * Memory retrieval filters with enhanced capabilities.
 */
export interface MemoryFilters {
  /** Agent ID filter */
  agentId?: string;

  /** Room ID filter */
  roomId?: string;

  /** Time window filter (Phase 2) */
  timeWindow?: {
    start: Date;
    end: Date;
  };

  /** Minimum importance filter (Phase 2) */
  importance?: {
    min: number; // e.g., 3 means importance >= 3
  };

  /** Subtype filter (Phase 2) */
  subtypes?: string[]; // e.g., ['decision', 'task']

  /** Participant filter (Phase 2) */
  participants?: string[];

  /** Workflow stage filter (Phase 2) */
  workflowStage?: number;
}
```

### 3.3 Phase 3: Memory Classifier

**File**: `src/memory/MemoryClassifier.ts` (New)

```typescript
import type { Message } from '../types.js';

/**
 * Classification result.
 */
export interface MemoryClassification {
  subtype: 'decision' | 'discussion' | 'task' | 'question';
  importance: number; // 1-5
}

/**
 * Classifies conversation memories based on content patterns.
 */
export class MemoryClassifier {
  /**
   * Classify a conversation based on message and response.
   */
  classify(message: Message, response: string): MemoryClassification {
    // Rule 1: Decision detection
    if (this.isDecision(response)) {
      return { subtype: 'decision', importance: 5 };
    }

    // Rule 2: Task assignment detection
    if (this.isTaskAssignment(response)) {
      return { subtype: 'task', importance: 4 };
    }

    // Rule 3: Question/problem detection
    if (this.isQuestion(message.content)) {
      return { subtype: 'question', importance: 3 };
    }

    // Default: Discussion
    return { subtype: 'discussion', importance: 2 };
  }

  private isDecision(text: string): boolean {
    return /决定|确定|采用|选择|方案|批准/.test(text);
  }

  private isTaskAssignment(text: string): boolean {
    return /@\w+/.test(text) && /实施|开发|测试|执行/.test(text);
  }

  private isQuestion(text: string): boolean {
    return /问题|bug|错误|异常|故障/.test(text);
  }
}
```

## 4. Implementation Details

### 4.1 Phase 1: Structured Storage

#### 4.1.1 Modify Agent.ts

**File**: `src/agent/Agent.ts`
**Location**: Lines 459-485 (storeToLongTermMemory method)

**Changes**:
```typescript
private async storeToLongTermMemory(message: Message, response: string): Promise<void> {
  const longTermMemory = (this.contextAssembler as any).longTermMemory;
  if (!longTermMemory) {
    return;
  }

  try {
    const conversationContext = `用户 (${message.sender.name}): ${message.content}\n\n${this.name}: ${response}`;

    // Get current workflow stage if in workflow
    const workflowStage = this.getCurrentWorkflowStage(message.roomId);

    // Build enhanced metadata
    const metadata: MemoryMetadata = {
      type: 'conversation',
      agentId: this.id,
      roomId: message.roomId,
      tags: [this.name, message.sender.name],
      participants: [message.sender.id, this.id],
      workflowStage,
      // Phase 3 will add: subtype, importance from classifier
    };

    await longTermMemory.retain({
      content: conversationContext,
      context: message,
      metadata,
      timestamp: new Date(),
    });

    log.debug(`[${this.name}] Stored conversation to long-term memory`);
  } catch (error) {
    log.error(`[${this.name}] Failed to store to long-term memory:`, error);
  }
}

private getCurrentWorkflowStage(roomId: string): number | undefined {
  // Read workflow state from .data/workflows/{roomId}.json
  // Return current_stage if exists
  // Implementation details omitted for brevity
}
```

#### 4.1.2 Verify Mem0LongTermMemory.ts

**File**: `src/memory/Mem0LongTermMemory.ts`
**Location**: Lines 240-280 (retain method)

**Verification**: Ensure metadata is passed correctly to bridge
```typescript
async retain(memory: MemoryContent): Promise<string> {
  // ... existing code ...

  const result = await this.bridge.call('add', {
    messages: [{ role: 'user', content: memory.content }],
    user_id: memory.metadata?.roomId,
    agent_id: memory.metadata?.agentId,
    metadata: memory.metadata, // ✅ All fields passed through
  });

  // ... existing code ...
}
```

### 4.2 Phase 2: Enhanced Retrieval

#### 4.2.1 Enhance Mem0LongTermMemory.recall()

**File**: `src/memory/Mem0LongTermMemory.ts`
**Location**: Lines 286-320 (recall method)

**Changes**:
```typescript
async recall(query: string, limit?: number, filters?: MemoryFilters): Promise<MemoryContent[]> {
  await this.ensureInitialized();

  // Build Mem0 filters
  const mem0Filters: Record<string, any> = {};

  if (filters) {
    // Time window filter
    if (filters.timeWindow) {
      mem0Filters.created_at = {
        $gte: filters.timeWindow.start.toISOString(),
        $lte: filters.timeWindow.end.toISOString(),
      };
    }

    // Importance filter
    if (filters.importance) {
      mem0Filters['metadata.importance'] = {
        $gte: filters.importance.min,
      };
    }

    // Subtype filter
    if (filters.subtypes && filters.subtypes.length > 0) {
      mem0Filters['metadata.subtype'] = {
        $in: filters.subtypes,
      };
    }

    // Workflow stage filter
    if (filters.workflowStage !== undefined) {
      mem0Filters['metadata.workflowStage'] = filters.workflowStage;
    }
  }

  const result = await this.bridge.call('search', {
    query,
    user_id: filters?.roomId,
    agent_id: filters?.agentId,
    limit: limit ?? 5,
    filters: mem0Filters,
  });

  // ... existing parsing code ...
}
```

#### 4.2.2 Optimize ContextAssembler.buildLongTermSection()

**File**: `src/memory/ContextAssembler.ts`
**Location**: Lines 286-321 (buildLongTermSection method)

**Changes**:
```typescript
private async buildLongTermSection(query: string, agentId: string, roomId: string): Promise<string> {
  if (!this.longTermMemory) {
    return '';
  }

  try {
    // Get recent messages for context
    const recentMessages = this.shortTermMemory.get(roomId).slice(-3);

    // Clean and build enhanced query
    const cleanedMessages = recentMessages.map(m => this.cleanMessageForQuery(m.content));
    const contextQuery = [...cleanedMessages, this.cleanMessageForQuery(query)].join(' ');

    // Get current workflow stage
    const workflowStage = this.getCurrentWorkflowStage(roomId);

    // Build filters
    const filters: MemoryFilters = {
      agentId,
      roomId,
      timeWindow: {
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        end: new Date(),
      },
      importance: { min: 3 }, // Only important memories
      workflowStage, // Current stage if in workflow
    };

    const memories = await this.longTermMemory.recall(contextQuery, 5, filters);

    // ... existing formatting code ...
  } catch (error) {
    log.error('Failed to retrieve long-term memories:', error);
    return '';
  }
}

private cleanMessageForQuery(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
    .replace(/\{["'].*?tool.*?["']:[\s\S]*?\}/g, '') // Remove tool call JSON
    .substring(0, 500); // Limit length
}

private getCurrentWorkflowStage(roomId: string): number | undefined {
  // Read from .data/workflows/{roomId}.json
  // Return current_stage if exists
}
```

### 4.3 Phase 3: Intelligent Classification

#### 4.3.1 Create MemoryClassifier

**File**: `src/memory/MemoryClassifier.ts` (New file)

See Section 3.3 for complete implementation.

#### 4.3.2 Integrate Classifier into Agent

**File**: `src/agent/Agent.ts`
**Location**: storeToLongTermMemory method

**Changes**:
```typescript
import { MemoryClassifier } from '../memory/MemoryClassifier.js';

export class Agent {
  private memoryClassifier = new MemoryClassifier();

  // ... existing code ...

  private async storeToLongTermMemory(message: Message, response: string): Promise<void> {
    // ... existing setup code ...

    // Classify memory (Phase 3)
    const classification = this.memoryClassifier.classify(message, response);

    const metadata: MemoryMetadata = {
      type: 'conversation',
      subtype: classification.subtype, // From classifier
      importance: classification.importance, // From classifier
      agentId: this.id,
      roomId: message.roomId,
      tags: [this.name, message.sender.name],
      participants: [message.sender.id, this.id],
      workflowStage,
    };

    // Store asynchronously to avoid blocking
    Promise.resolve().then(() => {
      return longTermMemory.retain({
        content: conversationContext,
        context: message,
        metadata,
        timestamp: new Date(),
      });
    }).catch(error => {
      log.error(`[${this.name}] Failed to store to long-term memory:`, error);
    });
  }
}
```

## 5. Migration Strategy

### 5.1 Backward Compatibility

All new metadata fields are optional, ensuring existing memories continue to work:
- Memories without `subtype` → treated as 'discussion'
- Memories without `importance` → treated as importance=2
- Memories without `participants` → no participant filtering
- Memories without `workflowStage` → no workflow filtering

### 5.2 Gradual Rollout

1. **Phase 1 deployment**: New memories get enhanced metadata, old memories remain unchanged
2. **Phase 2 deployment**: Retrieval uses enhanced filters, gracefully handles missing fields
3. **Phase 3 deployment**: Classification applies to new memories only

## 6. Performance Considerations

### 6.1 Storage Performance

- **Classification overhead**: < 1ms (regex-based rules)
- **Metadata serialization**: < 1ms (JSON.stringify)
- **Total impact**: < 2ms per message (negligible)

### 6.2 Retrieval Performance

- **Filter complexity**: Mem0 uses vector DB indexes, filtering is O(log n)
- **Query enhancement**: 3 additional messages = ~500 chars, minimal impact
- **Expected latency**: < 500ms (p95), same as current

### 6.3 Optimization Strategies

1. **Async storage**: Classification and storage don't block agent response
2. **Query caching**: Mem0 has built-in caching for repeated queries
3. **Index optimization**: Ensure Mem0 vector DB has indexes on metadata fields

## 7. Testing Strategy

### 7.1 Unit Tests

- `MemoryClassifier.test.ts`: Test all classification rules
- `Mem0LongTermMemory.test.ts`: Test enhanced filters
- `ContextAssembler.test.ts`: Test query cleaning and context building

### 7.2 Integration Tests

- End-to-end memory storage with enhanced metadata
- End-to-end memory retrieval with filters
- Backward compatibility with existing memories

### 7.3 Performance Tests

- Benchmark storage latency (before/after)
- Benchmark retrieval latency with various filter combinations
- Load test: 1000 memories with complex metadata

## 8. Rollback Plan

If issues arise:
1. **Phase 3 rollback**: Remove classifier integration, revert to default importance=2
2. **Phase 2 rollback**: Remove enhanced filters, use simple agentId/roomId filters
3. **Phase 1 rollback**: Remove enhanced metadata fields, revert to basic metadata

All rollbacks are non-destructive (existing memories remain intact).

## 9. Success Metrics

- **Retrieval accuracy**: Measure relevance of top 5 memories (manual review)
- **Classification accuracy**: Sample 100 memories, verify subtype correctness
- **Performance**: p95 latency < 500ms for retrieval
- **Adoption**: 100% of new memories include enhanced metadata

## 10. Timeline

- **Phase 1**: 2-3 hours (types + storage)
- **Phase 2**: 3-4 hours (filters + retrieval)
- **Phase 3**: 2-3 hours (classifier + integration)
- **Testing**: 2 hours (unit + integration + performance)
- **Total**: 9-12 hours

---

**Next Steps**: Proceed to Stage 3 (Forward Briefing) for developer to explain design to QA Lead.
