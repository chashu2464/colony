# S7-1 Concurrency Tier Tail (12/24/48)

## Given

- Existing workflow state created by `tests/workflow_board_m21_test.sh` in Stage 7 collection.
- Three tiers from `stage7_tiers_overview.json`: 12/24/48 parallel with total 120/240/480 requests.

## When

- Executed `bash scripts/workflow_board_stage7_collect.sh`.
- Collector issued archive cursor `board.events` requests in parallel and captured per-request output to `stage7_tier_*_responses.ndjson`.

## Then

- Tier 12 (PASS): `ok=120`, `error=0`, `timeout=0`, `error_rate=0%`, `timeout_rate=0%`, `p95/p99/max=3891/4016/4177ms`.
- Tier 24 (CONSTRAINED): `ok=180`, `error=60`, `timeout=60`, `error_rate=25%`, `timeout_rate=25%`, `p95/p99/max=5175/5437/5549ms`.
- Tier 48 (CONSTRAINED): `ok=108`, `error=372`, `timeout=372`, `error_rate=77.5%`, `timeout_rate=77.5%`, `p95/p99/max=5749/6177/6269ms`.

## Raw Evidence

- `raw/stage7_tier_12_responses.ndjson`
- `raw/stage7_tier_12_response_summary.json`
- `raw/stage7_tier_12_latency_summary.json`
- `raw/stage7_tier_24_responses.ndjson`
- `raw/stage7_tier_24_response_summary.json`
- `raw/stage7_tier_24_latency_summary.json`
- `raw/stage7_tier_48_responses.ndjson`
- `raw/stage7_tier_48_response_summary.json`
- `raw/stage7_tier_48_latency_summary.json`

## Conclusion

- Stage 7 fulfilled multi-tier observability and sample-level reproducibility requirements.
- Residual risk remains at high parallel tiers due lock-timeout (`exit_code=3`) concentration.
