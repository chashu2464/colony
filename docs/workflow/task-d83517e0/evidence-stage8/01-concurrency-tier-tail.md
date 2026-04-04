# S8-1 Concurrency Convergence (12/24/48/64)

## Given

- Gate requires same-schema metrics for four tiers:
  - total/ok/fail
  - timeout rate / error rate
  - p95/p99/max
  - exit_code distribution and error-type breakdown

## When

- Executed `bash scripts/workflow_board_stage8_collect.sh`.
- Aggregates read from:
  - `raw/stage8_tier_{12,24,48,64}_response_summary.json`
  - `raw/stage8_tier_{12,24,48,64}_latency_summary.json`

## Then

- 12 parallel: total=120, ok=116, fail=4, timeout=4, timeout_rate=3.3333%, error_rate=3.3333%, p95/p99/max=4750/5071/5365ms, exit_code={0:116,3:4}, errors={Lock timeout:4}
- 24 parallel: total=240, ok=160, fail=80, timeout=67, timeout_rate=27.9167%, error_rate=33.3333%, p95/p99/max=5537/5664/5729ms, exit_code={0:173,3:67}, errors={EXIT_0:13,Lock timeout:67}
- 48 parallel: total=480, ok=174, fail=306, timeout=276, timeout_rate=57.5%, error_rate=63.75%, p95/p99/max=6301/6554/6719ms, exit_code={0:203,1:1,3:276}, errors={EXIT_0:29,EXIT_1:1,Lock timeout:276}
- 64 parallel: total=640, ok=203, fail=437, timeout=391, timeout_rate=61.09375%, error_rate=68.28125%, p95/p99/max=7672/8084/8278ms, exit_code={0:249,3:391}, errors={EXIT_0:46,Lock timeout:391}

## Raw Evidence

- `raw/stage8_tier_12_responses.ndjson`
- `raw/stage8_tier_24_responses.ndjson`
- `raw/stage8_tier_48_responses.ndjson`
- `raw/stage8_tier_64_responses.ndjson`

## Conclusion

- Higher concurrency still amplifies timeout/failure tails.
- Exit-code and error-type split is now explicit and replayable from raw.
