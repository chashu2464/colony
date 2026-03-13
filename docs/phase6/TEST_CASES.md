# Stage 5: Test Case Design - dev-workflow Skill Enhancement

## 1. Introduction
These test cases verify the robustness, concurrency, and validation logic of the enhanced `dev-workflow` skill. They follow the Given-When-Then format and cover positive, negative, and edge scenarios.

---

## 2. Feature: Concurrency Control (File Locking)

### Test Case 1: Sequential Access (Positive)
**Given**: A workflow `task-123` exists.
**When**: Agent A calls `status` and then Agent B calls `status` immediately after.
**Then**: Both requests should succeed (Exit 0) as the lock is released after each call.

### Test Case 2: Concurrent Modification (Negative - Collision)
**Given**: A workflow `task-123` exists.
**When**: 10 parallel processes attempt to call `next` on `task-123` simultaneously.
**Then**: 
- Exactly ONE process must succeed (Exit 0) and advance the stage.
- Nine processes must fail with "Lock Timeout" (Exit 3) within 5 seconds.
- The state file `.data/workflows/task-123.json` must be valid JSON and reflect exactly one stage advancement.

---

## 3. Feature: Input Validation (JSON Schema)

### Test Case 3: Missing Required Fields (Negative)
**Given**: The `handler.sh` is invoked with an `init` action.
**When**: The `task_name` field is missing from the JSON input.
**Then**: 
- The script must return Exit 2 (Validation Error).
- The JSON output must contain `"error": "Missing required field: task_name"`.

### Test Case 4: Invalid Path Format (Negative)
**Given**: The `handler.sh` is invoked with a `next` action.
**When**: The `evidence` path is an absolute path (e.g., `/etc/passwd`).
**Then**: 
- The script must return Exit 2.
- The JSON output must warn that evidence paths must be relative to the workspace root.

### Test Case 5: Non-existent Evidence (Negative)
**Given**: The `handler.sh` is invoked with a `next` action.
**When**: The `evidence` path points to a file that does not exist.
**Then**: 
- The script must return Exit 2.
- The JSON output must specify that the evidence file was not found.

---

## 4. Feature: Atomic Updates & Backup

### Test Case 6: Backup Creation (Positive)
**Given**: A workflow `task-123` exists.
**When**: An `update` or `next` action is successfully performed.
**Then**: 
- A file `.data/workflows/task-123.json.backup` must exist.
- The backup file must match the state *before* the latest operation.

### Test Case 7: Recovery from Corrupted State (Resilience)
**Given**: The file `.data/workflows/task-123.json` is manually corrupted (e.g., contains "Invalid JSON").
**When**: The `handler.sh` is called with a `status` action.
**Then**: 
- The script must return Exit 4 (State Corruption).
- The JSON output must include instructions on how to restore from the `.backup` file.

---

## 5. Feature: Error Code Standardization

### Test Case 8: Exit Code Mapping
**Given**: Various failure scenarios are triggered.
**When**: The script terminates.
**Then**: 
- Lock contention -> Exit 3.
- Invalid Input -> Exit 2.
- JSON Syntax Error in State -> Exit 4.
- Success -> Exit 0.

---

## 6. Feature: Platform Compatibility

### Test Case 9: macOS Lock Detection
**Given**: The script is running on macOS (Darwin).
**When**: A lock is requested.
**Then**: 
- The script should check for `flock`.
- If `flock` is missing, it should successfully fall back to `shlock` or a custom python-based locking helper.
- The lock must be functional (preventing concurrent writes).

---

## 7. Feature: End-to-End Workflow

### Test Case 10: Full Cycle Regression
**Given**: A clean environment.
**When**: Executing the sequence: `init` -> `next` (Stage 1-9) -> `complete`.
**Then**: 
- All 11 steps must succeed.
- Git commits must be created for each stage change.
- Final state must be `status: completed`.
