# Stage 5 Evidence S5-1: Drift/Recovery Tail

## Given

- Script: `KEEP_STATE=1 bash tests/workflow_board_m21_test.sh`
- Repeated runs: 6
- Rooms: `workflow-board-m21-1775135387` .. `workflow-board-m21-1775135461`
- Time window (UTC): generated snapshot at `2026-04-02T13:11:16Z`

## When

- Command used:
  - `/tmp/m21_stage5_collect.sh 6`
- Aggregate source:
  - `raw/stage5_runs.ndjson`
  - `raw/stage5_aggregate.json`

## Then

- Drift tail:
  - `p95_of_a1_p95=19s`
  - `p99_of_a1_p99=19s`
  - `max_a1_p99=19s`
- Recovery tail:
  - `p95_seconds=2`
  - `p99_seconds=2`
  - `max_seconds=2`

## Conclusion

- Stage 5 drift/recovery tail remains within Stage 3 frozen thresholds (`p95<=20s`, `p99<30s`, recovery `<30m`).
