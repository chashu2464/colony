---
name: quick-task
description: A lightweight workflow for rapid iterations and small tasks.
---

# quick-task

A lightweight workflow for rapid iterations and small tasks.

## Usage

Use this skill for small fixes or enhancements (< 1 hour). It enforces mandatory branching and squash merges.

### Initialize a task
```bash
echo '{"action": "start", "task_name": "Fix minor bug"}' | bash scripts/handler.sh
```
This creates a `feature/quick-{id}` branch and switches to it.

### Complete a task
```bash
echo '{"action": "done"}' | bash scripts/handler.sh
```
This squash-merges your changes into master and deletes the branch.

### Check status
```bash
echo '{"action": "status"}' | bash scripts/handler.sh
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `start`, `done`, `status` |
| `task_name` | string | ❌ | Name of the task (required for `start`) |

## Guidelines
- Use this for minor changes (级别 0 & 1).
- For large features or multi-day projects, use `dev-workflow`.
