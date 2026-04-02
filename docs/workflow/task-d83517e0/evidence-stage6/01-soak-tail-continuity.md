# Stage 6 Evidence S6-1: Soak Tail Continuity

## Given

- Command: `bash scripts/workflow_board_stage6_collect.sh 6 120 12`
- Soak runs: `6`
- Window metadata: `raw/stage6_window.json`

## When

- Source files:
  - `raw/stage6_runs.ndjson`
  - `raw/stage6_aggregate.json`

## Then

- Drift tail:
  - `p95_of_a1_p95 = 19s`
  - `p99_of_a1_p99 = 19s`
  - `max_a1_p99 = 19s`
- Recovery tail:
  - `p95_seconds = 2`
  - `p99_seconds = 2`
  - `max_seconds = 2`
- E1 relative tail:
  - `p95_pct = 8`
  - `p99_pct = 8`
  - `max_pct = 8`

## Conclusion

- Soak sample stays within frozen thresholds (`A1`, `A3`, `E1`) across repeated runs.
