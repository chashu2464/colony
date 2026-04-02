# 06 Observability Metrics (E1)

## Assertion E1 Status

- E1 归档期 `board.events` p95 相对增幅 <10%: PASS (`8%`)

## Formula

- `relative_increase_p95 = (p95_archive - p95_baseline) / p95_baseline * 100%`

## Given

- 时间窗（UTC）：`raw/m21_window_start_utc.txt` ~ `raw/m21_window_end_utc.txt`
- 指标口径：`extensions.board_metrics.query_logs[].latency_ms`
- 采样：baseline/online 与 archive 各 20 次请求

## When

- 执行：`KEEP_STATE=1 bash tests/workflow_board_m21_test.sh`
- 提取：`raw/m21_query_logs.json` + `raw/m21_test_output.json`

## Then (Raw Output)

- `raw/m21_test_output.json`: `baseline_p95=50`, `archive_p95=54`, `relative_increase_pct=8`
- `raw/m21_query_logs.json`: 含 `timestamp/trace_id/actor/workflow_id/layer/latency_ms`

## Conclusion

- E1 达标（8% < 10%），并且指标可提取、可追溯、可重放。
