# M2.1 Stage 8 Evidence Index (task: d83517e0)

- Evidence window (UTC): `2026-04-03T05:39:40Z` ~ `2026-04-03T13:39:40Z`
- Collection command: `bash scripts/workflow_board_stage8_collect.sh`
- Raw dir: `docs/workflow/task-d83517e0/evidence-stage8/raw/`

## Assertion -> Evidence Mapping

- S8-1 Concurrency convergence tiers (12/24/48/64, timeout/error/exit_code/reason): `01-concurrency-tier-tail.md`
- S8-2 Long-window soak continuity (>=8h, 30m interval, A1/A3/E1 trend): `02-soak-8h-trend.md`
- S8-3 D1 semantic parity + audit traceability denominator/numerator: `03-d1-semantic-and-audit-traceability.md`
- S8-4 OWASP negative probes + resource abuse/log leakage checks: `04-owasp-resource-abuse-log-leakage.md`

## Raw Artifacts

- Window/trend: `stage8_windowing.json`, `stage8_windows.ndjson`, `stage8_soak_trend.json`
- D1/audit: `stage8_d1_by_window.ndjson`, `stage8_audit_traceability_by_window.ndjson`, `stage8_audit_traceability_summary.json`
- Concurrency tiers:
  - `stage8_tier_12_responses.ndjson`, `stage8_tier_12_response_summary.json`, `stage8_tier_12_latency_summary.json`
  - `stage8_tier_24_responses.ndjson`, `stage8_tier_24_response_summary.json`, `stage8_tier_24_latency_summary.json`
  - `stage8_tier_48_responses.ndjson`, `stage8_tier_48_response_summary.json`, `stage8_tier_48_latency_summary.json`
  - `stage8_tier_64_responses.ndjson`, `stage8_tier_64_response_summary.json`, `stage8_tier_64_latency_summary.json`
- OWASP/resource abuse: `stage8_owasp_seed.json`, `stage8_owasp_negative_outputs.ndjson`

## Stage 8 Status

- Current decision: READY FOR QA REVIEW
- Constraint: frozen protocol semantics unchanged; reliability risk remains concentrated at higher concurrency tiers.
