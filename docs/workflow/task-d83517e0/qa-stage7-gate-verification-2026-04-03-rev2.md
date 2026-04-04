# QA Stage 7 Gate Verification (task: d83517e0, rev2)

- Verifier: QA Lead (independent rerun + raw recomputation)
- Verification time (UTC): 2026-04-02T16:26:30Z
- Scope: Stage 7 re-submission for BLOCKED item `P1-SEC-EVIDENCE-OWASP-001`
- Input package: `docs/workflow/task-d83517e0/evidence-stage7/` (00~04 + raw)

## Gate Decision

**PASS (APPROVED WITH CONSTRAINTS)**

WHY:
1. Previously blocked security evidence (`S7-4`) is now protocol-level auditable and non-empty.
2. Independent rerun succeeded (`bash scripts/workflow_board_stage7_collect.sh` exited 0) and regenerated raw artifacts.
3. Recomputed semantics match frozen contract for authz denial and cursor validation conflict paths.

## Assertion Results

- S7-1 Concurrency tier tail: **PASS (with constraints)**
  - tier12: ok=120/120, timeout=0, p95/p99/max=4052/4243/4317ms
  - tier24: ok=176/240, timeout=64, p95/p99/max=5392/5566/5614ms
  - tier48: ok=196/480, timeout=284, p95/p99/max=6379/6693/6917ms
  - Exit-code split (raw recomputed):
    - tier24: `{0:176, 3:64}`
    - tier48: `{0:196, 3:284}`

- S7-2 Soak multi-window trend: **PASS**
  - 8 windows / 4h / 30m interval (`2026-04-02T12:20:41Z` ~ `2026-04-02T16:20:41Z`)
  - Trend recomputation:
    - A1: 19/19/19s
    - A3: 2/2/2s
    - E1: 8/8/8%

- S7-3 D1 semantic parity + audit traceability: **PASS**
  - D1 parity: `8/8` windows (`existing` vs `non-existing` unauthorized targets remain semantic-equivalent)
  - Audit traceability numerator/denominator:
    - actor: 344/344
    - workflow_id: 344/344
    - archive_id: 344/344
    - trace_id: 344/344

- S7-4 OWASP negative-path checks: **PASS (P1 closed)**
  - Raw artifact: `docs/workflow/task-d83517e0/evidence-stage7/raw/stage7_owasp_negative_outputs.ndjson`
  - File is non-empty (850 bytes), protocol-level raw is present for all four probes.
  - Recomputed probe semantics:
    - authz_bypass: `exit_code=1`, `reason=WF_PERMISSION_DENIED`
    - resource_abuse_high_freq: `exit_code=1`, `reason=WF_PERMISSION_DENIED`
    - input_validation_invalid_cursor: `exit_code=1`, `reason=BOARD_CURSOR_INVALID`
    - input_validation_cursor_since_conflict: `exit_code=1`, `reason=BOARD_CURSOR_CONFLICT`

## P1 Closure Record (`P1-SEC-EVIDENCE-OWASP-001`)

- 修复内容: OWASP probes now persist protocol-level raw (`2>&1`) and enforce fail-fast self-check on empty raw.
- 引入原因: old collector path allowed empty/omitted raw on probe failure, causing evidence/document mismatch.
- 归因路径: `scripts/workflow_board_stage7_collect.sh` probe capture -> `raw/stage7_owasp_negative_outputs.ndjson` -> `04-owasp-negative-paths.md` Then statement.

QA verification verdict: three-question closure is complete and consistent with rerun evidence.

## Gate Statement

Validated scenarios:
1. Multi-window soak continuity and drift/recovery trend stability.
2. Tiered concurrency tail observability with raw recomputation.
3. D1 unauthorized semantic parity and full audit traceability.
4. OWASP negative-path protocol semantics with non-empty auditable raw.

Residual risks (carry forward to Stage 8):
1. High-concurrency tail latency and timeout concentration at tier24/48 remain significant.
2. Longer soak + higher concurrency combined stress still required for further convergence.
