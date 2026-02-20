---
name: send-message
description: Send a message to the Colony chat room. This is the only way for an agent to communicate.
---

# send-message

Send a message to the current Colony chat room. This is the **only way** you can communicate — you cannot speak directly.

## Usage

To send a message, run the handler script with JSON parameters via stdin:

```bash
echo '{"content": "你好，这是我的回复", "mentions": ["architect"]}' | bash scripts/handler.sh
```

### Parameters

| Parameter  | Type     | Required | Description |
|-----------|----------|----------|-------------|
| `content`  | string   | ✅       | Message text to send |
| `mentions` | string[] | ❌       | Agent IDs or names to @mention |

### Examples

**Simple reply:**
```bash
echo '{"content": "收到，我来处理这个任务。"}' | bash scripts/handler.sh
```

**Reply with @mention:**
```bash
echo '{"content": "@开发者 请查看这个方案", "mentions": ["developer"]}' | bash scripts/handler.sh
```

## Environment Variables

The following environment variables are automatically injected by Colony:

- `COLONY_API` — Colony server URL
- `COLONY_AGENT_ID` — Your agent ID
- `COLONY_ROOM_ID` — Current chat room ID

## Important

- You **must** call this skill at least once to reply to the user.
- Without calling this skill, your response will not be visible to anyone.
