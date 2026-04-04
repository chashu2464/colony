# S7-4 OWASP Negative-Path Checks

## Given

- Stage 7 requires negative-path evidence for:
  - authorization bypass
  - input validation
  - logging leakage related denial semantics
  - resource abuse under high frequency

## When

- Executed `bash scripts/workflow_board_stage7_collect.sh`.
- Collector executed negative-path probes and stored outputs in `raw/stage7_owasp_negative_outputs.ndjson`.
- Collector self-check is enabled: any OWASP probe with empty `response.raw` exits non-zero immediately.

## Then

- Authorization bypass probe:
  - `exit_code=1`
  - response `error/reason=WF_PERMISSION_DENIED`
- Resource abuse high-frequency probe:
  - `exit_code=1`
  - response `error/reason=WF_PERMISSION_DENIED`
- Input validation invalid cursor:
  - `error=BOARD_VALIDATION_ERROR`
  - `reason=BOARD_CURSOR_INVALID`
- Input validation cursor+since conflict:
  - `error=BOARD_VALIDATION_ERROR`
  - `reason=BOARD_CURSOR_CONFLICT`
- No resource existence signal is emitted in unauthorized responses.

Observed protocol-level raw (from `raw/stage7_owasp_negative_outputs.ndjson`):
- `authz_bypass.response.raw`:
  - `{"error":"WF_PERMISSION_DENIED","reason":"WF_PERMISSION_DENIED","message":"actor is not assigned to this workflow"}`
- `resource_abuse_high_freq.response.raw`:
  - `{"error":"WF_PERMISSION_DENIED","reason":"WF_PERMISSION_DENIED","message":"actor is not assigned to this workflow"}`
- `input_validation_invalid_cursor.response.raw`:
  - `{"error":"BOARD_VALIDATION_ERROR","reason":"BOARD_CURSOR_INVALID","message":"cursor_version is invalid"}`
- `input_validation_cursor_since_conflict.response.raw`:
  - `{"error":"BOARD_VALIDATION_ERROR","reason":"BOARD_CURSOR_CONFLICT","message":"cursor and since_event_id cannot be used together"}`

## Raw Evidence

- `raw/stage7_owasp_negative_outputs.ndjson`
- Correlated semantic parity: `raw/stage7_d1_by_window.ndjson`

## Conclusion

- Stage 7 negative-path outputs preserve frozen error-code semantics and deny-by-default behavior.
- Empty-raw evidence gap is closed by protocol-level raw capture and collector self-check gating.
