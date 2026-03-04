# Phase 6 Workflow Skill Upgrade Test Cases

## TC-1: Input JSON Validation
- **Given**: The `handler.sh` script is called with malformed JSON (e.g., `{"action": "status", `).
- **When**: The script is executed.
- **Then**: It should return `{"error": "Invalid JSON input. Please provide a valid JSON object."}` and exit with code 1.

## TC-2: Action 'prev' - Basic Backtrack
- **Given**: A workflow is at Stage 3.
- **When**: `handler.sh` is called with `{"action": "prev", "reason": "Correction needed"}`.
- **Then**: 
  - `current_stage` should become 2.
  - History should log the `prev` action with the reason.
  - Output should include the `git reset` hint for the Stage 2 commit.

## TC-3: Action 'prev' - Stage 0 Boundary
- **Given**: A workflow is at Stage 0.
- **When**: `handler.sh` is called with `{"action": "prev"}`.
- **Then**: It should return an error: `Already at stage 0. Cannot backtrack further.`.

## TC-4: Evidence Validation - Missing File
- **Given**: `handler.sh` is called with `{"action": "next", "evidence": "non_existent_file.txt"}`.
- **When**: The script is executed.
- **Then**: It should return an error: `Evidence path not found: non_existent_file.txt`.

## TC-5: Role-based Review - Stage 8 Guardrail
- **Given**: A workflow is at Stage 8 and has an approval from `developer`, but NO approval from the assigned `tech_lead`.
- **When**: `handler.sh` is called with `{"action": "next"}` (to complete).
- **Then**: It should return an error: `Stage 8 (Go-Live Review) requires an approved review from the tech_lead (<tech_lead_id>) before proceeding.`.

## TC-6: Role-based Review - Stage 8 Success
- **Given**: A workflow is at Stage 8 and has an approval from the assigned `tech_lead`.
- **When**: `handler.sh` is called with `{"action": "next"}`.
- **Then**: The workflow should complete and merge (simulated or real).
