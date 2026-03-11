---
name: read-file
description: Read the contents of a file from the local filesystem. Use when you need to inspect source code, configuration files, or any text file.
---

# Read File

Read a file's contents from the local filesystem.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | string | yes | Absolute or relative path to the file |
| start_line | number | no | Start line number (1-indexed) |
| end_line | number | no | End line number (1-indexed, inclusive) |

## Examples

Read an entire file:
```json
{"skill": "read-file", "params": {"path": "/path/to/file.ts"}}
```

Read lines 10-30 of a file:
```json
{"skill": "read-file", "params": {"path": "src/main.ts", "start_line": 10, "end_line": 30}}
```
