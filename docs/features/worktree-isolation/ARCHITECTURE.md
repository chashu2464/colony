# Architecture Design: Git Worktree Physical Isolation

## 1. Context & Scope
This architecture extends `dev-workflow` to support physical workspace isolation using Git Worktrees. It aims to solve concurrency issues where multiple agents need to work on different tasks without branch switching overhead.

## 2. Technical Strategy

### 2.1 Workspace Structure
All active worktrees will be stored in a root-level hidden directory:
- `.worktrees/task-<TASK_ID>/`

### 2.2 Symlink Strategy (node_modules)
To avoid redundant `npm install`:
1. Host repository remains the source of truth for `node_modules`.
2. Worktrees will symlink back to the host's `node_modules`.
3. Implementation: Dynamically calculate the relative path from the worktree to the host root to ensure stability.
4. Validation: Mandatory self-check: `test -L node_modules && test -d node_modules`.

### 2.3 Task Context Resolution
Modify `handler.sh` to resolve `ROOM_ID` (and thus `TASK_ID`) based on path:
1. Check if current directory is within `.worktrees/task-*/`.
2. Extract `TASK_ID` using a strict whitelist regex: `^task-[a-f0-9]{8}$`.
3. Fail-closed: If the path does not match the pattern, the script must abort to prevent context pollution.

## 3. Workflow Integration (Lifecycle Hooks)

| Action | Stage Trigger | Operation |
| :--- | :--- | :--- |
| **Init** | Stage 0 | Create Branch + Initial State |
| **Sandbox Entry** | Stage 1 -> 6 | `git worktree add .worktrees/task-<ID> <BRANCH>` + `ln -s` |
| **Validation** | Stage 7/8 | All verification scripts MUST run within the worktree and log `workspace_path`. |
| **Cleanup** | Stage 9 | `git worktree remove .worktrees/task-<ID>` (Blocked if uncommitted changes exist). |

## 4. Modified Component Design

### 4.1 handler.sh Updates
- `resolve_workspace_context()`: Detects if running inside a sandbox using regex validation.
- `create_sandbox()`: Encapsulates `git worktree add` and robust relative symlink setup.
- `cleanup_sandbox()`: Encapsulates safe removal of worktrees with pre-flight status checks.

### 4.2 Error Handling
- **Locking**: Maintain existing file locking to prevent concurrent worktree operations.
- **Atomic Cleanup**: Ensure worktree removal only happens AFTER a successful merge to main and a clean status check.

## 5. Security & Constraints (Refined)
- **Regex Enforcement**: `TASK_ID` extraction only accepts `^[a-f0-9]{8}$`. No fallback to "default" if inside `.worktrees/` but pattern fails.
- **Path Integrity**: Stage 7/8 gates must verify `pwd` matches the expected `.worktrees/task-<ID>` path.
- **Audit Logging**: `docs/QUALITY_REPORT.md` must include `workspace_path` to prove execution isolation.
- **Cleanup Safety**: `git worktree remove` must NOT use `--force` by default. It must check for `git status --porcelain` and unpushed commits.

## 6. QA Gate Compliance (P1 Fixes)
Every P1 issue found during isolation implementation must document:
1. What changed (Implementation details)
2. Why introduced (Root cause)
3. How escaped (Detection gap)
