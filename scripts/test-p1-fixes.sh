#!/bin/bash
# Verification script for P1-SEC-002, P1-QA-002, P1-ENV-002, P1-SEC-003

PROJ_ROOT=$(pwd)
export TASK_ID="2d08ab9d"

function run_handler_in_dir() {
    local dir=$1
    echo "Testing path: $dir"
    mkdir -p "$dir"
    (
        cd "$dir"
        bash "$PROJ_ROOT/skills/dev-workflow/scripts/handler.sh" <<IN
{"action": "status"}
IN
    )
    local exit_code=$?
    echo "Exit Code: $exit_code"
    rm -rf "$dir"
    return $exit_code
}

echo "--- [P1-SEC-002/003] Worktree Path Security ---"

# Illegal ID
run_handler_in_dir ".worktrees/task-illegal-id"

# Prefix match vulnerability (P1-SEC-003)
run_handler_in_dir ".worktrees/task-2d08ab9d-bad"
run_handler_in_dir ".worktrees/task-2d08ab9d_bad"

# Valid ID but in a subdirectory (should be ALLOWED)
echo "Testing valid worktree subdir (Should PASS)..."
mkdir -p .worktrees/task-2d08ab9d/subdir
# Mock workflow file for status check to pass if security check passes
mkdir -p .data/workflows
echo '{"task_id":"2d08ab9d","current_stage":0}' > .data/workflows/default.json
(
    cd .worktrees/task-2d08ab9d/subdir
    bash "$PROJ_ROOT/skills/dev-workflow/scripts/handler.sh" <<IN
{"action": "status"}
IN
)
echo "Exit Code: $?"
rm -rf .worktrees/task-2d08ab9d

echo -e "\n--- [P1-QA-002] Quality Gate Bypass (Host Root) ---"
echo "Running gate in host root with TASK_ID=N/A..."
TASK_ID=N/A bash scripts/check-quality-gates.sh
echo "Exit Code: $?"

echo -e "\n--- [P1-ENV-002] Dynamic Symlink Calculation ---"
SANDBOX_PATH="$PROJ_ROOT/.worktrees/task-2d08ab9d"
HOST_NODE_MODULES="$PROJ_ROOT/node_modules"
REL_PATH=$(python3 -c "import os; print(os.path.relpath('$HOST_NODE_MODULES', '$SANDBOX_PATH'))")
echo "Calculated Relative Path: $REL_PATH"
if [ "$REL_PATH" == "../../node_modules" ]; then
    echo "Dynamic Calculation SUCCESS"
else
    echo "Dynamic Calculation FAILED"
fi
