# Stage 6 Evidence S6-3: Authz Status Semantic Capture

## Given

- Requirement: provide protocol-equivalent status semantics for D1 auditability.
- Source: unauthorized archive read checks (existing vs non-existing target).

## When

- Source file:
  - `raw/stage6_d1_status_semantics.ndjson`

## Then

- Existing target unauthorized read:
  - `exit_code = 1`
  - `error = WF_PERMISSION_DENIED`
  - `reason = WF_PERMISSION_DENIED`
  - `status_semantic = DENIED`
- Non-existing target unauthorized read:
  - `exit_code = 1`
  - `error = WF_PERMISSION_DENIED`
  - `reason = WF_PERMISSION_DENIED`
  - `status_semantic = DENIED`

## Conclusion

- Existing/non-existing targets are semantically identical and fail-closed.
- D1 now includes explicit status semantic evidence alongside response body fields.
