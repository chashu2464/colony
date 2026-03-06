# Test Cases: P3 - Single Source of Truth & Smart Context Compression

## Direction 1: Single Source of Truth (SSOT)

### Test Case 1: Markdown Table Parsing Accuracy
**Goal**: Verify the parser correctly extracts data from a standard SKILL.md table.
- **Given**: A valid `SKILL.md` with a standard "阶段-角色映射表" (Stage-Role Mapping Table).
- **When**: `MarkdownParser.parseStageRoleMapping` is invoked.
- **Then**: It returns a `Map<number, StageProtocol>` where the keys and values exactly match the table's rows (e.g., Stage 3 maps to developer/qa_lead).

### Test Case 2: Parsing Error Handling & Fallback
**Goal**: Ensure system stability when the source file is corrupted.
- **Given**: A malformed `SKILL.md` (e.g., deleted columns, broken Markdown syntax).
- **When**: `MarkdownParser.parseStageRoleMapping` fails to parse.
- **Then**: An exception is caught, and the system transparently falls back to the hardcoded `FALLBACK_MAPPING`, logging a warning.

### Test Case 3: Cross-Language Configuration Sync (Node CLI)
**Goal**: Verify that Bash scripts stay in sync with TS logic via the CLI bridge.
- **Given**: `SKILL.md` is modified to change the "主要负责人" of a stage.
- **When**: `scripts/parse-workflow-table.js` is executed.
- **Then**: The JSON output reflects the change, and `handler.sh` (using `jq`) successfully assigns the new role for that stage.

### Test Case 4: Environment Variable Concurrency Control
**Goal**: Prevent OOM by limiting parallel CLI calls.
- **Given**: `COLONY_MAX_CLI_CONCURRENCY` is set to `1` in the environment.
- **When**: Multiple independent tool calls are initiated simultaneously.
- **Then**: `CLIInvoker` limits active processes to 1, queuing others or executing sequentially, as verified by process logs.

---

## Direction 2: Smart Context Compression

### Test Case 5: L1 Buffer Retention (Recent History)
**Goal**: Ensure the immediate conversation context remains untouched.
- **Given**: A chat session with 15 messages.
- **When**: `ContextAssembler` builds the prompt.
- **Then**: The most recent 10 messages (Level 1) are included in their raw, full-text form without any modification.

### Test Case 6: L2 Summarization Trigger & Cache
**Goal**: Verify that messages 11-30 are summarized asynchronously and cached.
- **Given**: A chat session reaches 25 messages (> 20 threshold).
- **When**: A new prompt is assembled.
- **Then**: An asynchronous LLM task is triggered to summarize messages 11-25; subsequent prompt assemblies use the cached summary instead of re-summarizing.

### Test Case 7: L3 Context Pruning
**Goal**: Verify that very old messages are either indexed or removed to save tokens.
- **Given**: A long-running session with 40+ messages.
- **When**: Prompt is assembled.
- **Then**: Messages older than the 30th (Level 3) are represented as a high-level "Decision Log" or entirely removed, depending on their importance.

### Test Case 8: Agent Cognitive Continuity (Regression Test)
**Goal**: Confirm that the Agent still "remembers" key facts after they are moved to the summary (L2).
- **Given**: A key architectural decision was made in message #15 (now in L2 summary).
- **When**: The user asks the Agent to recall or act upon that specific decision.
- **Then**: The Agent provides a correct answer, proving the L2 summary successfully captured the vital context.

### Test Case 9: Performance Gate (Latency)
**Goal**: Meet the performance requirements defined in the design.
- **Given**: 100 iterations of `SKILL.md` parsing.
- **When**: Time is measured using `console.time`.
- **Then**: The average parsing time is **< 5ms**, and the total prompt assembly overhead (excluding LLM calls) is **< 50ms**.
