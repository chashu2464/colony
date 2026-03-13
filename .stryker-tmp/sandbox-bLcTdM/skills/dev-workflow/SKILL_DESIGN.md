# Colony Workflow System - Skill Design

## Overview
The `dev-workflow` skill manages the 8-stage development lifecycle for Colony agents. It enforces role-based permissions, mandatory evidence, and explicit sign-offs.

## Data Structure (`.data/workflows/$ROOM_ID.json`)

```json
{
  "task_name": "string",
  "description": "string",
  "status": "active|completed|on_hold",
  "current_stage": 0,
  "stage_name": "string",
  "roles": {
    "architect": "agent_id",
    "tech_lead": "agent_id", // New
    "developer": "agent_id",
    "qa_lead": "agent_id"
  },
  "history": [
    {
      "stage": "string",
      "action": "init|next|prev|update",
      "actor": "agent_id",
      "timestamp": "ISO8601",
      "notes": "string",
      "evidence": "path/to/file",
      "sign_off": "agent_id" // Optional
    }
  ]
}
```

## Stages & Transitions

| ID | Stage Name | Owner | Input (Prereq) | Output (Evidence) | Reviewer (Sign-off) |
|----|------------|-------|----------------|-------------------|---------------------|
| 0 | Brainstorming | All | None | Concept Note | None |
| 1 | Initial Requirements (IR) | Architect | Concept | `docs/IR.md` | Tech Lead |
| 2 | System Design (AR/SR) | Architect | IR | `docs/AR.md` | Tech Lead |
| 3 | Forward Briefing | Tech Lead | AR | `docs/plan.md` | Developer |
| 4 | Reverse Briefing | Developer | Plan | `docs/task_breakdown.md` | Tech Lead |
| 5 | Test Case Design | QA Lead | Plan | `docs/test_cases.md` | Tech Lead |
| 6 | Implementation | Developer | Test Cases | Source Code | None |
| 7 | Integration Testing | QA Lead | Code | `docs/test_report.md` | Developer |
| 8 | Go-Live Review | All | Test Report | Release Tag | All |

## Interface (CLI Actions)

### `init`
- **Params**: `task_name`, `description`, `roles`
- **Logic**: Creates workflow file, sets stage to 0.

### `next`
- **Params**: `notes`, `evidence`, `reviewer` (optional)
- **Logic**:
  - Validates `evidence` is provided (file exists).
  - Checks if current stage requires sign-off.
  - Advancing from 5->6 requires Stage 5 to be complete.
  - Updates `current_stage` + 1.

### `prev` (Rollback)
- **Params**: `reason`
- **Logic**:
  - Decrements `current_stage`.
  - Logs the rollback reason in history.
  - Useful if QA fails (Stage 7 -> 6).

### `update`
- **Params**: `roles`, `description`
- **Logic**: Updates metadata without changing stage.

### `status`
- **Logic**: Returns full JSON state.

## Validation Logic (Bash/JQ)
1. **File Existence**: Check if `evidence` path exists.
2. **Role Check**: (Future) Verify actor matches the stage owner.
3. **Sign-off**: For critical stages, require a specific field or mention in notes.

## Implementation Plan
1. Update `handler.sh` to support `prev` action.
2. Add evidence validation logic.
3. Update `STAGES` array to match the 8-stage standard.
4. Add `roles` object support including `tech_lead`.
