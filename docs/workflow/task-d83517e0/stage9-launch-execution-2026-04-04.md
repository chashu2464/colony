# Stage 9 上线执行记录

- 任务: d83517e0
- 执行时间(UTC): 2026-04-04T02:35:48Z ~ 2026-04-04T02:39:27Z
- 执行人: developer
- 执行分支: feature/quick-1775270148
- 契约冻结版本: a0ca54bbfd3c5ba53c667e22b47730344721ae44

## 1) 上线前门禁执行

1. 契约一致性核对
- `git diff c7e9a8a..a0ca54b -- src/extensions/board/{scheduler.ts,service.ts,types.ts,config.ts,auth.ts}`
- 结果: 关键契约字段无 diff（通过）

2. 构建与测试
- `npm ci`（补齐依赖）
- `npm run build:server`（通过）
- `npm run test:int`（通过）
- `mkdir -p coverage/.tmp && npm run test:unit`（通过；首次并行覆盖率目录缺失后已修复）

3. 运行实例检查
- `lsof -nP -iTCP:3001 -sTCP:LISTEN` 显示已有 node 进程监听
- `curl http://localhost:3001/api/sessions` 返回 8
- `curl http://localhost:3001/api/sessions/saved` 返回 8

## 2) 上线链路冒烟（dev-workflow board.*）

说明: board 能力通过 `skills/dev-workflow/scripts/handler.sh` 调用，不是 `/api/board/*` HTTP 路由。

- 使用临时房间 `launch-smoke-1775270365` 执行：
1. `init` -> 成功，workflow_version=v2, board_mode=true
2. `board.sync` -> `status=ok`, `retry_count=0`
3. `board.events` -> 返回 `events=[]`, `metadata.layer=online`
4. `board.archive` -> 成功，生成 `archive_id=ba_f1da853e-db9d-4f78-87ae-731fd03f6ee2`

## 3) 结论

- 上线执行状态: 已执行并通过本地门禁与链路冒烟。
- 后续约束: 监控面板/告警规则/生产环境回滚演练按 Stage 9 约束在上线后 24h 内补齐。
