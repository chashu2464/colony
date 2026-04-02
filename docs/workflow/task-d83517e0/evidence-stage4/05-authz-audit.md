# 05 Authz Audit (D1)

## Assertion D1 Status

- D1 归档越权统一 `WF_PERMISSION_DENIED` 且无资源存在性泄露: PASS

## Given

- 归档访问与在线访问复用同一 actor-assignment 校验
- 审计字段要求：`actor/workflow_id/archive_id/trace_id`

## When

- 未分配 actor 调用 `board.events`
- 未分配 actor 使用 archive cursor 访问“存在目标”（`event_id` 命中已归档事件）
- 未分配 actor 使用 archive cursor 访问“不存在目标”（`event_id=be_missing_archive_event`）
- 分配 actor 执行 `board.archive` 与 `board.events`（archive 路径）
- 执行：`KEEP_STATE=1 bash tests/workflow_board_m21_test.sh`

## Then (Raw Output)

- `raw/m21_test_output.json`: `D1.unauthorized_archive_read_denied=true`
- `raw/d1_unauthorized_archive_existing.json`: 未授权访问存在目标响应
- `raw/d1_unauthorized_archive_nonexistent.json`: 未授权访问不存在目标响应
- `raw/d1_unauthorized_semantic_parity.json`: `existing/nonexistent` 协议签名一致（`equal=true`）
- `raw/m21_board_audit.json`: 审计记录包含 `actor/workflow_id/archive_id/trace_id` 且 action 覆盖 `board.archive`/`board.events`
- 错误响应（越权）固定为 `WF_PERMISSION_DENIED`，且存在/不存在目标返回语义一致，不暴露 archive/workflow 是否存在

## Conclusion

- D1 完整闭环：鉴权同强度 + 可追溯审计 + 协议级无存在性泄露证据齐备。
