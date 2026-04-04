# S8-2 Soak Continuity Trend (>=8h)

## Given

- Gate requires >=8h windowed trend with fixed sampling interval in UTC.
- Trend must be traceable to raw per-window records.

## When

- Executed `bash scripts/workflow_board_stage8_collect.sh` (default 16 windows, 30m interval).
- Read:
  - `raw/stage8_windowing.json`
  - `raw/stage8_windows.ndjson`
  - `raw/stage8_soak_trend.json`

## Then

- Window range: `2026-04-03T05:39:40Z` ~ `2026-04-03T13:39:40Z`
- Window count: `16`
- Fixed interval: `30` minutes
- Drift trend (A1): p95_of_a1_p95=19s, p99_of_a1_p99=19s, max_a1_p99=19s
- Recovery trend (A3): p95/p99/max=2/2/2s
- Relative trend (E1): p95/p99/max=8/8/8%

## Raw Evidence

- `raw/stage8_windowing.json`
- `raw/stage8_windows.ndjson`
- `raw/stage8_soak_trend.json`

## Conclusion

- Stage 8 long-window continuity remained stable across all 16 windows with no threshold drift.
