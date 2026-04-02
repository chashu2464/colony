# Stage 5 Evidence S5-2: Archive Concurrency Latency Tail

## Given

- Scenario: archive cursor path burst load with batched parallel requests.
- Concurrency model: 40 requests, 8-way parallel batch.
- Room: `workflow-board-m21-conc-batch-1775135654`
- Window (UTC): `2026-04-02T13:14:19.487Z` ~ `2026-04-02T13:14:32.951Z`

## When

- Run manifest:
  - `raw/stage5_archive_concurrency_batch_run.json`
- Response sample:
  - `raw/stage5_archive_concurrency_batch_responses.ndjson`
  - `raw/stage5_archive_concurrency_batch_response_summary.json`
- Latency extraction:
  - `raw/stage5_archive_concurrency_batch_archive_latencies.json`
  - `raw/stage5_archive_concurrency_batch_latency_summary.json`

## Then

- Response summary:
  - `total=40`, `ok_count=40`, `timeout_count=0`, `invalid_json_count=0`
- Archive latency tail:
  - `count=41`, `p95=54ms`, `p99=54ms`, `max=54ms`

## Conclusion

- Under sampled concurrent archive queries, no lock-timeout surfaced and tail latency remained stable at 54ms.
