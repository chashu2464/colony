# QA Stage 7 Gate Verification (task: d83517e0)

- Verifier: QA Lead (independent check)
- Verification time (UTC): 2026-04-03T14:00:00Z (approx)
- Scope: Stage 7 evidence hardening gate
- Input package: `docs/workflow/task-d83517e0/evidence-stage7/` (00~04 + raw)

## Gate Decision

**BLOCKED**

Reason: Security negative-path evidence (S7-4) is inconsistent with文档结论 and not auditable at protocol level.

## Assertion Results

- S7-1 Concurrency tier tail: **PASS (with constraints)**
  - Recomputed summaries match declared values:
    - tier12: ok=120/120, timeout=0, p95/p99/max=3891/4016/4177ms
    - tier24: ok=180/240, timeout=60, p95/p99/max=5175/5437/5549ms
    - tier48: ok=108/480, timeout=372, p95/p99/max=5749/6177/6269ms
  - Constraint: high timeout concentration at tier24/48 remains residual risk.

- S7-2 Soak multi-window trend: **PASS**
  - 8 windows in 4h (30m interval), trend summaries consistent:
    - A1: 19/19/19s
    - A3: 2/2/2s
    - E1: 8/8/8%

- S7-3 D1 semantic parity + audit traceability: **PASS**
  - D1 parity: 8/8 windows equal=true for existing/non-existing unauthorized targets
  - Aggregate traceability: actor/workflow_id/archive_id/trace_id = 344/344

- S7-4 OWASP negative-path checks: **BLOCKED (P1)**
  - `raw/stage7_owasp_negative_outputs.ndjson` contains empty outputs only:
    - authz_bypass: `exit_code=4`, `response.raw=""`
    - resource_abuse_high_freq: `exit_code=4`, `response.raw=""`
    - input_validation_invalid_cursor: `raw=""`
    - input_validation_cursor_since_conflict: `raw=""`
  - This cannot prove expected fixed semantics (`WF_PERMISSION_DENIED`, `BOARD_CURSOR_INVALID`, `BOARD_CURSOR_CONFLICT`) and cannot satisfy OWASP negative-path gate.

## P1 Record

- Bug ID: `P1-SEC-EVIDENCE-OWASP-001`
- Severity: P1
- Category: Security test evidence integrity / gate blocking

### Reproduction Steps

1. Open `docs/workflow/task-d83517e0/evidence-stage7/04-owasp-negative-paths.md` and note the expected outcomes claimed in Then section.
2. Open raw artifact `docs/workflow/task-d83517e0/evidence-stage7/raw/stage7_owasp_negative_outputs.ndjson`.
3. Observe the only record has empty payloads and `exit_code=4` for key probes.
4. Compare with expected fixed error-code semantics; there is no protocol-level response body to validate.

### Observed

- Raw outputs are empty and non-auditable.
- Evidence file conclusions overstate verification coverage.

### Expected

- Each OWASP negative probe should include auditable protocol response body and status semantics, at minimum:
  - authz/resource abuse: `WF_PERMISSION_DENIED`
  - invalid cursor: `BOARD_VALIDATION_ERROR/BOARD_CURSOR_INVALID`
  - cursor+since conflict: `BOARD_VALIDATION_ERROR/BOARD_CURSOR_CONFLICT`

## P0/P1 Three-Question Closure Requirement (must answer before unblocking)

1. 修复内容: 哪些采集/解析逻辑被修复以保证 OWASP negative raw 非空且可复算。
2. 引入原因: 为什么会出现 `exit_code=4 + raw empty` 且未被阶段内自检拦截。
3. 归因路径: 从脚本/命令到证据文档的链路中，具体哪一环缺失校验。

## Required Rework (minimum)

1. Re-run Stage 7 OWASP probes and regenerate `raw/stage7_owasp_negative_outputs.ndjson` with full protocol responses.
2. Update `04-owasp-negative-paths.md` with Given-When-Then including command/script, raw output excerpts, and conclusion.
3. Update `00-index.md` mapping if artifact names/paths changed.
4. Add a collector self-check: fail the run if any OWASP probe returns empty raw output.

## Gate Statement

Validated scenarios: concurrency-tier observability, multi-window soak continuity, D1 parity + audit traceability.

Residual risks: high-concurrency tail latency and timeout concentration remain; OWASP negative-path evidence is currently invalid and blocks Stage 7 closure.
