# 03 Cross Archive Pagination (C1)

## Assertion C1 Status

- C1 online->archive 邻接点不重不漏 + cursor 单调: PASS

## Given

- 先写入在线事件，再执行 `board.archive cutoff_seq=2` 形成 online/archive 邻接边界
- 统一 cursor：`{cursor_version, layer, event_id, ts_ms}`

## When

- 执行：`KEEP_STATE=1 bash tests/workflow_board_m21_test.sh`
- 证据：
  - `raw/m21_test_output.json`
  - `raw/m21_workflow_state.json`

## Then (Raw Output)

- `raw/m21_test_output.json`: `C1.page1_last_event_id != C1.page2_first_event_id`
- `raw/m21_test_output.json`: 脚本内断言 `seq` 全局单调、跨页 `event_id` 不重复（失败即退出）
- `raw/m21_workflow_state.json`: 同时存在 `board_archives[].events` 与 `board_events`

## Conclusion

- C1 已满足“跨层去重 + 无漏读 + cursor 单调前进”冻结口径。
