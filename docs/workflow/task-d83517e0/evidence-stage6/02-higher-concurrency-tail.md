# Stage 6 Evidence S6-2: Higher-Concurrency Archive Tail

## Given

- Command: `bash scripts/workflow_board_stage6_collect.sh 6 120 12`
- Burst profile: `120` requests, `12` parallel workers.

## When

- Source files:
  - `raw/stage6_burst_responses.ndjson`
  - `raw/stage6_burst_summary.json`
  - `raw/stage6_burst_latency_summary.json`

## Then

- Response summary:
  - `total = 120`
  - `ok_count = 120`
  - `fail_count = 0`
- Latency tail:
  - `p95_ms = 3886`
  - `p99_ms = 4045`
  - `max_ms = 4058`

## Conclusion

- Under a higher total request volume than Stage 5, archive query path remained error-free in this sample window.
