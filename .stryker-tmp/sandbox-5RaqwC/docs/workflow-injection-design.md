# Workflow Stage Injection Design

## Objective
Automatically inject the current development workflow stage into an agent's context during the prompt assembly process. This improves the agent's awareness of its current role and responsibilities without requiring manual `status` queries.

## Design
1.  **ContextAssembler Integration**:
    *   Add a new section builder `buildWorkflowStageSection(roomId: string, agentId: string)` in `ContextAssembler`.
    *   This method will read the workflow JSON file from `.data/workflows/${roomId}.json`.
    *   It will format the current stage number, stage name, task name, and assigned role for the current agent.
    *   Inject this section into the prompt with **Priority 88**.

2.  **Types Update**:
    *   Add `includeWorkflow?: boolean` to `AssembleOptions` (default: true).

3.  **Prompt Format**:
    ```markdown
    ## 当前工作流阶段
    - **任务**: [task_name]
    - **当前阶段**: [current_stage] - [stage_name]
    - **你的角色**: [role]
    - **状态**: [status] (active/blocked)
    ```

## Implementation Steps
*   Update `src/memory/types.ts`.
*   Update `src/memory/ContextAssembler.ts`.
*   Add unit test to verify injection.

## Success Criteria
*   Agents receive workflow information in their context.
*   The information accurately reflects the state in the workflow file.
*   The section is omitted if no workflow exists for the room.
