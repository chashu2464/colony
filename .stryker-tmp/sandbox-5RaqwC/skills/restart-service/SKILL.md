---
name: restart-service
description: 重启 Colony 服务。必须在用户明确要求重启服务时才能调用。该技能会先执行 `npm run build:server` 确保编译无误，然后执行 kill 进程并重新启动的操作。
---

# Restart Service

编译并重启 Colony 服务。

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| confirm | boolean | yes | 必须设置为 true 以确认操作。 |

## Examples

重启服务：
```json
{"skill": "restart-service", "params": {"confirm": true}}
```

## Important

- **权限限制**：除非用户在当前对话中明确输入了“重启服务”或类似的指令，否则禁止调用此技能。
- **操作风险**：该操作会终止当前运行的服务器进程并启动新进程，可能会导致连接短暂中断。
- **编译检查**：重启前会自动运行 `npm run build:server`，如果编译失败，重启操作将不会执行。
