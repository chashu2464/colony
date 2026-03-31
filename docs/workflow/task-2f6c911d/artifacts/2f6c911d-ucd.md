---
ucd_version: 1.0.0
task_id: 2f6c911d
artifact_path: docs/workflow/task-2f6c911d/artifacts/2f6c911d-ucd.md
baseline_source: clowder-5stage-reference-v1
---

## scope
新 workflow 控制面（阶段机、路由、审计）与协作面（告示牌模式、跨猫协作）规范，不含具体业务功能。

## interaction_states
normal / stage_blocked / review_required / waiting_handoff / completed

## visual_constraints
沿用当前 workflow 文档样式与命名约定；新增阶段名保持英文主名 + 中文释义。

## assets
https://github.com/zts212653/clowder-ai

## acceptance_criteria
- UCD-AC-1：新 5 阶段名称、角色映射、门禁规则具备可机读定义。
- UCD-AC-2：告示牌模式和跨猫协作以“可选扩展”方式挂接，不影响主链路。
- UCD-AC-3：Stage 级审计字段可串联阶段推进、路由决策、消息派发结果。

## non_goals
不在本次蓝图内改写业务代码执行器；不引入新的分布式调度器。

## risk_notes
若缺少旧状态到新阶段映射策略，会造成中途任务迁移歧义；需以“仅新任务启用新流程”规避。
