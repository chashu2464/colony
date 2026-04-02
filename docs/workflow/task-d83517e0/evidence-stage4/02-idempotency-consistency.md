# 02 Idempotency Consistency (B1)

## Assertion B1 Status

- B1 同幂等键重复触发不重复写: PASS

## Given

- 幂等键：`workflow_id + source_stage_event_id + action`
- 回归脚本：`tests/workflow_board_test.sh`

## When

- 执行：`bash tests/workflow_board_test.sh`
- 新增断言：幂等相关时间字段必须可被 `Date.parse` 解析（RFC3339/ISO8601）
- 证据文件：
  - `raw/idempotency_first_apply.json`
  - `raw/idempotency_second_apply.json`
  - `raw/idempotency_conflict.json`

## Then (Raw Output)

- `idempotency_first_apply.json`: `status=applied`, `board_event_count` 增长
- `idempotency_second_apply.json`: `status=already_applied`, `updated_events=[]`, `board_event_count` 不增长
- `idempotency_conflict.json`: `BOARD_VALIDATION_ERROR/BOARD_IDEMPOTENCY_CONFLICT`
- `idempotency_first_apply.json` / `idempotency_second_apply.json` 中时间字段为 RFC3339（`.sssZ`），可被 `Date.parse` 正常解析

## Conclusion

- B1 已闭环，重复请求不会重复写，冲突请求 fail-closed；时间格式风险（P2）已通过断言与原始证据收敛。
