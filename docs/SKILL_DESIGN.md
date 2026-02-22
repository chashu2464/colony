# Colony Workflow System (dev-workflow v2)

## 1. Overview
The Colony Workflow System is a structured state machine designed to manage the 9-stage (0-8) development lifecycle across multiple agents. It ensures transparency, accountability (via evidence tracking), and quality (via mandatory reviews).

## 2. Data Structure (`.data/workflows/$ROOM_ID.json`)

```json
{
  "task_id": "uuid",
  "task_name": "string",
  "description": "string",
  "current_stage": number (0-8),
  "status": "active" | "reviewing" | "blocked" | "completed",
  "assignments": {
    "architect": "agent_id",
    "tech_lead": "agent_id",
    "qa_lead": "agent_id",
    "developer": "agent_id"
  },
  "artifacts": [
    {
      "stage": number,
      "path": "string",
      "description": "string",
      "created_at": "ISO-8601"
    }
  ],
  "reviews": [
    {
      "stage": number,
      "reviewer": "agent_id",
      "status": "approved" | "rejected",
      "comments": "string",
      "timestamp": "ISO-8601"
    }
  ],
  "history": [
    {
      "from_stage": number,
      "to_stage": number,
      "action": "next" | "backtrack" | "init",
      "actor": "agent_id",
      "notes": "string",
      "timestamp": "ISO-8601"
    }
  ]
}
```

## 3. Tool Interface (`handler.sh`)

### `init`
Initializes a new workflow.
- **Inputs**: `task_name`, `description`, `assignments` (optional).
- **Behavior**: Creates the JSON file, sets stage to 0.

### `next`
Moves to the next stage.
- **Inputs**: `notes`, `evidence` (file path).
- **Constraints**: 
  - Validates `evidence` exists on disk.
  - Requires `status` to be `active` (not `reviewing`).
  - For critical stages (3, 4, 8), ensures a matching `approved` review exists for the current stage.

### `submit-review`
Submits a review for the current stage.
- **Inputs**: `status` (approved/rejected), `comments`.
- **Behavior**: Updates the `reviews` array. Sets workflow `status` back to `active` if approved, or `blocked` if rejected.

### `backtrack`
Moves the workflow back to a previous stage.
- **Inputs**: `target_stage`, `reason`.
- **Behavior**: Updates `current_stage`, logs the reason in history.

### `status`
Displays the current state, assignments, and pending artifacts/reviews.

## 4. Stage Definitions (0-8)

| Stage | Name | Responsible | Mandatory Evidence | Reviewer |
|-------|------|-------------|--------------------|----------|
| 0 | Brainstorming | All | Meeting Notes / Summary | Architect |
| 1 | IR | Architect | `docs/IR.md` | User / All |
| 2 | SR/AR | Architect | `docs/SR.md`, `docs/AR.md` | Tech Lead |
| 3 | Forward Briefing | Developer | Briefing Notes | QA Lead |
| 4 | Reverse Briefing | QA Lead | Understanding Doc | Developer |
| 5 | Test Case Design | QA Lead | `docs/test-cases.md` | Tech Lead |
| 6 | Implementation | Developer | PR / Code Changes | QA Lead |
| 7 | Integration Testing| QA Lead | Test Report | Architect |
| 8 | Go-Live Review | All | Checklist / Final Doc | User |
