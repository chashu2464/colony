# Test Cases: Git Worktree Physical Isolation (Stage 5)

## 1. Test Strategy
- Scope: Validate worktree-based physical isolation lifecycle in `dev-workflow` with focus on P1 controls defined in architecture.
- Method: Black-box + script-level integration tests, using Given-When-Then format.
- Coverage target: Normal flow, exception flow, boundary conditions, security hardening, and basic performance constraints.

## 2. Test Environment & Preconditions
- Git repository with `main` branch and at least one remote configured for upstream scenarios.
- `dev-workflow` handler available at `skills/dev-workflow/scripts/handler.sh`.
- Shell environment supports `git worktree`, `realpath` (or equivalent), and symbolic links.
- Test task id sample: `2d08ab9d` (valid) and invalid variants used below.

## 3. Functional Test Cases (Given-When-Then)

### TC-FUNC-001 Create sandbox worktree successfully
- Given a valid task context with `TASK_ID=2d08ab9d` and clean repo status
- When sandbox creation is triggered (`create_sandbox` / stage transition hook)
- Then `.worktrees/task-2d08ab9d` is created and linked to expected branch
- And `node_modules` symlink exists and points to a valid directory (`test -L node_modules && test -d node_modules`)
- And command exits with status 0

### TC-FUNC-002 Resolve task context from worktree path
- Given current working directory is inside `.worktrees/task-2d08ab9d`
- When `resolve_workspace_context()` parses task identifier
- Then it resolves to `task-2d08ab9d`
- And subsequent workflow actions bind to this task only

### TC-FUNC-003 Stage 7/8 quality gate executes within physical sandbox
- Given current task is `2d08ab9d`
- When `scripts/check-quality-gates.sh` runs in stage 7/8
- Then script validates `pwd` is under `.worktrees/task-2d08ab9d`
- And report persists `workspace_path` as auditable evidence

### TC-FUNC-004 Safe cleanup on clean and synced branch
- Given worktree has no uncommitted changes and no unpushed commits
- When `cleanup_sandbox()` executes
- Then `git worktree remove .worktrees/task-2d08ab9d` succeeds without `--force`
- And sandbox directory no longer exists

## 4. Exception & Boundary Test Cases (Given-When-Then)

### TC-EXC-001 Reject invalid task id (length mismatch)
- Given current path contains `task-2d08ab9` (7 hex chars)
- When context resolver parses folder name
- Then resolver fails with non-zero exit
- And workflow aborts fail-closed (no default task fallback)

### TC-EXC-002 Reject path injection task id
- Given current path contains `task-2d08ab9d../evil`
- When context resolver validates against whitelist regex
- Then parsing is rejected with explicit audit message
- And no task operations are performed

### TC-EXC-003 Block gate execution from host root (non-worktree path)
- Given user runs quality gate from repository root
- When stage 7/8 gate starts
- Then gate fails immediately
- And output includes expected and actual `workspace_path`

### TC-BND-001 Missing upstream must fail-closed on cleanup
- Given worktree branch has no upstream (`@{u}` unresolvable)
- When cleanup performs preflight checks
- Then cleanup is blocked (non-zero exit)
- And audit output states upstream missing and requires push/merge action

### TC-BND-002 Dirty tree must block cleanup
- Given worktree contains uncommitted file changes
- When cleanup is triggered
- Then cleanup is blocked with dirty-tree reason
- And worktree directory remains intact

### TC-BND-003 Ahead-of-upstream must block cleanup
- Given branch has local commits ahead of upstream
- When cleanup is triggered
- Then cleanup is blocked with unpushed-commits reason
- And no removal command is executed

### TC-BND-004 Atomic rollback when symlink validation fails
- Given sandbox creation generates broken `node_modules` symlink
- When G1 self-check fails (`test -L` true but `test -d` false)
- Then creation flow aborts
- And partial worktree directory and residual symlink are removed
- And filesystem returns to pre-create state

### TC-BND-005 Nested worktree depth symlink robustness
- Given worktree is created under deeper nested path (e.g. `.worktrees/team/a/task-2d08ab9d` in test harness)
- When relative symlink path is computed dynamically
- Then resulting `node_modules` symlink remains valid
- And no hardcoded `../` assumptions are present

## 5. Security Review Test Cases (OWASP-oriented)

### TC-SEC-001 Path traversal defense in task resolution
- Given attacker-controlled path segments near `.worktrees/`
- When resolver extracts task folder
- Then only exact `^task-[a-f0-9]{8}$` matches are accepted
- And traversal tokens (`..`, encoded variants) are rejected

### TC-SEC-002 Command injection resistance in shell handling
- Given task path contains shell metacharacters (`;`, `$()`, backticks)
- When handler processes path variables
- Then values are treated as data (quoted) and not executed as commands
- And workflow exits safely on invalid input

### TC-SEC-003 Least-risk cleanup behavior
- Given cleanup preconditions are uncertain (missing upstream or parse failure)
- When cleanup decision is made
- Then behavior is fail-closed (deny removal)
- And no destructive forced flags are used by default

## 6. Performance & Reliability Test Cases

### TC-PERF-001 Worktree create latency baseline
- Given warm repository with dependencies already installed in host
- When creating sandbox with symlink strategy
- Then creation should complete within acceptable threshold (target <= 3s on local baseline)
- And should be measurably faster than fresh install approach

### TC-PERF-002 Concurrent workflow lock reliability
- Given two agents trigger stage transition simultaneously
- When handler lock is contested
- Then only one action mutates state at a time
- And the other request receives queued timeout behavior (or retry success) without state corruption

### TC-PERF-003 Repeated create/cleanup stability
- Given 30 repeated create-cleanup cycles for same task id in isolated branch
- When lifecycle hooks are executed repeatedly
- Then no leftover `.worktrees/task-<id>` artifacts remain
- And no dangling `node_modules` link remains after failed creation tests

## 7. Bug Reporting Template (for Stage 7 execution)
- Bug ID: `P0/P1/P2-<domain>-<seq>`
- Severity: P0/P1/P2/P3
- Environment: branch, commit hash, workspace path
- Preconditions
- Reproduction Steps
  1. ...
  2. ...
  3. ...
- Expected Result
- Actual Result
- Attachments: command output / log snippet / screenshot if needed
- RCA (mandatory for P0/P1)
  1. Fix content
  2. Introduction cause
  3. Escaping path

## 8. Stage Gate Declaration (Design Complete)
- Verified in design coverage:
  - Normal lifecycle: create -> gate -> cleanup
  - Exception flows: invalid id, non-worktree execution, dirty/ahead/upstream-missing cleanup block
  - Boundary flows: rollback integrity, deep-path symlink robustness
  - Security controls: input validation, fail-closed cleanup, injection/traversal defense
  - Reliability: lock contention and repeated lifecycle stability
- Residual risks (to be validated in Stage 7 execution):
  - Cross-platform symlink behavior differences (macOS/Linux CI variance)
  - Remote topology edge cases in multi-remote branch tracking
  - Real-world concurrency under high command volume
