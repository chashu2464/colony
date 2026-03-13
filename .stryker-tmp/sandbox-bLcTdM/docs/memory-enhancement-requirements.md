# Memory System Enhancement - Requirements Document

**Task ID**: 317c9ca3
**Version**: 1.0
**Date**: 2026-03-07
**Author**: Architect

## 1. Executive Summary

Enhance Colony's memory system to provide structured storage, accurate retrieval, and intelligent classification of conversation memories. This improvement will optimize the existing Mem0 integration while maintaining backward compatibility.

## 2. Business Goals

- **Improve memory quality**: Structured metadata enables better organization and filtering
- **Enhance retrieval accuracy**: Reduce irrelevant memories in context, improve agent decision quality
- **Enable intelligent classification**: Automatically identify important conversations (decisions, tasks, questions)

## 3. Current State Analysis

### 3.1 Existing Architecture

```
User Message → Agent.handleMessage()
              ↓
              ContextAssembler.assemble()
              ├─ buildLongTermSection() ← Recall memories (query = currentMessage.content)
              └─ Build complete prompt
              ↓
              LLM Invocation
              ↓
              storeToLongTermMemory() ← Store "用户: xxx\n\n架构师: yyy"
```

### 3.2 Identified Problems

1. **Unstructured storage**: Memory content is plain text concatenation
2. **Imprecise retrieval**: Only uses current message content as query
3. **No classification**: All memories are type='conversation', no importance scoring
4. **Limited filtering**: Cannot filter by time window, importance, or conversation type

## 4. Requirements

### 4.1 Functional Requirements

#### FR-1: Structured Memory Metadata

**Priority**: High
**Description**: Extend memory metadata to include structured information

**Acceptance Criteria**:
- ✅ MemoryMetadata interface includes: subtype, importance, participants, workflowStage, relatedMemoryIds
- ✅ storeToLongTermMemory() populates new metadata fields
- ✅ Mem0 bridge correctly passes extended metadata to Mem0 library
- ✅ Backward compatible: existing memories without new fields still work

**Data Model**:
```typescript
interface MemoryMetadata {
  type: 'conversation' | 'decision' | 'task';
  subtype?: 'decision' | 'discussion' | 'task' | 'question';
  importance?: 1 | 2 | 3 | 4 | 5;  // 1=low, 5=critical
  agentId: string;
  roomId: string;
  tags: string[];
  participants?: string[];
  workflowStage?: number;
  relatedMemoryIds?: string[];
}
```

#### FR-2: Enhanced Memory Retrieval

**Priority**: High
**Description**: Improve recall() method with advanced filtering capabilities

**Acceptance Criteria**:
- ✅ MemoryFilters interface supports: timeWindow, importance, subtypes, participants
- ✅ recall() method applies filters correctly
- ✅ Query context includes current message + recent 3 messages (not just current)
- ✅ Default strategy: prioritize recent 7 days, importance >= 3, workflow-related memories

**Query Strategy**:
```typescript
// Priority order:
1. Time decay: Recent 7 days > older memories
2. Importance filter: importance >= 3
3. Workflow context: If in workflow, prioritize same stage memories
4. Enhanced query: Use current + recent 3 messages as context
```

#### FR-3: Intelligent Memory Classification

**Priority**: Medium
**Description**: Automatically classify memories and assign importance scores

**Acceptance Criteria**:
- ✅ MemoryClassifier module implements rule-based classification
- ✅ Classification rules detect: decisions, tasks, questions, discussions
- ✅ Importance scoring based on content patterns
- ✅ Integration with storeToLongTermMemory() is seamless

**Classification Rules**:
```typescript
Decision (importance=5): Contains "决定|确定|采用|选择|方案"
Task (importance=4): Contains "@mention" + "实施|开发|测试"
Question (importance=3): Contains "问题|bug|错误|异常"
Discussion (importance=2): Default fallback
```

### 4.2 Non-Functional Requirements

#### NFR-1: Performance
- Memory retrieval latency: < 500ms (p95)
- No significant impact on message processing time

#### NFR-2: Compatibility
- Backward compatible with existing memories
- Mem0 bridge must handle extended metadata without errors
- Optional fields: all new metadata fields are optional

#### NFR-3: Maintainability
- Clear separation of concerns: types, storage, retrieval, classification
- Comprehensive TypeScript types for all interfaces
- Unit tests for classification logic

## 5. Implementation Phases

### Phase 1: Structured Memory Storage
**Files**:
- `src/memory/types.ts` - Extend MemoryMetadata interface
- `src/agent/Agent.ts` - Modify storeToLongTermMemory()
- `src/memory/Mem0LongTermMemory.ts` - Ensure metadata passthrough

**Deliverable**: Memories stored with extended metadata

### Phase 2: Enhanced Memory Retrieval
**Files**:
- `src/memory/types.ts` - Extend MemoryFilters interface
- `src/memory/Mem0LongTermMemory.ts` - Enhance recall() implementation
- `src/memory/ContextAssembler.ts` - Optimize buildLongTermSection()

**Deliverable**: Accurate memory retrieval with advanced filtering

### Phase 3: Intelligent Classification
**Files**:
- `src/memory/MemoryClassifier.ts` - New classifier module
- `src/agent/Agent.ts` - Integrate classifier

**Deliverable**: Automatic memory classification and importance scoring

## 6. Success Metrics

- **Retrieval accuracy**: Reduce irrelevant memories in context by 50%
- **Classification accuracy**: 80%+ correct subtype classification
- **Performance**: No regression in message processing latency
- **Adoption**: All new memories include structured metadata

## 7. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Mem0 API incompatibility | High | Verified metadata passthrough in bridge |
| Performance degradation | Medium | Benchmark before/after, optimize filters |
| Classification inaccuracy | Low | Start with simple rules, iterate based on feedback |

## 8. Dependencies

- Mem0 library (existing)
- Python bridge (existing, verified compatible)
- TypeScript 5.x (existing)

## 9. Timeline Estimate

- Phase 1: 2-3 hours
- Phase 2: 3-4 hours
- Phase 3: 2-3 hours
- **Total**: 7-10 hours

## 10. Approval

This document requires approval from:
- ✅ Architect (author)
- ⏳ Tech Lead
- ⏳ Developer
- ⏳ QA Lead

---

**Next Steps**: Proceed to Stage 1 (Initial Requirements) for detailed review and approval.
