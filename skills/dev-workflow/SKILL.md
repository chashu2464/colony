# dev-workflow

Manage the development workflow (Stages 0-8) for collaborative tasks.

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
| `notes` | string | ❌ | Progress notes for `next` stage |
| `assignments` | object | ❌ | Map of roles to agent IDs: `{"architect": "", "tech_lead": "", "qa_lead": "", "developer": ""}` (also accepts `roles` as alias) |
| `evidence` | string | ❌ | Path to a file or document as proof of work for `next` |
| `status` | string | ❌ | `approved` or `rejected` (required for `submit-review`) |
| `comments` | string | ❌ | Optional feedback when using `submit-review` |
| `target_stage` | number | ❌ | The integer stage to rollback to (required for `backtrack`) |
| `reason` | string | ❌ | The reason for the rollback (required for `backtrack` or `prev`) |

### Stages (0-8)

0. **Brainstorming**: Direction discussion and goal definition.
1. **Initial Requirements (IR)**: Draft requirements and five-party review.
2. **System/Architectural Design (SR/AR)**: Detailed design and breakdown.
3. **Forward Briefing**: Developer explains design to QA Lead.
4. **Reverse Briefing**: QA Lead explains design back to Developer.
5. **Test Case Design**: QA Lead writes test cases based on design.
6. **Development Implementation**: Coding based on design and test cases.
7. **Integration Testing**: QA verification and developer fixes.
8. **Go-Live Review**: Final four-party confirmation and delivery.

## 阶段-角色映射表 (Stage-Role Mapping)

| Stage | 阶段名称 | 主要负责人 | 协作角色 | 阶段指引 |
|-------|---------|-----------|---------|----------|
| 0 | Brainstorming | architect | developer, qa_lead | 讨论任务方向，明确目标和范围。架构师主导，其他角色提供输入。 |
| 1 | Initial Requirements | architect | tech_lead | 起草需求文档，进行五方评审。架构师负责文档化，技术负责人审查可行性。 |
| 2 | System/Architectural Design | architect | - | 完成系统设计和架构方案，输出设计文档。架构师独立完成。 |
| 3 | Forward Briefing | developer | qa_lead | 开发者向 QA 解释设计意图，确保 QA 理解实现方案。 |
| 4 | Reverse Briefing | qa_lead | developer | QA 向开发者复述设计，验证理解一致性。 |
| 5 | Test Case Design | qa_lead | - | QA 编写测试用例，覆盖功能和边界场景。 |
| 6 | Development Implementation | developer | - | 开发者根据设计和测试用例实现功能。 |
| 7 | Integration Testing | qa_lead | developer | QA 执行集成测试，开发者修复发现的问题。 |
| 8 | Go-Live Review | tech_lead | architect, developer, qa_lead | 四方最终评审，确认交付质量。必须由 Tech Lead 批准。 |

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
