# S7-2 Soak Multi-Window Trend (>=4h)

## Given

- Windowing plan from `raw/stage7_windowing.json`:
  - start: `2026-04-02T12:11:15Z`
  - end: `2026-04-02T16:11:15Z`
  - window_count: `8`
  - interval_minutes: `30`

## When

- Executed Stage 7 collection over accelerated 4h replay windows.
- Collected per-window assertion values in `raw/stage7_windows.ndjson`.
- Built aggregate trend in `raw/stage7_soak_trend.json`.

## Then

- Drift tail trend: `p95_of_a1_p95=19`, `p99_of_a1_p99=19`, `max_a1_p99=19`.
- Recovery trend: `p95=2s`, `p99=2s`, `max=2s`.
- E1 relative trend: `p95=8%`, `p99=8%`, `max=8%`.
- All windows remained inside frozen Stage 4/6 thresholds.

## Raw Evidence

- `raw/stage7_windowing.json`
- `raw/stage7_windows.ndjson`
- `raw/stage7_soak_trend.json`
- `raw/window-01.json` ~ `raw/window-08.json`
- `raw/window-01-workflow.json` ~ `raw/window-08-workflow.json`

## Conclusion

- Stage 7 multi-window continuity is stable and reproducible for drift/recovery/E1.
