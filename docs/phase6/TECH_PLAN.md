# Technical Implementation Plan: dev-workflow Skill Enhancement

## 1. Core Logic Changes

### 1.1 Concurrency Control (flock)
We will implement a wrapper around `flock` (or `shlock` as fallback) to ensure that only one agent can modify a workflow's state at a time.
- **New Functions**:
    - `acquire_lock(lockfile)`: Attempts to acquire an exclusive lock with a 5-second timeout.
    - `release_lock(lockfile)`: Releases the lock and cleans up.
- **Logic**:
    - Use `flock -x -w 5` on Linux.
    - Use `shlock` or a custom python script for macOS fallback.
    - All state-modifying actions (init, next, prev, etc.) will be wrapped in an `acquire_lock` / `release_lock` block.

### 1.2 Atomic State Updates
To prevent state corruption during crashes, we will move from direct redirection to a write-and-rename pattern.
- **New Function**: `update_state(state_file, new_json)`
- **Logic**:
    - Create a temporary file: `${state_file}.tmp.$$`
    - Write the new JSON content to the temporary file.
    - Perform an atomic `mv` to the final destination.
    - Create a `.backup` file before the operation for manual recovery.

### 1.3 Input Validation (JSON Schema)
We will implement a robust validation layer using `jq` to verify all incoming JSON parameters.
- **New Function**: `validate_input(action, json_input)`
- **Logic**:
    - Define a schema (as a JSON object or jq filter) for each action.
    - Check for required fields (e.g., `task_name` for `init`).
    - Validate types and constraints (e.g., `target_stage` is 0-9).
    - Return Exit Code 2 on failure with a descriptive JSON error.

### 1.4 Error Code Standardization
We will standardize exit codes to help agents diagnose issues:
- `Exit 0`: Success
- `Exit 1`: General Logic Error
- `Exit 2`: Validation Error (Invalid Input)
- `Exit 3`: Lock Timeout (Concurrency Conflict)
- `Exit 4`: State Corruption (Invalid JSON in state file)
- `Exit 5`: Git/System Error

## 2. Impacted Files and Dependencies

### 2.1 Files
- `skills/dev-workflow/scripts/handler.sh`: Primary implementation site.
- `skills/dev-workflow/SKILL.md`: Documentation updates.
- `src/tests/dev-workflow/`: New integration test suite (to be created in Phase 4).

### 2.2 Dependencies
- `jq`: (Existing) For JSON processing and validation.
- `flock`: (New) For file locking (standard on Linux, Homebrew on macOS).
- `git`: (Existing) For state snapshots.

## 3. Implementation Sequence

1. **Phase 1**: Locking & Atomic Updates (handler.sh)
2. **Phase 2**: Input Validation Layer (handler.sh)
3. **Phase 3**: Error Codes & Recovery (handler.sh)
4. **Phase 4**: Integration Tests (src/tests/dev-workflow/)
5. **Phase 5**: Documentation (SKILL.md)
