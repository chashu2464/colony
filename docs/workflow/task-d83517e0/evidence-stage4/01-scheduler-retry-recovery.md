# 01 Scheduler / Retry / Recovery (A1-A3)

## Assertion Status

- A1 调度漂移阈值: PASS (`p95=19s`, `p99=19s`)
- A2 退避与 fail-closed: PASS (`[60,120,240,480,900]s`)
- A3 堆积恢复 <30m: PASS (`recovery_seconds=1`)

## Given

- 回归脚本：`tests/workflow_board_m21_test.sh`
- 固定断言：1m 调度，指数退避 cap=15m，失败不污染 board 快照

## When

- 执行：`KEEP_STATE=1 bash tests/workflow_board_m21_test.sh`
- 原始状态导出：
  - `raw/m21_scheduler_history.json`
  - `raw/m21_workflow_state.json`
  - `raw/m21_test_output.json`

## Then (Raw Output)

- `raw/m21_test_output.json`: `A1={p95:19,p99:19}`
- `raw/m21_test_output.json`: `A2_details.backoff_seconds=[60,120,240,480,900]`
- `raw/m21_test_output.json`: `A3.recovery_seconds=1`
- `raw/m21_scheduler_history.json`: 5 次失败 + 1 次成功，`pending_queue_depth` 在成功后归零

## Conclusion

- A1/A2/A3 均满足冻结阈值，可直接进入 QA Stage 4 门禁复核。
