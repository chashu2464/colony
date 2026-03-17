#!/bin/bash
set -euo pipefail

PROJ_ROOT=$(git rev-parse --show-toplevel)
HANDLER="$PROJ_ROOT/skills/dev-workflow/scripts/handler.sh"
ORIGINAL_BRANCH=$(git -C "$PROJ_ROOT" branch --show-current)
ROOM_ID="worktree-init-test-$(date +%s)"
WORKFLOW_FILE="$PROJ_ROOT/.data/workflows/$ROOM_ID.json"

TASK_ID=""
BRANCH_NAME=""
SANDBOX_PATH=""

cleanup() {
  if [ -n "$SANDBOX_PATH" ] && [ -d "$SANDBOX_PATH" ]; then
    git -C "$PROJ_ROOT" worktree remove "$SANDBOX_PATH" --force >/dev/null 2>&1 || true
  fi
  if [ -n "$BRANCH_NAME" ] && git -C "$PROJ_ROOT" show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
    git -C "$PROJ_ROOT" branch -D "$BRANCH_NAME" >/dev/null 2>&1 || true
  fi
  rm -f "$WORKFLOW_FILE"
  git -C "$PROJ_ROOT" checkout "$ORIGINAL_BRANCH" >/dev/null 2>&1 || true
}
trap cleanup EXIT

INIT_RESULT=$(
  COLONY_ROOM_ID="$ROOM_ID" COLONY_AGENT_ID="developer" \
    bash -lc "echo '{\"action\":\"init\",\"task_name\":\"Worktree Init Isolation Test\"}' | bash '$HANDLER'"
)

TASK_ID=$(echo "$INIT_RESULT" | jq -r '.task_id')
BRANCH_NAME="feature/task-$TASK_ID"
SANDBOX_PATH="$PROJ_ROOT/.worktrees/task-$TASK_ID"

CURRENT_BRANCH=$(git -C "$PROJ_ROOT" branch --show-current)
if [ "$CURRENT_BRANCH" != "$ORIGINAL_BRANCH" ]; then
  echo "FAIL: host branch changed from $ORIGINAL_BRANCH to $CURRENT_BRANCH during init."
  exit 1
fi

if [ ! -d "$SANDBOX_PATH" ]; then
  echo "FAIL: sandbox not created at $SANDBOX_PATH"
  exit 1
fi

SANDBOX_BRANCH=$(git -C "$SANDBOX_PATH" branch --show-current)
if [ "$SANDBOX_BRANCH" != "$BRANCH_NAME" ]; then
  echo "FAIL: sandbox branch mismatch. expected=$BRANCH_NAME actual=$SANDBOX_BRANCH"
  exit 1
fi

(
  cd "$SANDBOX_PATH"
  STATUS_RESULT=$(COLONY_ROOM_ID=default COLONY_AGENT_ID="developer" bash -lc "echo '{\"action\":\"status\"}' | bash '$HANDLER'")
  if ! echo "$STATUS_RESULT" | jq -e --arg tid "$TASK_ID" '.task_id == $tid' >/dev/null; then
    echo "FAIL: status inside sandbox did not auto-resolve workflow by task_id."
    exit 1
  fi
)

echo "PASS: init creates sandbox worktree without host branch pollution, and sandbox context resolves correctly."
