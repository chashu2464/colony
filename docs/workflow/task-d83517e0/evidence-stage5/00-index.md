# M2.1 Stage 5 Continuous Monitoring Evidence Index (task: d83517e0)

- Evidence generated at (UTC): 2026-04-02T13:11:16Z ~ 2026-04-02T13:14:32.951Z
- Scope: drift/recovery tail, archive concurrent latency tail, permission-denied audit sampling
- Raw dir: `docs/workflow/task-d83517e0/evidence-stage5/raw/`

## Assertion Mapping

- S5-1 drift/recovery tail continuity -> `01-drift-recovery-tail.md` (PASS)
- S5-2 archive concurrent latency tail -> `02-archive-concurrency-latency-tail.md` (PASS)
- S5-3 authz denial semantic parity + audit traceability sampling -> `03-authz-denial-audit-sampling.md` (PASS)

## Raw Artifacts

- `stage5_runs.ndjson`
- `stage5_aggregate.json`
- `stage5_audit_sampling.json`
- `stage5_archive_concurrency_batch_run.json`
- `stage5_archive_concurrency_batch_responses.ndjson`
- `stage5_archive_concurrency_batch_response_summary.json`
- `stage5_archive_concurrency_batch_archive_latencies.json`
- `stage5_archive_concurrency_batch_latency_summary.json`
- `stage5_archive_concurrency_batch_audit_sample.json`
- `run-01.json` ~ `run-06.json`
- `run-01-workflow.json` ~ `run-06-workflow.json`

## Stage 5 Status

- Current decision: READY FOR QA STAGE 5 REVIEW
- Residual focus: extend soak horizon to multi-hour window and keep watching queue-depth/latency tails under production-like traffic.
