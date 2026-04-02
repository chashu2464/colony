# M2.1 Stage 6 Evidence Index (task: d83517e0)

- Evidence window (UTC): `2026-04-02T13:58:22Z` ~ `2026-04-02T14:00:33Z`
- Scope: soak continuity, higher-concurrency archive tail, D1 status semantic capture
- Raw dir: `docs/workflow/task-d83517e0/evidence-stage6/raw/`

## Assertion Mapping

- S6-1 soak continuity -> `01-soak-tail-continuity.md` (PASS)
- S6-2 higher-concurrency archive tail -> `02-higher-concurrency-tail.md` (PASS)
- S6-3 D1 status semantics + non-existence leakage parity -> `03-authz-status-semantic.md` (PASS)

## Raw Artifacts

- `stage6_window.json`
- `stage6_runs.ndjson`
- `stage6_aggregate.json`
- `stage6_burst_responses.ndjson`
- `stage6_burst_summary.json`
- `stage6_burst_latency_summary.json`
- `stage6_d1_status_semantics.ndjson`
- `run-01.json` ~ `run-06.json`
- `run-01-workflow.json` ~ `run-06-workflow.json`

## Stage 6 Status

- Current decision: READY FOR QA STAGE 6 REVIEW
- Residual risk: keep extending soak horizon beyond current sample window when production-like traffic window is available.
