# Phase 6 Workflow Skill Upgrade Design

## 1. Input JSON Validation

**架构决策**: 在脚本入口使用 jq 验证 JSON 格式，符合"快速失败"原则。

**增强**: 提供具体的 jq 错误信息，便于调试。

```bash
INPUT=$(cat)
ERROR_MSG=$(echo "$INPUT" | jq empty 2>&1)
if [ $? -ne 0 ]; then
  echo "{\"error\": \"Invalid JSON input\", \"details\": \"$ERROR_MSG\"}"
  exit 1
fi
```

**理由**: 通用错误信息不足以定位问题，包含 jq 的具体错误（如 "parse error at line 3, column 5"）可显著提升可调试性。

## 2. Implementation of 'prev' Action

**架构决策**: prev 动作是 backtrack 的简化版本，限制为单步回退，降低误操作风险。

**增强**: 检查 Git 工作区状态，防止数据丢失。

- **Logic**:
  1. Retrieve `current_stage`.
  2. If `current_stage == 0`, error out with message: "Cannot go back from stage 0".
  3. **Check Git working directory status**:
     - Run `git status --porcelain`
     - If output is not empty (dirty state), return error: "Working directory has uncommitted changes. Please commit or stash before using prev."
  4. Set `target_stage = current_stage - 1`.
  5. Perform the same state updates and history logging as `backtrack`.
  6. Include the `git reset` hint in the output: "⚠️ Code not automatically reverted. Manually execute: git reset --hard <commit_hash>"

**理由**:
- 防止用户忘记 git reset 导致代码与 workflow state 不一致
- 检查脏状态避免 git reset 丢失未提交的修改
- 不自动执行 git reset，保持操作的可控性和可审计性

## 3. Evidence Validation Improvements

**架构决策**: 分阶段强制策略，平衡灵活性与质量保障。

**Evidence 要求**:
- **Stage 0-1** (Initial Requirements): evidence 可选
  - 理由：需求阶段可能只有口头讨论，无实体文件产出
- **Stage 2-7** (Design/Implementation/Testing): evidence 必填且必须存在
  - 理由：设计/实现/测试阶段必须有可验证的交付物（设计文档、代码文件、测试报告）
- **Stage 8** (Go-Live Review): 必须有 git commit hash 作为最终 evidence
  - 理由：上线阶段必须有代码提交记录，确保可追溯性

**Validation Logic**:
```bash
# For Stage 2-7
if [ "$CURRENT_STAGE" -ge 2 ] && [ "$CURRENT_STAGE" -le 7 ]; then
  if [ -z "$EVIDENCE" ]; then
    echo '{"error": "Evidence is required for stages 2-7"}'
    exit 1
  fi
  if [ ! -e "$EVIDENCE" ]; then
    echo "{\"error\": \"Evidence path does not exist: $EVIDENCE\"}"
    exit 1
  fi
fi

# For Stage 8
if [ "$TARGET_STAGE" -eq 8 ]; then
  if [ -z "$GIT_COMMIT_HASH" ]; then
    echo '{"error": "Git commit hash is required for stage 8"}'
    exit 1
  fi
fi
```

**Additional Check**: Ensure `evidence` is not just whitespace.

## 4. Role-based Review Validation (Tech Lead)

**架构决策**: 在 Stage 8 强化 tech_lead 角色验证，同时适应小团队场景。

**增强**: 实现 Fallback 机制，避免小团队因角色缺失而无法推进。

- **Logic for Stage 8**:
  1. Check if `assignments.tech_lead` exists:
     ```bash
     TECH_LEAD=$(echo "$STATE" | jq -r '.assignments.tech_lead // empty')
     ```
  2. If `tech_lead` is not assigned, fallback to `developer`:
     ```bash
     if [ -z "$TECH_LEAD" ]; then
       TECH_LEAD=$(echo "$STATE" | jq -r '.assignments.developer')
       echo "⚠️ Warning: tech_lead not assigned, using developer as fallback" >&2
     fi
     ```
  3. If `tech_lead == developer`, allow but warn:
     ```bash
     DEVELOPER=$(echo "$STATE" | jq -r '.assignments.developer')
     if [ "$TECH_LEAD" == "$DEVELOPER" ]; then
       echo "⚠️ Warning: tech_lead and developer are the same person" >&2
     fi
     ```
  4. Search `reviews` for an entry where:
     - `stage == 8`
     - `status == "approved"`
     - `reviewer == <tech_lead_id>`
  5. If not found, block the transition to completion:
     ```bash
     echo "{\"error\": \"Stage 8 requires approval from tech_lead ($TECH_LEAD)\"}"
     exit 1
     ```
  6. Record the actual reviewer role in history metadata.

**理由**:
- 适应不同团队规模（大团队有专职 tech_lead，小团队可能由 developer 兼任）
- 保持流程严谨性（Stage 8 必须有审批）的同时提供灵活性
- 警告机制确保团队意识到角色重叠的风险

## 5. Script Refactoring
- Move repetitive history logging logic into a helper function if possible.
- Ensure all error messages are consistent JSON format.

## 6. Architecture Decision Summary

| 决策点 | 方案 | 理由 |
|--------|------|------|
| 输入验证增强 | 包含 jq 详细错误信息 | 提升可调试性，快速定位 JSON 格式问题 |
| Evidence 强制策略 | 分阶段强制（Stage 2-7 必填） | 平衡灵活性与质量保障，适应不同阶段特点 |
| prev 的 Git 一致性 | 检查脏状态 + 手动 reset | 防止数据丢失，保持代码与状态一致性 |
| Tech Lead Fallback | 允许回退到 developer | 适应小团队场景，避免角色缺失阻塞流程 |

## 7. Risk Assessment

**已识别风险**:
1. **Git 状态不一致**: prev 动作可能导致 workflow state 与代码分支不同步
   - 缓解措施：检查工作区脏状态，提供明确的 git reset 指令
2. **角色缺失阻塞**: 小团队可能没有独立的 tech_lead 角色
   - 缓解措施：Fallback 到 developer，并记录警告
3. **Evidence 过度严格**: 强制要求可能影响快速迭代
   - 缓解措施：Stage 0-1 豁免，仅在设计/实现阶段强制

**性能影响**: 预期 < 10ms（主要开销在 git status 检查和 jq 验证）

## 8. Testing Strategy

**单元测试覆盖**:
- 输入验证：测试各种非法 JSON 格式（缺少引号、多余逗号、非法字符）
- prev 动作：测试 stage 0 边界、脏工作区拦截、正常回退
- Evidence 验证：测试各阶段的强制/可选逻辑、文件不存在场景
- Tech Lead 验证：测试角色缺失、角色重叠、正常审批

**集成测试场景**:
- 端到端 workflow：Stage 0 → 8 完整流程，验证所有新增验证点
- 异常恢复：在各阶段使用 prev 回退，验证状态一致性
