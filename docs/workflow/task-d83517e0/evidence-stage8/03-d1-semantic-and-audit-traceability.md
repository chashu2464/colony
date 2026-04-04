# S8-3 D1 Semantic Parity and Audit Traceability

## Given

- Every window must include existing vs non-existing unauthorized comparisons.
- Required semantic: both sides `WF_PERMISSION_DENIED` (no existence leakage).
- Audit fields completeness must use numerator/denominator: actor/workflow_id/archive_id/trace_id.

## When

- Executed `bash scripts/workflow_board_stage8_collect.sh`.
- Read:
  - `raw/stage8_d1_by_window.ndjson`
  - `raw/stage8_audit_traceability_by_window.ndjson`
  - `raw/stage8_audit_traceability_summary.json`

## Then

- D1 semantic parity: `16/16` windows `equal=true`
- Existing/non-existing unauthorized reasons: both `WF_PERMISSION_DENIED`
- Audit completeness summary:
  - total_events=688
  - actor_present=688
  - workflow_id_present=688
  - archive_id_present=688
  - trace_id_present=688

## Raw Evidence

- `raw/stage8_d1_by_window.ndjson`
- `raw/stage8_audit_traceability_by_window.ndjson`
- `raw/stage8_audit_traceability_summary.json`

## Conclusion

- D1 remained semantically equivalent across all windows and audit traceability completeness is 100% by numerator/denominator.
