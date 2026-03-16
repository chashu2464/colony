# Requirements: Git Worktree Physical Isolation

## 1. Problem Statement
Current branch-based isolation in `dev-workflow` relies on `git checkout`, which:
- Prevents multiple agents from working on different tasks simultaneously in the same workspace.
- Risk environment pollution from untracked files and build artifacts (e.g., `dist/`, `coverage/`).
- Incurs overhead for `stash` and `checkout` when switching tasks.

## 2. Goals
- **Physical Isolation**: Each task has its own directory.
- **Parallelism**: Support multiple tasks in parallel across different physical paths.
- **Zero Pollution**: Artifacts from Task A never affect Task B.
- **Seamless Transition**: Backward compatibility with existing workflow state.

## 3. Scope
- Modify `scripts/handler.sh` to support `worktree` operations.
- Automate directory lifecycle management (.worktrees/).
- Provide helper scripts for environment setup in worktrees (symlinking `node_modules`).

## 4. Key Functional Requirements
- [FR1] **Worktree Creation**: Automatically trigger `git worktree add` during `init` or transition to Stage 6.
- [FR2] **Environment Linking**: Ensure sandboxes can use host `node_modules` via symlinks.
- [FR3] **Context Awareness**: Skill should identify task state based on current working directory.
- [FR4] **Cleanup**: Automatically delete worktrees on Stage 9 or Task Deletion.
