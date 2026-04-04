# S8-4 OWASP Negative Paths, Resource Abuse, and Log Leakage

## Given

- Stage 8 requires protocol-level negative-path raw for:
  - authz bypass
  - resource abuse under high frequency
  - input validation errors
  - leakage-safe denial semantics
- Collector must fail fast if any OWASP probe has empty raw.

## When

- Executed `bash scripts/workflow_board_stage8_collect.sh`.
- Ran self-check command:
  - `jq -e '(.authz_bypass.response.raw|length)>0 and (.resource_abuse_high_freq.response.raw|length)>0 and (.input_validation_invalid_cursor.response.raw|length)>0 and (.input_validation_cursor_since_conflict.response.raw|length)>0' raw/stage8_owasp_negative_outputs.ndjson`
- Read protocol outputs from `raw/stage8_owasp_negative_outputs.ndjson`.

## Then

- authz_bypass: `exit_code=1`, `error/reason=WF_PERMISSION_DENIED`
- resource_abuse_high_freq: `exit_code=1`, `error/reason=WF_PERMISSION_DENIED`
- invalid_cursor: `exit_code=1`, `error=BOARD_VALIDATION_ERROR`, `reason=BOARD_CURSOR_INVALID`
- cursor_since_conflict: `exit_code=1`, `error=BOARD_VALIDATION_ERROR`, `reason=BOARD_CURSOR_CONFLICT`
- All four probes have non-empty protocol-level raw.
- Unauthorized denials expose no resource-existence differentiator in protocol semantics.

## Raw Evidence

- `raw/stage8_owasp_negative_outputs.ndjson`
- `raw/stage8_owasp_seed.json`
- semantic parity correlation: `raw/stage8_d1_by_window.ndjson`

## Conclusion

- OWASP/security negative-path semantics are preserved and auditable with non-empty protocol raw.
- empty-raw gate remains enforced through collector self-check and replay command.
