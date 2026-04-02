# 04 Validation Errors (C2/C3/C4)

## Assertion Status

- C2 `cursor+since_event_id` 冲突 -> `BOARD_CURSOR_CONFLICT`: PASS
- C3 非法 `cursor_version` -> `BOARD_CURSOR_INVALID`: PASS
- C4 unknown `since_event_id` -> `since_event_id was not found`: PASS

## Given

- 回归脚本：`tests/workflow_board_test.sh`
- 负例原始响应保留在 `raw/`

## When

- 同时传 `cursor` + `since_event_id`
- 仅传非法 `cursor_version`
- 仅传不存在 `since_event_id`

## Then (Raw Output)

- `raw/cursor_plus_since.json` -> `BOARD_VALIDATION_ERROR/BOARD_CURSOR_CONFLICT`
- `raw/cursor_invalid_only.json` -> `BOARD_VALIDATION_ERROR/BOARD_CURSOR_INVALID`
- `raw/since_unknown.json` -> `BOARD_VALIDATION_ERROR` + `since_event_id was not found`

## Conclusion

- C2/C3/C4 全部通过，错误语义稳定且 fail-closed。
