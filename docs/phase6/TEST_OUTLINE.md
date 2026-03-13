# Stage 4: Reverse Briefing - dev-workflow Skill Enhancement

## 1. Objective Recapitulation
The goal of this phase is to transform the `dev-workflow` skill from a basic script into a robust, concurrent, and self-validating system. We are addressing current vulnerabilities where concurrent agent interactions can corrupt state files and where invalid inputs lead to silent or cryptic failures.

## 2. Technical Strategy Understanding (QA Recap)

### 2.1 Concurrency Control (Locking)
- **Mechanism**: Use `flock` (exclusive lock with timeout) to wrap all read-modify-write operations in `handler.sh`.
- **Platform Strategy**: Detect environment; use `flock` on Linux and `shlock` (or a custom wrapper) on macOS if `flock` is missing.
- **Scope**: Lock is per-workflow (based on `task_id`).

### 2.2 Data Integrity (Atomic Updates)
- **Mechanism**: The "Write-then-Rename" pattern.
- **Backup**: Create a `.backup` of the current JSON state before any modification.
- **Atomicity**: `mv` is atomic on POSIX filesystems, ensuring the state file is never in a partially-written state.

### 2.3 Robustness (Input Validation)
- **Mechanism**: A pre-processing validation layer using `jq` to enforce JSON schemas.
- **Scope**: Validate action names, required fields (e.g., `task_name` for `init`, `evidence` for `next`), and data types.
- **Exit Codes**: Distinct exit code (Exit 2) for validation failures.

### 2.4 Diagnostic Clarity (Error Codes)
- **Standardization**:
    - `0`: Success
    - `1`: General Error
    - `2`: Validation Error
    - `3`: Lock Timeout
    - `4`: State Corruption
    - `5`: System/Git Error

## 3. Test Strategy Outline

### 3.1 Scenario 1: Basic Workflow Progression (Positive)
- **Goal**: Ensure the enhanced `handler.sh` still correctly manages the 9-stage workflow.
- **Method**: Run a complete `init -> next -> ... -> completion` sequence.
- **Verification**: Check `.data/workflows/*.json` content and git commit history at each step.

### 3.2 Scenario 2: Concurrency & Locking (Negative/Stress)
- **Goal**: Verify that locking prevents data loss.
- **Method**: Spawn 10 parallel processes attempting to advance the *same* workflow simultaneously.
- **Verification**:
    - Exactly one process should succeed in advancing the stage.
    - Other processes should fail with "Lock Timeout" (Exit 3).
    - The JSON file must remain valid and consistent.

### 3.3 Scenario 3: Input Validation (Negative)
- **Goal**: Verify that invalid inputs are rejected early.
- **Method**:
    - Pass missing required fields.
    - Pass invalid JSON.
    - Pass non-existent evidence paths.
    - Pass absolute paths for evidence (should be relative).
- **Verification**: Ensure Exit 2 is returned with a descriptive JSON error message.

### 3.4 Scenario 4: Recovery from Corruption (Resilience)
- **Goal**: Verify the backup/restore mechanism.
- **Method**:
    - Manually corrupt a JSON state file.
    - Execute a `status` or `next` action.
    - Verify the system detects corruption (Exit 4) and suggests recovery.
- **Verification**: Test the manual restore command using the `.backup` file.

### 3.5 Scenario 5: Platform Compatibility
- **Goal**: Ensure the locking logic is portable.
- **Method**: Run tests on both macOS (Darwin) and Linux.
- **Verification**: Verify that the correct locking utility (`flock` vs `shlock`) is selected and functioning.

## 4. Acceptance Criteria Alignment
- All 10 concurrent requests handled without state corruption.
- 100% rejection of schema-violating inputs.
- Backup files created correctly for every state change.
- Error codes match the standardized definitions.

## 5. Next Steps
- Proceed to **Stage 5 (Test Case Design)** to create detailed Given-When-Then test specifications based on this outline.
