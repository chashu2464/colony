# Phase 6 Workflow Skill Upgrade Requirements

## 1. Action: prev
- **Goal**: Provide a simpler way to backtrack exactly one stage.
- **Input**: Optional `reason`.
- **Behavior**:
  - Decrement `current_stage` by 1.
  - Must not go below stage 0.
  - Log the action in history with the reason.
  - Provide `git reset` warning if a previous commit hash exists for the target stage.

## 2. Evidence Validation Enhancement
- **Goal**: Ensure work is actually verifiable before advancing.
- **Behavior**:
  - In `next` action, if `evidence` is provided, verify it exists on disk (file or directory).
  - Return an error if it doesn't exist.
  - (Optional/Discussion) Decide if `evidence` is strictly mandatory for all stages > 0.

## 3. Tech Lead Role Integration
- **Goal**: Formalize the tech lead's role in reviews and notifications.
- **Behavior**:
  - Update Stage 8 (Go-Live Review) to strictly require the `tech_lead` to be the reviewer for completion (or at least ensure they are assigned).
  - Ensure `tech_lead` is correctly handled in all JSON outputs and assignment validations.

## 4. Input Validation
- **Goal**: Prevent script crashes due to malformed JSON.
- **Behavior**:
  - At the start of the script, use `jq` to validate the input string.
  - Return a JSON error message if the input is not valid JSON.
