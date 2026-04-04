# M2.1 Stage 7 Evidence Index (task: d83517e0)

- Evidence window (UTC): `2026-04-02T12:11:15Z` ~ `2026-04-02T16:11:15Z`
- Collection command: `bash scripts/workflow_board_stage7_collect.sh`
- Raw dir: `docs/workflow/task-d83517e0/evidence-stage7/raw/`

## Assertion -> Evidence Mapping

- S7-1 Concurrency tier tail (12/24/48, distribution + error/timeout): `01-concurrency-tier-tail.md`
- S7-2 Soak continuity trend (>=4h, fixed interval windows): `02-soak-multi-window-trend.md`
- S7-3 D1 semantic parity + audit traceability (per window): `03-d1-semantic-and-audit-traceability.md`
- S7-4 OWASP negative-path checks (authz/input/log/resource abuse): `04-owasp-negative-paths.md`

## Raw Artifacts

- Windowing/trend: `stage7_windowing.json`, `stage7_windows.ndjson`, `stage7_soak_trend.json`
- D1/audit: `stage7_d1_by_window.ndjson`, `stage7_audit_traceability_by_window.ndjson`, `stage7_audit_traceability_summary.json`
- Concurrency tiers:
  - `stage7_tier_12_responses.ndjson`, `stage7_tier_12_response_summary.json`, `stage7_tier_12_latency_summary.json`
  - `stage7_tier_24_responses.ndjson`, `stage7_tier_24_response_summary.json`, `stage7_tier_24_latency_summary.json`
  - `stage7_tier_48_responses.ndjson`, `stage7_tier_48_response_summary.json`, `stage7_tier_48_latency_summary.json`
- OWASP negative outputs: `stage7_owasp_negative_outputs.ndjson`

## Stage 7 Status

- Current decision: RE-SUBMIT READY (OWASP raw evidence hardened)
- Constraint: keep lock-timeout risk visible in gate statement; do not alter frozen protocol semantics.
