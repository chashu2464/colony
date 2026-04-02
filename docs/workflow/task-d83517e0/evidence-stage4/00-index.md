# M2.1 Stage 4 Evidence Index (task: d83517e0)

- Evidence window (UTC): 2026-04-02T11:33:56.502Z ~ 2026-04-02T11:34:07.703Z
- Replay room: `workflow-board-m21-1775129633`
- Raw dir: `docs/workflow/task-d83517e0/evidence-stage4/raw/`

## Assertion Mapping

- A1 调度漂移 p95<=20s, p99<30s -> `01-scheduler-retry-recovery.md` (PASS)
- A2 退避 1/2/4/8/15m + fail-closed -> `01-scheduler-retry-recovery.md` (PASS)
- A3 失败堆积恢复 <30m -> `01-scheduler-retry-recovery.md` (PASS)
- B1 幂等重复不重复写 -> `02-idempotency-consistency.md` (PASS)
- C1 跨归档分页单调去重 -> `03-cross-archive-pagination.md` (PASS)
- C2/C3/C4 参数与错误码固定 -> `04-validation-errors.md` (PASS)
- D1 归档越权统一拒绝 + 无存在性泄露 -> `05-authz-audit.md` (PASS; raw: `d1_unauthorized_archive_existing.json`, `d1_unauthorized_archive_nonexistent.json`, `d1_unauthorized_semantic_parity.json`)
- E1 归档期 p95 延迟增幅 <10% -> `06-observability-metrics.md` (PASS)

## Gate Readiness

- Stage 4 A1-E1: READY FOR QA RE-GATE
- OWASP 覆盖：鉴权绕过、输入校验、日志可追溯、高频请求资源滥用（见 05/06）
- P1: `P1-TEST-EVIDENCE-001` 已补件（协议级 D1 原始响应 + 存在性泄露对照）
- P2: `P2-DATA-FORMAT-001` 已修复（时间戳规范化 + 回归断言）
