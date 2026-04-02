# S7-4 OWASP Negative-Path Checks

## Given

- Stage 7 requires negative-path evidence for:
  - authorization bypass
  - input validation
  - logging leakage related denial semantics
  - resource abuse under high frequency

## When

- Collector executed negative-path probes and stored outputs in `raw/stage7_owasp_negative_outputs.ndjson`.

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

## Raw Evidence

- `raw/stage7_owasp_negative_outputs.ndjson`
- Correlated semantic parity: `raw/stage7_d1_by_window.ndjson`

## Conclusion

- Stage 7 negative-path outputs preserve frozen error-code semantics and deny-by-default behavior.
