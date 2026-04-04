# QA Stage 8 Gate Verification (task: d83517e0)

- Verifier: QA Lead (independent raw recomputation + evidence audit)
- Verification time (UTC): 2026-04-03T13:59:01Z
- Input package:
  - `docs/workflow/task-d83517e0/developer-stage8-implementation-2026-04-03.md`
  - `docs/workflow/task-d83517e0/evidence-stage8/00-index.md`
  - `docs/workflow/task-d83517e0/evidence-stage8/01-concurrency-tier-tail.md`
  - `docs/workflow/task-d83517e0/evidence-stage8/02-soak-8h-trend.md`
  - `docs/workflow/task-d83517e0/evidence-stage8/03-d1-semantic-and-audit-traceability.md`
  - `docs/workflow/task-d83517e0/evidence-stage8/04-owasp-resource-abuse-log-leakage.md`
  - `docs/workflow/task-d83517e0/evidence-stage8/raw/*`

## Gate Decision

**PASS (APPROVED WITH CONSTRAINTS)**

WHY:
1. Stage 8 required evidence dimensions are complete and mappable (`S8-1`~`S8-4`), and key metrics are reproducible from raw artifacts.
2. D1 unauthorized semantic parity and OWASP negative-path protocol semantics remain stable; no existence-leak signal detected.
3. High-concurrency tails remain elevated, but this is a documented residual risk under unchanged frozen contract semantics, not a semantic gate failure.

## Assertion Results

- S8-1 Concurrency tiers (12/24/48/64): **PASS (with constraints)**
  - Raw recomputation from `stage8_tier_*_responses.ndjson`:
    - 12 parallel: total=120, ok=116, fail=4, timeout=4, p95/p99/max=4750/5071/5365ms, exit_code={0:116,3:4}
    - 24 parallel: total=240, ok=160, fail=80, timeout=67, p95/p99/max=5537/5664/5729ms, exit_code={0:173,3:67}
    - 48 parallel: total=480, ok=174, fail=306, timeout=276, p95/p99/max=6301/6554/6719ms, exit_code={0:203,1:1,3:276}
    - 64 parallel: total=640, ok=203, fail=437, timeout=391, p95/p99/max=7672/8084/8278ms, exit_code={0:249,3:391}
  - Error-type split from raw non-OK rows:
    - 12: EXIT_3=4
    - 24: EXIT_0=13, EXIT_3=67
    - 48: EXIT_0=29, EXIT_1=1, EXIT_3=276
    - 64: EXIT_0=46, EXIT_3=391

- S8-2 Soak >=8h trend: **PASS**
  - Windowing from raw (`stage8_windowing.json`):
    - UTC range: `2026-04-03T05:39:40Z` ~ `2026-04-03T13:39:40Z`
    - windows=16, interval=30m
  - Trend recomputation (`stage8_soak_trend.json` and `stage8_windows.ndjson`):
    - A1: 19/19/19s
    - A3: 2/2/2s
    - E1: 8/8/8%

- S8-3 D1 semantic parity + audit traceability: **PASS**
  - D1 parity: 16/16 windows `equal=true`
  - existing/non-existing reasons set: both only `WF_PERMISSION_DENIED`
  - Audit numerator/denominator (summed from `stage8_audit_traceability_by_window.ndjson`):
    - actor: 688/688
    - workflow_id: 688/688
    - archive_id: 688/688
    - trace_id: 688/688

- S8-4 OWASP/resource-abuse/log-leak checks: **PASS**
  - Raw file is non-empty and protocol-level fields are present:
    - authz_bypass: exit_code=1, error/reason=`WF_PERMISSION_DENIED`
    - resource_abuse_high_freq: exit_code=1, error/reason=`WF_PERMISSION_DENIED`
    - invalid_cursor: exit_code=1, error=`BOARD_VALIDATION_ERROR`, reason=`BOARD_CURSOR_INVALID`
    - cursor_since_conflict: exit_code=1, error=`BOARD_VALIDATION_ERROR`, reason=`BOARD_CURSOR_CONFLICT`
  - Empty-raw self-check replay:
    - `jq -e '(.authz_bypass.response.raw|length)>0 and (.resource_abuse_high_freq.response.raw|length)>0 and (.input_validation_invalid_cursor.response.raw|length)>0 and (.input_validation_cursor_since_conflict.response.raw|length)>0' raw/stage8_owasp_negative_outputs.ndjson` => `true`

## Security Review (OWASP Top 10 oriented, Stage 8 scope)

1. Broken access control: unauthorized existing/non-existing targets remain semantically equivalent (`WF_PERMISSION_DENIED`), no existence oracle detected.
2. Input validation/integrity: invalid cursor and cursor-conflict return stable validation semantics.
3. Security logging/monitoring: required audit fields are fully traceable (688/688 each required field).
4. Resource abuse behavior: high-frequency concurrency exhibits reliability degradation (timeouts/failures) but not semantic authz bypass.

## P0/P1 Status

- New P0/P1 found in Stage 8 verification: **NONE**.

## Gate Statement

Validated scenarios in this gate:
1. Four-tier concurrency evidence with reproducible tail/error metrics and exit-code split.
2. >=8h soak continuity with UTC window traceability and stable A1/A3/E1 trends.
3. D1 semantic parity across all windows with full audit traceability numerator/denominator.
4. OWASP negative-path protocol semantics with non-empty raw and fail-fast self-check replay.

Residual risks:
1. Tail latency and timeout concentration increase materially at 24/48/64 tiers (especially p99 and timeout rate at 48/64).
2. EXIT_0 non-OK payload failures persist at higher tiers, requiring continued error-taxonomy observation in final closure window.

WHY:
- Stage 8 gate is evidence convergence under frozen semantics. Current package is auditable and reproducible for required assertions, while reliability-tail risks are explicitly retained for post-gate tracking rather than semantic blocking.
