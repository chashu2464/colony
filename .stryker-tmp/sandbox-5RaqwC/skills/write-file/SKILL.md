---
name: write-file
description: Write content to a file on the local filesystem. Creates parent directories if needed. Use for creating or modifying source code, configuration, and text files.
---

# Write File

Write content to a file. Creates parent directories automatically.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | string | yes | Path to the file to write |
| content | string | yes | Content to write |
| append | boolean | no | If true, append instead of overwrite (default: false) |

## Examples

Create a new file:
```json
{"skill": "write-file", "params": {"path": "src/utils/helper.ts", "content": "export function greet(name: string) {\n  return `Hello, ${name}!`;\n}\n"}}
```

Append to a log file:
```json
{"skill": "write-file", "params": {"path": "debug.log", "content": "New entry\n", "append": true}}
```
