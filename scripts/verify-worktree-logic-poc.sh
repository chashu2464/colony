#!/bin/bash
# Proof of Concept: Worktree Isolation Logic Verification (v2 - Boundary Extensions)

TASK_ID_REGEX="^task-[a-f0-9]{8}$"
TMP_ROOT="/tmp/colony_worktree_boundary_poc"
mkdir -p "$TMP_ROOT/node_modules"
touch "$TMP_ROOT/node_modules/package.json"

# 1. Regex Validation for TASK_ID
function resolve_task_id() {
    local path=$1
    local folder_name=$(echo "$path" | grep -oE "task-[^/]+")
    if [[ "$folder_name" =~ $TASK_ID_REGEX ]]; then
        echo "RESOLVED: $folder_name"
    else
        echo "ERROR: Invalid Task ID format in path '$path'. Aborting."
        return 1
    fi
}

# 2. Robust Symlink with Rollback [P1-ROLLBACK]
function create_sandbox_with_rollback() {
    local task_id=$1
    local worktree_path="$TMP_ROOT/.worktrees/$task_id"
    
    echo "INITIATING: Creating sandbox for $task_id"
    mkdir -p "$worktree_path"
    
    # Simulate symlink creation (forcing failure for test)
    if [ "$2" == "force_fail" ]; then
        echo "SIMULATING: Symlink creation failure..."
        ln -s "/non/existent/path" "$worktree_path/node_modules"
    else
        ln -s "../../node_modules" "$worktree_path/node_modules"
    fi

    # G1: Verification Gate
    if [ -L "$worktree_path/node_modules" ] && [ -d "$worktree_path/node_modules" ]; then
        echo "SUCCESS: Sandbox environment verified."
    else
        echo "ERROR: Environment check failed (Broken Symlink). ROLLING BACK..."
        # Rollback: Clean up partial directory and broken symlink
        rm -rf "$worktree_path"
        if [ ! -d "$worktree_path" ]; then
            echo "ROLLBACK COMPLETE: Temporary path $worktree_path removed."
        fi
        return 1
    fi
}

# 3. Ahead Detection with Upstream check [P1-UPSTREAM]
function safe_remove_extended() {
    local task_id=$1
    local has_changes=$2
    local upstream_status=$3 # "exists" or "missing"
    local ahead_commits=$4

    echo "CLEANUP CHECK: Analyzing worktree '$task_id'..."

    # Check 1: Dirty Tree
    if [ -n "$has_changes" ]; then
        echo "ERROR: Worktree has uncommitted changes. Cleanup blocked."
        return 1
    fi

    # Check 2: Upstream existence (Fail-Closed)
    if [ "$upstream_status" == "missing" ]; then
        echo "ERROR: No upstream branch found (@{u} unresolvable). Cleanup blocked."
        echo "Audit: Branch state unknown. Please push to remote or merge manually."
        return 1
    fi

    # Check 3: Ahead status
    if [ -n "$ahead_commits" ]; then
        echo "ERROR: Worktree has unpushed commits. Cleanup blocked."
        return 1
    fi

    echo "SUCCESS: Safety checks passed. Removing worktree..."
}

echo "--- [P1-ROLLBACK] Creation Rollback Verification ---"
echo "Test Case 9: Rollback on Broken Symlink"
create_sandbox_with_rollback "task-2d08ab9d" "force_fail" || echo "Status: Creation Aborted & Rolled Back"

echo -e "\n--- [P1-UPSTREAM] Ahead Detection Boundary ---"
echo "Test Case 10: Fail-Closed on Missing Upstream"
safe_remove_extended "task-2d08ab9d" "" "missing" "" || echo "Status: Cleanup Denied (Safety Lock)"

echo "Test Case 11: Success on Synced Upstream"
safe_remove_extended "task-2d08ab9d" "" "exists" ""

# Cleanup POC env
rm -rf "$TMP_ROOT"
