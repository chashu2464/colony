# S7-1 Concurrency Tier Tail (12/24/48)

## Given

- Existing workflow state created by `tests/workflow_board_m21_test.sh` in Stage 7 collection.
- Three tiers from `stage7_tiers_overview.json`: 12/24/48 parallel with total 120/240/480 requests.

## When

- Executed `bash scripts/workflow_board_stage7_collect.sh`.
- Collector issued archive cursor `board.events` requests in parallel and captured per-request output to `stage7_tier_*_responses.ndjson`.

## Then

- Tier 12 (PASS): `ok=120`, `error=0`, `timeout=0`, `error_rate=0%`, `timeout_rate=0%`, `p95/p99/max=3789/4021/4035ms`.
- Tier 24 (CONSTRAINED): `ok=174`, `error=66`, `timeout=66`, `error_rate=27.5%`, `timeout_rate=27.5%`, `p95/p99/max=5151/5426/5586ms`.
- Tier 48 (CONSTRAINED): `ok=210`, `error=270`, `timeout=270`, `error_rate=56.25%`, `timeout_rate=56.25%`, `p95/p99/max=6108/6349/6551ms`.

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
- Tier error-type split (for risk attribution): 24 parallel `exit_code {0:174,3:66}`, 48 parallel `exit_code {0:210,3:270}`.
