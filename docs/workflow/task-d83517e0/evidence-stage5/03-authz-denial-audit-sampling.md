# Stage 5 Evidence S5-3: Authz Denial + Audit Sampling

## Given

- Denial semantics sampled from 6 Stage 5 runs (`raw/stage5_aggregate.json`).
- Audit traceability sampled from workflow audit logs (`raw/stage5_audit_sampling.json` and `raw/stage5_archive_concurrency_batch_audit_sample.json`).

## When

- Aggregated denial parity checks:
  - `raw/run-01.json` ~ `raw/run-06.json`
  - `raw/stage5_runs.ndjson`
- Audit extraction source:
  - `raw/run-01-workflow.json` ~ `raw/run-06-workflow.json`
  - `raw/stage5_archive_concurrency_batch_run.json`

## Then

- Unauthorized denial semantic parity:
  - `samples=6`
  - `semantic_parity_true_count=6`
  - existing/non-existing targets both return:
    - `error=WF_PERMISSION_DENIED`
    - `reason=WF_PERMISSION_DENIED`
    - `message=actor is not assigned to this workflow`
- Audit traceability sampling:
  - `total_audit_records=258`
  - `traceable_records=258`
  - `traceable_ratio=1.0`
  - trace fields present: `actor/workflow_id/archive_id/trace_id`

## Conclusion

- Permission-denied semantics remain fail-closed and non-leaking across sampled runs.
- Audit records in sampled traffic remain fully traceable for actor/workflow/archive/trace correlation.
