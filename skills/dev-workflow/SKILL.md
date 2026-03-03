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
| `action`  | string | ✅ | `init`, `next`, `submit-review`, `backtrack`, `status`, `update` |
| `task_name` | string | ❌ | Name of the task (required for `init`) |
| `description` | string | ❌ | Task description |
| `notes` | string | ❌ | Progress notes for `next` stage |
| `assignments` | object | ❌ | Map of roles to agent IDs: `{"architect": "", "tech_lead": "", "qa_lead": "", "developer": ""}` |
| `evidence` | string | ❌ | Path to a file or document as proof of work for `next` |
| `status` | string | ❌ | `approved` or `rejected` (required for `submit-review`) |
| `comments` | string | ❌ | Optional feedback when using `submit-review` |
| `target_stage` | number | ❌ | The integer stage to rollback to (required for `backtrack`) |
| `reason` | string | ❌ | The reason for the rollback (required for `backtrack`) |

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
| 8 | Go-Live Review | tech_lead | architect, developer, qa_lead | 四方最终评审，确认交付质量。 |

## Important

- Use `status` to check the current stage before proceeding.
- **Stage 6 (Implementation)** can ONLY begin after **Stage 5 (Test Case Design)** is completed.
- Always provide `notes` and `evidence` (file paths) when moving to the `next` stage.
- **Automated Git Snapshots**: Pushing successful `next` stages will automatically execute a `git commit` to capture the project state. The `notes` you provide will form the commit message.
  - **Branching Strategy**: Upon advancing to **Stage 6 (Implementation)**, the workflow will automatically create and check out a dedicated feature branch (`feature/task-<ID>`). All development commits will reside here.
  - **Auto-Merging**: Upon successfully advancing to **Stage 8 (Go-Live Review)**, the workflow will automatically switch back to the main branch (`master` or `main`) and merge the feature branch in.

## Advanced Actions

### Submitting a Review
Certain critical stages (e.g. Stage 3, Stage 7) require explicit approval before the workflow can move `next`. A designated reviewer (e.g. Tech Lead or QA Lead) must call the skill to approve or reject the work:
```bash
echo '{"action": "submit-review", "status": "approved", "comments": "LGTM!"}' | bash scripts/handler.sh
```

### Backtracking (Rollback)
If a task is rejected during review or needs to revert to an earlier state (for example, failing Integration Testing and going back to Development), use the `backtrack` action:
```bash
echo '{"action": "backtrack", "target_stage": 6, "reason": "Failed integration tests, needs fix."}' | bash scripts/handler.sh
```
> **Safety Notice**: Backtracking merely updates the workflow metadata to unblock progress; it does NOT automatically execute `git reset --hard` to destroy your uncommitted code. Instead, the resulting JSON output will contain a `warning` property detailing the exact `git reset` terminal command you (or the Agent) should run manually to roll back the codebase cleanly to that target stage.
