# Proposal A Stage 0 开发侧输入（Phase 1）

## 边界确认
- 仅实施 `dev-workflow` 集成。
- 新增独立 `skills/ucd/`，不改 `quick-task`（延期到 Phase 2）。

## 三项硬约束（已纳入）
1. 单一真源：`ucd_required` 仅在 workflow init / 明确 update checkpoint 计算一次并审计落盘；后续阶段只读。
2. 稳定契约：`*-ucd.md` 除 7 个必填块外，强制 version 头字段：`ucd_version`、`task_id`、`artifact_path`、`baseline_source`。
3. 资产校验分层：Phase 1 仅校验引用格式与安全性（scheme/path/注入），不做远端可达性阻断。

## 接口草案（供 Stage 1/2 细化）
- Trigger: 输入任务描述/文件证据/UI 显式请求，输出 `ucd_required` + `reason_codes` + `override_reason?`。
- UCD Artifact: 输入设计产物，输出标准化 `*-ucd.md` + `ucd_version`。
- Implementation Evidence: 输入实现结果，输出 `UCD-AC-*` 映射 + 所用 `ucd_version`。
- Validation: 输入 UCD/资产引用/history 审计字段，输出 pass/block + block_reason。

## fail-closed 阻断条件（初稿）
- `ucd_required=true` 但 UCD 文件缺失。
- 必填 section 缺失或 schema/version 头缺失。
- `ucd_version` 与实现/测试证据不一致。
- 资产引用命中危险 scheme/path/注入模式。

## 测试矩阵（分支全覆盖）
- 正常：UI 任务触发并通过完整 UCD。
- 异常：缺字段/版本不一致/危险资产全部阻断。
- 边界：纯后端任务 `ucd_required=false` 且不注入 UCD。
- 安全：只按白名单 section 解析，不执行富文本/脚本。

## 下一步
- Stage 1/2 中优先固化 schema/trigger/audit 字段，再接技能模板与校验器，最后接 workflow 条件调用。
