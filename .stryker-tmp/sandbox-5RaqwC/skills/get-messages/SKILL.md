---
name: get-messages
description: Retrieve recent chat messages from the Colony chat room for context.
---

# get-messages

Retrieve recent messages from the current Colony chat room. Use this to gain context when unsure about the conversation history.

## Usage

Run the handler script with JSON parameters via stdin:

```bash
echo '{"limit": 20}' | bash scripts/handler.sh
```

### Parameters

| Parameter | Type   | Required | Description |
|----------|--------|----------|-------------|
| `limit`   | number | ❌       | Max messages to retrieve (default: 20) |

### Example

```bash
echo '{"limit": 10}' | bash scripts/handler.sh
```

Returns a JSON object with a `messages` array containing recent chat messages, each with sender info, content, and timestamp.

## Environment Variables

- `COLONY_API` — Colony server URL
- `COLONY_ROOM_ID` — Current chat room ID
