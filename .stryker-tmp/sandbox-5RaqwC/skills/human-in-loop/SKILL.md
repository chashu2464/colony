---
name: human-in-loop
description: Pause agent execution and wait for human input. Use this when you need a user decision, confirmation, or information that isn't available in the current context.
---

# human-in-loop

Pause execution and wait for a human to provide input via the frontend UI.

## Usage

```bash
echo '{"prompt": "Please confirm if I should delete the build artifacts?"}' | bash scripts/handler.sh
```

### Parameters

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `prompt`  | string | ✅       | The question or decision requested from the user. |
| `timeout` | number | ❌       | Timeout in seconds (default: 300). |

## Behavior

1.  Sends a message to the chat room with special metadata.
2.  The frontend displays an input box for the user.
3.  The script waits (blocks) until the user responds or it times out.
4.  Returns the user's response text as the tool output.
