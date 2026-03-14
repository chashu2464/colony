---
name: dev-workflow
description: Manage the development workflow (Stages 0-8) for collaborative tasks.
---

# dev-workflow

Manage the development workflow (Stages 0-8) for collaborative tasks.

## Robustness Features (v3.0)

The `dev-workflow` skill includes several features to ensure reliability in concurrent agent environments:

- **Concurrency Control**: mkdir-based atomic locking prevents multiple agents from corrupting the same workflow state simultaneously. Requests are queued with a 5-second timeout.
- **Input Validation**: All JSON inputs are validated against schemas using `jq`. Invalid inputs (missing fields, absolute paths for evidence, etc.) are rejected with Exit 2.
- **Atomic State Updates**: State changes use a "write-to-temp-then-rename" pattern, ensuring the `.json` file is never partially written.
- **Automated Backups**: A `.backup` file is created before every state modification, allowing for recovery if the primary state file is corrupted.
- **Standardized Error Codes**:
    - `0`: Success
    - `1`: General Logic Error
    - `2`: Validation Error (Invalid Input)
    - `3`: Lock Timeout (Concurrency Conflict)
    - `4`: State Corruption (Invalid JSON in state file)
    - `5`: System/Git Error

## Usage

To update or query the workflow status, run the handler script with JSON parameters:

```bash
echo '{"action": "status"}' | bash scripts/handler.sh
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action`  | string | ✅ | `init`, `next`, `prev`, `backtrack`, `submit-review`, `status`, `update` |
| `task_name` | string | ❌ | Name of the task (required for `init`) |
| `description` | string | ❌ | Task description |
| `notes` | string | ❌ | Progress notes (required for `next`, min 10 chars) |
| `assignments` | object | ❌ | Map of roles to agent IDs: `{"architect": "", "tech_lead": "", "qa_lead": "", "developer": ""}` (also accepts `roles` as alias) |
| `evidence` | string | ❌ | Path to a file or directory as proof of work for `next` |
| `status` | string | ❌ | `approved` or `rejected` (required for `submit-review`) |
| `comments` | string | ❌ | Optional feedback when using `submit-review` |
| `target_stage` | number | ❌ | The integer stage to rollback to (required for `backtrack`) |
| `reason` | string | ❌ | The reason for the rollback (required for `backtrack` or `prev`) |

### Stages (0-9)

0. **Brainstorming**: Direction discussion and goal definition.
1. **Initial Requirements (IR)**: Draft requirements and five-party review.
2. **System/Architectural Design (SR/AR)**: Detailed design and breakdown.
3. **Forward Briefing**: Developer explains design to QA Lead.
4. **Reverse Briefing**: QA Lead explains design back to Developer.
5. **Test Case Design**: QA Lead writes test cases based on design.
6. **Development Implementation**: Coding based on design and test cases.
7. **Integration Testing**: QA verification and developer fixes.
8. **Go-Live Review**: Final four-party confirmation and delivery.
9. **Completed**: Task successfully merged and closed.

## 阶段-角色映射表 (Stage-Role Mapping)

| Stage | 阶段名称 | 主要负责人 | 协作角色 | 阶段指引 |
|-------|---------|-----------|---------|----------|
| 0 | Brainstorming | architect | developer, qa_lead | 讨论任务方向，明确目标和范围。架构师主导，其他角色提供输入。 |
| 1 | Initial Requirements | architect | tech_lead | 起草需求文档，进行五方评审。架构师负责文档化，技术负责人审查可行性。 |
| 2 | System/Architectural Design | architect | - | 完成系统设计和架构方案，输出设计文档。架构师独立完成。 |
| 3 | Forward Briefing | developer | qa_lead | 开发者向 QA 解释设计意图，确保 QA 理解实现方案。 |
| 4 | Reverse Briefing | qa_lead | developer | QA 向开发者复述设计，验证理解一致性. |
| 5 | Test Case Design | qa_lead | - | QA 编写测试用例，覆盖功能和边界场景。 |
| 6 | Development Implementation | developer | - | 开发者根据设计和测试用例实现功能。 |
| 7 | Integration Testing | qa_lead | developer | QA 执行集成测试，开发者修复发现的问题。 |
| 8 | Go-Live Review | tech_lead | architect, developer, qa_lead | 四方最终评审，确认交付质量。必须由 Tech Lead 批准。 |
| 9 | Completed | - | - | 任务已完成并合并到主分支。 |


## Agent Behavior Rules (MANDATORY)

> ⚠️ **禁止等待用户确认 stage 推进。** Agent 完成当前阶段工作后，必须自主执行以下步骤，不得询问用户是否推进：
> 1. 若当前 stage 需要 review（见下方 Approvals），先调用 `submit-review` 自我批准
> 2. 立即调用 `dev-workflow next` 推进到下一 stage
> 3. 系统会自动通过 `notify_server` 唤起下一阶段负责人，**不再需要手动 @mention**。Agent 仅需通过 `send-message` 发送交接内容（见下方交接模板）即可。
>
> **Stage 推进不属于"重大架构变更"，不触发重要变更需确认规则。**

### 交接消息模板 (Handoff Message)

每次推进 stage 后，**必须**发送一条结构化交接消息（无需 @mention，系统已自动通知）：

```
Stage X → Stage Y 交接

已完成：
- [本阶段产出的关键内容，如文档路径、实现的功能]

移交内容：
- [下一阶段负责人需要了解的关键信息]
- [需要特别注意的事项或风险]

产物路径：[evidence 文件路径]
```

### 阶段交接对象速查 (系统自动处理)

| 当前 Stage | 当前负责人 | 下一阶段负责人 |
|-----------|----------|----------------|
| 0 Brainstorming | architect | 架构师（自身继续推进至 Stage 1）|
| 1 Initial Requirements | architect | 架构师（自身继续推进至 Stage 2）|
| 2 System Design | architect | 开发者 |
| 3 Forward Briefing | developer | QA负责人 |
| 4 Reverse Briefing | qa_lead | QA负责人（自身继续推进至 Stage 5）|
| 5 Test Case Design | qa_lead | 开发者 |
| 6 Implementation | developer | QA负责人 |
| 7 Integration Testing | qa_lead | tech_lead（或开发者）|
| 8 Go-Live Review | tech_lead | （完成）|

## Important Actions

### Advancing (next)
Moves the workflow to the next stage.
- **Evidence**: Mandatory for all stages beyond 0. Must be a valid file or directory path.
- **Approvals**: Stages 2, 3, 4, 5, 7, and 8 require at least one approved review.
- **Stage 8 Guardrail**: Completion (moving from 8 to completion) strictly requires an approval from the assigned **tech_lead**.

### Backtracking (prev & backtrack)
- **prev**: Backtracks exactly one stage.
- **backtrack**: Backtracks to a specific `target_stage`.
- **Note**: Both provide a `git reset --hard` hint if a commit hash for the target stage is found in history.

### Submitting a Review
Used by reviewers to approve or reject a stage's work.
```bash
echo '{"action": "submit-review", "status": "approved", "comments": "LGTM!"}' | bash scripts/handler.sh
```

## Automated Features

- **Git Snapshots**: `next` action automatically commits changes (except when merging).
- **Branching Strategy**: Upon advancing to **Stage 6 (Implementation)**, the workflow automatically creates/checks out `feature/task-<ID>`.
- **Auto-Merging**: Advancing from **Stage 8** to completion automatically merges the feature branch into the main branch and deletes the feature branch.
