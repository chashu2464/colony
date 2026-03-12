---
name: get-session-history
description: Search and read previous session records for this agent. Use this when you need to recall what happened in earlier sessions.
---

# get-session-history

Search and retrieve records from your previous sessions. Use this when you're not sure what happened before — **don't guess, use this skill to look it up**.

## Commands

### list — List all your sessions in this room

```bash
echo '{"command": "list"}' | bash scripts/handler.sh
```

Returns a list of sessions with status and token usage.

### search — Search across all sessions for a keyword

```bash
echo '{"command": "search", "query": "your search query"}' | bash scripts/handler.sh
```

Returns matching snippets with session and invocation references.

### read — Read a specific session transcript

```bash
echo '{"command": "read", "sessionId": "SESSION_ID", "page": 0}' | bash scripts/handler.sh
```

- `sessionId`: from a `list` or `search` result
- `page`: optional, 0-indexed (each page is ~20 invocations)

## When to Use

- You don't remember a past decision or its rationale → `search`
- You need to see the full flow of a previous session → `read`
- You want to know how many sessions you've had → `list`

## Environment Variables

- `COLONY_API` — Colony server URL
- `COLONY_AGENT_ID` — Your agent ID
- `COLONY_ROOM_ID` — Current room ID

## Example Flow

```bash
# Find all sessions
echo '{"command": "list"}' | bash scripts/handler.sh

# Search for a specific topic
echo '{"command": "search", "query": "database schema migration"}' | bash scripts/handler.sh

# Read full details of a session
echo '{"command": "read", "sessionId": "abc123"}' | bash scripts/handler.sh
```
