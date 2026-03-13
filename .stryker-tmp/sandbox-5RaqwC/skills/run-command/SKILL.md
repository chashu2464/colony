---
name: run-command
description: Execute a shell command and return its output. Use for running builds, tests, git operations, and other CLI tasks. Use with caution.
---

# Run Command

Execute a shell command in the system shell and return stdout/stderr.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| command | string | yes | The shell command to execute |
| cwd | string | no | Working directory (default: project root) |
| timeout | number | no | Timeout in milliseconds (default: 30000) |

## Examples

Run tests:
```json
{"skill": "run-command", "params": {"command": "npm test"}}
```

Check git status in a specific directory:
```json
{"skill": "run-command", "params": {"command": "git status", "cwd": "/path/to/repo"}}
```

## Important

- Commands have a default timeout of 30 seconds
- Output is capped at 1MB
- Use responsibly — avoid destructive commands unless explicitly asked
