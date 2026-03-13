# delayed-exec

Schedule delayed or repeated execution of tasks. Use this skill to wake up the calling agent after a specified time with a preset prompt.

## Use Cases

- **Async result polling**: Schedule the agent to check back later for async operation results
- **Scheduled tasks**: Execute periodic tasks at regular intervals
- **Delayed actions**: Perform an action after a specific delay

## Usage

To schedule a task, run the handler script with JSON parameters via stdin:

```bash
echo '{
  "mode": "once",
  "delayMs": 60000,
  "prompt": "Check if the build has completed"
}' | bash scripts/handler.sh
```

### Parameters

| Parameter          | Type   | Required | Description |
|-------------------|--------|----------|-------------|
| `mode`            | string | ✅       | Execution mode: `"once"` or `"repeat"` |
| `delayMs`         | number | ✅       | Delay in milliseconds before first execution |
| `prompt`          | string | ✅       | Prompt to send to the agent when task executes |
| `repeatIntervalMs`| number | ❌       | Interval in milliseconds for repeated execution (required if mode is "repeat") |
| `maxExecutions`   | number | ❌       | Maximum number of executions for repeat mode (unlimited if not specified) |

### Examples

**Single delayed execution:**
```bash
echo '{
  "mode": "once",
  "delayMs": 300000,
  "prompt": "Check if the deployment has completed and report the status"
}' | bash scripts/handler.sh
```

**Repeated execution:**
```bash
echo '{
  "mode": "repeat",
  "delayMs": 60000,
  "repeatIntervalMs": 300000,
  "maxExecutions": 10,
  "prompt": "Check the service health and log the status"
}' | bash scripts/handler.sh
```

**Repeated execution (unlimited):**
```bash
echo '{
  "mode": "repeat",
  "delayMs": 60000,
  "repeatIntervalMs": 60000,
  "prompt": "Monitor the queue and process pending items"
}' | bash scripts/handler.sh
```

## Environment Variables

The following environment variables are automatically injected by Colony:

- `COLONY_API` — Colony server URL
- `COLONY_AGENT_ID` — Your agent ID
- `COLONY_ROOM_ID` — Current chat room ID

## Response

The skill returns a JSON object with the scheduled task information:

```json
{
  "taskId": "uuid-here",
  "nextExecutionAt": 1234567890000
}
```

## Notes

- Tasks persist across server restarts
- The agent will receive the preset prompt as a message when the task executes
- For repeat mode, the agent will be woken up at each interval until maxExecutions is reached (or indefinitely if not specified)
- Use reasonable delays to avoid overwhelming the system
