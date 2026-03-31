# Stage 7 QA Retest Report（QA负责人）

- Task ID: `2f6c911d`
- Stage: 7 (Integration Testing) Retest
- Date: `2026-03-31`
- Reviewer: `qa_lead`
- Target Bug: `P1-WF-CONTRACT-BACKTRACK-VERSION-MISSING`
- Conclusion: `PASS`（P1 已归零，允许进入 Stage 8）

## 1. 复测范围（按开发回提要求）

优先复测 `TC-CONTRACT-002`，并补充异常分支与契约落盘一致性检查：
1. backtrack -> notify_server 是否补传第 7 参 `workflow_version`
2. backtrack history 是否补齐 `event_id/workflow_version/routing/dispatch`
3. backtrack dispatch 结果是否落盘 `success/failed`，阻断路由是否落盘 `skipped`

## 2. Given-When-Then 执行记录

### TC-CONTRACT-002A（PASS）backtrack 正常路由契约完整
- Given: `workflow_version=v2` 任务推进到 Stage 2（含已批准 review 与 evidence）
- When: 执行 `backtrack(target_stage=1)`
- Then:
  - `history[-1].workflow_version == "v2"`
  - `history[-1].event_id` 非空
  - `history[-1].routing.next_actor_role/next_actor/decision_source` 存在
  - `history[-1].dispatch.status` 存在（本地无可达路由服务时为 `failed`，并记录 `WF_EVENT_DISPATCH_FAILED`）

证据（独立 worktree + bash trace）：
- `bash -x` 命令轨迹包含：
  - `notify_server 2 1 architect architect <event_id> stage_map v2`
- 代码点：`skills/dev-workflow/scripts/handler.sh:1118`

### TC-CONTRACT-002B（PASS）backtrack 阻断路由 fail-closed 落盘
- Given: 同样推进到 Stage 2，但将目标 owner assignment（`architect`）置空，制造路由缺失
- When: 执行 `backtrack(target_stage=1)`
- Then:
  - `history[-1].routing.result == "block"`
  - `history[-1].routing.reason == "WF_ROUTING_MISSING_ASSIGNMENT"`
  - `history[-1].dispatch.status == "skipped"`
  - `history[-1].dispatch.failure_reason == "WF_STAGE_TRANSITION_INVALID"`

## 3. P1 归零三问

1) 修复内容（What）
- backtrack 调用补传第 7 参数 `workflow_version`
- backtrack history 补齐 `event_id/workflow_version/routing/dispatch`
- backtrack dispatch 结果按 `success/failed/skipped` 统一落盘

2) 引入原因（Why introduced）
- `notify_server` 签名升级为 7 参后，旧 backtrack 调用点未同步迁移，导致参数漂移

3) 归因路径（Attribution）
- Stage 6 双轨改造新增契约字段 -> 回归主要覆盖 next 路径 -> backtrack 未被契约测试覆盖 -> P1 进入 Stage 7 才暴露

## 4. 安全与性能观察

- 安全（A09 Logging/Monitoring）：本次修复后 backtrack 审计字段与 next 对齐，告警聚合与追溯一致性恢复
- 未发现新增 SQL 注入 / XSS / CSRF 攻击面
- 性能：新增字段拼装与落盘为常量级开销，未见显著回归

## 5. 附加发现（非阻断）

- 当前仓库内脚本 `tests/workflow_v2_handler_test.sh` 与 `tests/workflow_test.sh` 在本地环境存在用例前置条件不一致问题（与新 gate 规则/脏树约束耦合），导致“脚本级全绿”结论不稳定。
- 该问题不影响本次 P1 修复有效性判定，但建议后续修正脚本夹具，避免误报。

## 6. 阶段门禁声明

- Gate 结论：`PASS`
- 已验证场景：
  1. TC-CONTRACT-002 正常分支（契约字段完整 + 7 参调用）
  2. TC-CONTRACT-002 异常分支（路由阻断 fail-closed + dispatch skipped 落盘）
- 遗留风险：
  1. 本地无可达 workflow route 服务时，dispatch 会稳定落盘 `failed/WF_EVENT_DISPATCH_FAILED`（属环境限制，非契约缺陷）
  2. 现有集成脚本夹具需要与最新 gate 前置条件对齐（建议作为后续测试资产治理项）
