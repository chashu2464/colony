# Skill Development Guide

Colony allows extending agent capabilities via a filesystem-based Skill system. This guide defines the standards and requirements for developing new Skills.

## 1. Structure
A Skill consists of a folder in the `skills/` directory with the following files:

- **`SKILL.md`**: Metadata and instructions for the agent on how to use the skill.
- **`scripts/handler.sh`**: The implementation script (usually Bash).
- **`.data/`** (Optional): A persistent storage directory for the skill.

## 2. Interaction Protocol
Agents execute Skills by calling the `handler.sh` script with JSON parameters via `stdin`.

```bash
echo '{"param1": "value1"}' | bash skills/my-skill/scripts/handler.sh
```

The script MUST return a JSON object to `stdout`.

## 3. Mandatory Requirements

### 3.1 AbortSignal & Signal Handling
To support **Dynamic Agent Management** (where an agent process can be aborted and removed at any time), all Skill handlers MUST correctly respond to termination signals.

- **SIGTERM**: When the Colony server aborts an LLM invocation (e.g., due to an agent being removed or a room being closed), it sends a `SIGTERM` to the parent process.
- **Propagation**: If your `handler.sh` spawns long-running sub-processes (e.g., builds, tests, or background services), it MUST ensure those processes are cleaned up immediately upon receiving a `SIGTERM`.
- **Reason**: Failure to handle signals results in **zombie processes** that continue to consume system resources and may cause state corruption in future sessions.

### 3.2 State Persistence
- Skills should store their state in `.data/` within their own folder.
- Use `JSON` for structured data to maintain compatibility with agent parsing.

### 3.3 Error Handling
- Always return a JSON object with an `error` field if something goes wrong.
- Exit with a non-zero status code if the operation failed.

## 4. Best Practices
- **Idempotency**: Ensure that repeated calls with the same parameters do not cause unintended side effects.
- **Surgical Actions**: Prefer small, focused updates over large, sweeping changes.
- **Logging**: Use `stderr` for logging/debugging information; only use `stdout` for the final JSON result.
