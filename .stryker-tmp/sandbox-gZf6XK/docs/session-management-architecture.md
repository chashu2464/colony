# Colony: Session Management & Handoff (Session Chain)

Colony implements a **Session Chain** architecture to manage the lifecycle of long-running LLM agent conversations. Because underlying CLI tools (like Claude Code or Gemini CLI) have finite context windows and lack seamless infinite memory, Colony wraps these invocations in a managed lifecycle.

## Overview

Instead of letting a CLI session grow until it crashes or hits hard context limits with degraded performance (the "dying cat writing a will" problem), Colony monitors the context health. When a session nears its maximum capacity, Colony gracefully "seals" it, generates a concise summary (digest) of what transpired using a cheaper LLM model, and "bootstraps" a brand new session, injecting the digest so the agent maintains continuity without dragging the exact full token history.

Agents are also provided with a `get-session-history` skill, allowing them to search and paginate through full historical transcripts whenever they need detailed context from a past session.

## Architecture Components

### 1. Context Tracking & Archiving (`src/session/`)
- **`SessionRecord.ts`**: The core data structure. Instead of a flat key-value store, sessions are chained. Each record tracks its sequence index (`chainIndex`), status (`active` | `sealed`), cumulative `tokenUsage`, and a link to the `previousSessionId`. Records are persisted as JSON arrays per agent and room.
- **`TranscriptWriter.ts`**: Saves a highly detailed, chronological JSONL file for every session (`.data/transcripts/{agentId}-{roomId}/{sessionId}.jsonl`). This logs the exact prompt sent to the CLI, the raw response, and executed tools.
- **`ContextHealthBar.ts`**: Calculates a `fillRatio` based on accumulated tokens vs. the known maximum context window of the CLI in use (e.g., 200k for Claude). Computes a health status metric (🟢 `healthy`, 🟡 `moderate`, 🟠 `high`, 🔴 `critical`).

### 2. Auto-Sealing & Context Handoff (`src/session/`)
- **`SessionSealer.ts`**: Intercepts the agent loop prior to every CLI invocation. It checks the current `fillRatio` against configurable thresholds. If the `seal` threshold is breached, it mandates a handoff.
- **`DigestGenerator.ts`**: Upon sealing, a background task uses the configured 'cheap' CLI (e.g., Gemini Flash, defined by `COLONY_DIGEST_CLI`) to read the JSONL transcript of the dying session and generate a concise meeting-notes style summary of completed, pending, and blocked tasks.
- **`SessionBootstrap.ts`**: When a new session spins up, this module dynamically builds a preamble (the execution context, chain identity, and the previous digest) and forcefully prepends it to the very first prompt sent to the fresh CLI process.

### 3. Recall Capabilities (`skills/get-session-history/`)
To ensure agents don't guess past decisions, they are natively given the `get-session-history` skill alongside an explicit instruction in `ContextAssembler.ts` (Rule #10).
- **`list`**: View all chained sessions in the current room.
- **`search`**: Full-text search across all recorded JSONL transcripts for a given keyword.
- **`read`**: Pull paginated raw entries of any historical session.

## Configuration

Agent session behaviors can be customized in their respective YAML configurations under the `config/agents/` directory.

```yaml
session:
  strategy: handoff        # 'handoff' (graceful digest swap) or 'compress' (let CLI handle it)
  thresholds:
    warn: 0.80             # Log warning when context reaches 80% capacity
    seal: 0.88             # Force session seal when context reaches 88% capacity
```

If not provided, Colony defaults to the `handoff` strategy with an `88%` sealing threshold.

## Storage Hierarchy

Everything is automatically preserved under `.data/`:
- `.data/sessions/` — Contains `{agentId}-{roomId}.json`. Lists the chain sequence, token metrics, and generated digests.
- `.data/transcripts/` — Contains `{agentId}-{roomId}/` subdirectories harboring `{sessionId}.jsonl` files (the raw I/O dialogue and tool executions). 
