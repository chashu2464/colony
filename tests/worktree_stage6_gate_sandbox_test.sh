#!/usr/bin/env bash
set -euo pipefail

COMMON_DIR=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)
if [ -n "$COMMON_DIR" ]; then
  PROJ_ROOT=$(cd "$COMMON_DIR/.." && pwd)
else
  PROJ_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
fi
HANDLER="$PROJ_ROOT/skills/dev-workflow/scripts/handler.sh"
ROOM_ID="worktree-stage6-gate-test-$(date +%s)"
WORKFLOW_FILE="$PROJ_ROOT/.data/workflows/$ROOM_ID.json"
TASK_ID=""
BRANCH_NAME=""
SANDBOX_PATH=""

cleanup() {
  if [ -n "$SANDBOX_PATH" ] && [ -d "$SANDBOX_PATH" ]; then
    git -C "$PROJ_ROOT" worktree remove "$SANDBOX_PATH" --force >/dev/null 2>&1 || true
  fi
  if [ -n "$BRANCH_NAME" ]; then
    git -C "$PROJ_ROOT" branch -D "$BRANCH_NAME" >/dev/null 2>&1 || true
  fi
  rm -f "$WORKFLOW_FILE" "$WORKFLOW_FILE.backup" "$WORKFLOW_FILE.tmp"
}
trap cleanup EXIT

INIT_RESULT=$(COLONY_ROOM_ID="$ROOM_ID" COLONY_AGENT_ID="developer" \
  bash -lc "echo '{\"action\":\"init\",\"task_name\":\"Worktree Stage6 Gate Test\"}' | bash '$HANDLER'")
TASK_ID=$(echo "$INIT_RESULT" | jq -r '.task_id')
BRANCH_NAME="feature/task-$TASK_ID"
SANDBOX_PATH="$PROJ_ROOT/.worktrees/task-$TASK_ID"

cat > "$SANDBOX_PATH/scripts/generate-tdd-log.js" <<'EOF'
if (process.argv.includes('--verify')) process.exit(0);
process.exit(0);
EOF

cat > "$SANDBOX_PATH/scripts/check-quality-gates.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
pwd > .gate-cwd
exit 0
EOF
chmod +x "$SANDBOX_PATH/scripts/check-quality-gates.sh"

TMP_STATE=$(mktemp)
jq '.current_stage = 6 | .stage_name = "6. Development Implementation"' "$WORKFLOW_FILE" > "$TMP_STATE"
mv "$TMP_STATE" "$WORKFLOW_FILE"

COLONY_ROOM_ID="$ROOM_ID" COLONY_AGENT_ID="developer" \
  bash -lc "echo '{\"action\":\"next\",\"notes\":\"Stage6 gate sandbox execution test\",\"evidence\":\"docs/features/worktree-isolation/TEST_CASES.md\"}' | bash '$HANDLER'" >/dev/null

if [ "$(jq -r '.current_stage' "$WORKFLOW_FILE")" != "7" ]; then
  echo "FAIL: workflow did not advance to stage 7"
  exit 1
fi
if [ "$(cat "$SANDBOX_PATH/.gate-cwd")" != "$SANDBOX_PATH" ]; then
  echo "FAIL: quality gate did not execute in sandbox path"
  exit 1
fi

echo "PASS: stage 6 quality gate executes in sandbox worktree and advances workflow to stage 7."
