# S7-3 D1 Semantic Parity And Audit Traceability

## Given

- D1 parity requirement: existing vs non-existing unauthorized archive targets must return equivalent denial semantics.
- Audit requirement: actor/workflow_id/archive_id/trace_id must be traceable with explicit numerator/denominator.

## When

- For each of 8 windows, collected D1 unauthorized existing/non-existing responses into `raw/stage7_d1_by_window.ndjson`.
- Computed audit field presence per window and aggregate in `raw/stage7_audit_traceability_by_window.ndjson` and `raw/stage7_audit_traceability_summary.json`.

## Then

- D1 semantic parity: `8/8` windows `equal=true`.
- Existing target denial: all windows `error=WF_PERMISSION_DENIED` and `reason=WF_PERMISSION_DENIED`.
- Non-existing target denial: all windows `error=WF_PERMISSION_DENIED` and `reason=WF_PERMISSION_DENIED`.
- Audit traceability (aggregate denominator shown):
  - `actor: 344/344`
  - `workflow_id: 344/344`
  - `archive_id: 344/344`
  - `trace_id: 344/344`

## Raw Evidence

- `raw/stage7_d1_by_window.ndjson`
- `raw/stage7_audit_traceability_by_window.ndjson`
- `raw/stage7_audit_traceability_summary.json`

## Conclusion

- D1 semantic equivalence is continuously maintained across windows and no existence-leak signature was observed.
- Audit traceability completeness satisfies denominator/numerator requirement.
