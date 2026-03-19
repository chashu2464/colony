---
name: remember
description: Store important information to long-term memory for future recall across sessions
---

# remember

Store important information to long-term memory (Mem0/Qdrant) for future recall. Use this skill to actively remember decisions, insights, patterns, and knowledge that should persist across sessions.

## When to Use

**DO use remember for:**
- Important decisions and their rationale
- User preferences and stable working habits (for example tool choice, communication style, default workflow)
- User choices made during decision points (for example selecting方案A、拒绝方案B、接受某个架构约束)
- Explicit instructions from the user about what must be remembered, especially normative rules or collaboration conventions
- Valuable patterns or best practices discovered
- Key architectural choices and trade-offs
- Lessons learned from debugging or problem-solving
- Reflections after repeated skill/tool failures, when the cause is stable and worth avoiding next time
- Critical project context that should persist
- Reusable coordination knowledge, such as who owns which module or which agent should be involved for certain classes of changes
- Confirmed constraints from the environment or infrastructure that meaningfully affect future design decisions

**DON'T use remember for:**
- Casual conversation or small talk
- Temporary state or work-in-progress
- Information already documented in code/files
- Trivial details without lasting value

## Usage

```bash
echo '{
  "content": "Your memory content here",
  "importance": 4,
  "type": "decision",
  "tags": ["architecture", "performance"]
}' | bash scripts/handler.sh
```

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `content` | string | ✅ | - | The information to remember (use your own words to summarize) |
| `importance` | number | ❌ | 4 | Importance level (1-5). Higher = more critical. Defaults to 4. |
| `type` | string | ❌ | knowledge | Memory type: `decision`, `task`, `code`, `knowledge` |
| `tags` | array | ❌ | [] | Tags for categorization (e.g., ["architecture", "bug-fix"]) |
| `context` | string | ❌ | - | Additional context or reasoning for why this is important |

## Examples

### Remember an architectural decision
```bash
echo '{
  "content": "Decided to use Mem0 for long-term memory and ShortTermMemory for session context. Mem0 provides semantic search via Qdrant, while ShortTermMemory keeps recent messages in memory for fast access.",
  "importance": 5,
  "type": "decision",
  "tags": ["architecture", "memory-system", "mem0"],
  "context": "This decision was made after analyzing that Mem0 is optimized for long-term storage with 50-200ms latency, while short-term needs <1ms access"
}' | bash scripts/handler.sh
```

### Remember a code pattern
```bash
echo '{
  "content": "When creating symlinks, use fs.realpathSync() to compare paths instead of string comparison to handle normalization differences.",
  "importance": 3,
  "type": "code",
  "tags": ["nodejs", "filesystem", "best-practice"]
}' | bash scripts/handler.sh
```

### Remember a lesson learned
```bash
echo '{
  "content": "Low importance memories (< 3) are filtered out during retrieval, wasting 40% of embedding costs. Only store memories with importance >= 3.",
  "importance": 4,
  "type": "knowledge",
  "tags": ["optimization", "cost-saving", "memory-system"]
}' | bash scripts/handler.sh
```

## How It Works

1. The skill validates your input (content length, importance range)
2. Calls Colony API `/api/memory/retain` endpoint
3. Colony stores the memory in Mem0 (Qdrant vector database)
4. Memory becomes available for semantic search in future sessions

## Memory Retrieval

Memories stored via this skill are automatically retrieved when:
- You process messages (via ContextAssembler)
- Semantic similarity matches your current query
- Filters match (importance >= 3, same agent/room, recent timeWindow)

## Tips

- **Be concise but complete**: Summarize in your own words, include key context
- **Use appropriate importance**: 5=critical decisions, 4=important knowledge, 3=useful info
- **Add meaningful tags**: Help future retrieval with relevant categorization
- **Include context**: Explain WHY this is important, not just WHAT it is
