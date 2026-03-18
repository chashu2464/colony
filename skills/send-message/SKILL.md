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

| Parameter  | Type     | Required | Description | Example |
|-----------|----------|----------|-------------|---------|
| `content`  | string   | ✅       | Message text to send (must be non-empty) | `"收到，我来处理"` |
| `mentions` | string[] | ❌       | Agent names to @mention — **must be an array**, not a string | `["开发者"]` or `["开发者", "QA负责人"]` |

**⚠️ Type Requirements:**
- `content` must be a **non-empty string**
- `mentions` must be an **array of strings** (e.g., `["name"]`), NOT a single string (e.g., `"name"`)

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

## ⚠️ Common Errors and How to Avoid Them

### Error 1: `mentions` is a string instead of an array
❌ **Wrong:**
```bash
echo '{"content": "请查看", "mentions": "开发者"}' | bash scripts/handler.sh
```

✅ **Correct:**
```bash
echo '{"content": "请查看", "mentions": ["开发者"]}' | bash scripts/handler.sh
```

### Error 2: Empty content
❌ **Wrong:**
```bash
echo '{"content": ""}' | bash scripts/handler.sh
```

✅ **Correct:**
```bash
echo '{"content": "收到"}' | bash scripts/handler.sh
```

### Error 3: Invalid JSON format
❌ **Wrong (missing quotes, unescaped newlines):**
```bash
echo '{"content": "第一行
第二行"}' | bash scripts/handler.sh
```

✅ **Correct (use \n for newlines):**
```bash
echo '{"content": "第一行\n第二行"}' | bash scripts/handler.sh
```

### Error 4: Mentioning non-existent agents
❌ **Wrong:**
```bash
echo '{"content": "请查看", "mentions": ["不存在的角色"]}' | bash scripts/handler.sh
```

✅ **Correct (use actual agent names from room participants):**
```bash
echo '{"content": "请查看", "mentions": ["开发者"]}' | bash scripts/handler.sh
```

## Environment Variables

The following environment variables are automatically injected by Colony:

- `COLONY_API` — Colony server URL
- `COLONY_AGENT_ID` — Your agent ID
- `COLONY_ROOM_ID` — Current chat room ID

## Checklist

Before sending, verify:
1. ✅ You have actual content to send (non-empty string)
2. ✅ If you need someone to act, use `mentions` parameter (not @ in text)
3. ✅ `mentions` is an **array** (e.g., `["name"]`), not a string (e.g., `"name"`)
4. ✅ You are mentioning at most one agent
5. ✅ You are NOT mentioning anyone just for notification or thanks
6. ✅ Your JSON is properly formatted (no unescaped newlines, all quotes matched)
7. ✅ Agent names in `mentions` match actual participants in the room

## Troubleshooting

**If your message fails to send:**
1. Check the skill log: `/Users/casu/Documents/Colony/logs/skill-send-message.log`
2. Verify your JSON syntax is valid
3. Ensure `mentions` is an array, not a string
4. Confirm agent names exist in the current room
5. Make sure `content` is not empty

**Note:** The system may not always notify you when a message fails. If you're unsure whether your message was sent, you can check the chat history or logs.
