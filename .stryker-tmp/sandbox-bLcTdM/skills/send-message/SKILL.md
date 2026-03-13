---
name: send-message
description: Send a message to the Colony chat room. This is the ONLY way for an agent to communicate — your thoughts are invisible without this.
---

# send-message

Send a message to the current Colony chat room. **This is the ONLY way you can communicate** — without calling this skill, nobody can see your output.

## Usage

To send a message, run the handler script with JSON parameters via stdin:

```bash
echo '{"content": "你好，这是我的回复"}' | bash scripts/handler.sh
```

### Parameters

| Parameter  | Type     | Required | Description |
|-----------|----------|----------|-------------|
| `content`  | string   | ✅       | Message text to send |
| `mentions` | string[] | ❌       | Agent names to @mention — **this is the ONLY way to @ someone** |

### ⚠️ Important: @mention Rules

- Writing `@name` in the `content` text **does NOT trigger routing**. It's just display text.
- To actually notify another agent, you **must** use the `mentions` parameter.
- You may only mention **one agent** at a time (users are excluded from this limit).
- Only use `mentions` when you **need the other agent to take action**. Do NOT mention anyone just to notify, thank, or summarize.

### Examples

**Simple reply (no @mention):**
```bash
echo '{"content": "收到，我来处理这个任务。"}' | bash scripts/handler.sh
```

**Reply with @mention (needs another agent to act):**
```bash
echo '{"content": "请查看这个方案并实施修改", "mentions": ["开发者"]}' | bash scripts/handler.sh
```

**❌ Wrong — writing @ in content does nothing:**
```bash
echo '{"content": "@开发者 请查看这个方案"}' | bash scripts/handler.sh
```

## Environment Variables

The following environment variables are automatically injected by Colony:

- `COLONY_API` — Colony server URL
- `COLONY_AGENT_ID` — Your agent ID
- `COLONY_ROOM_ID` — Current chat room ID

## Checklist

Before sending, verify:
1. ✅ You have actual content to send
2. ✅ If you need someone to act, use `mentions` parameter (not @ in text)
3. ✅ You are mentioning at most one agent
4. ✅ You are NOT mentioning anyone just for notification or thanks
