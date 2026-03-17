#!/usr/bin/env bash
set -euo pipefail

COMMON_DIR=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)
if [ -n "$COMMON_DIR" ]; then
  PROJ_ROOT=$(cd "$COMMON_DIR/.." && pwd)
else
  PROJ_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
fi
HANDLER="$PROJ_ROOT/skills/dev-workflow/scripts/handler.sh"
ROOM_ID="worktree-existing-dir-test-$(date +%s)"
WORKFLOW_FILE="$PROJ_ROOT/.data/workflows/$ROOM_ID.json"
TASK_ID="deadbeef"
FAKE_SANDBOX="$PROJ_ROOT/.worktrees/task-$TASK_ID"

cleanup() {
  rm -rf "$FAKE_SANDBOX"
  rm -f "$WORKFLOW_FILE" "$WORKFLOW_FILE.backup" "$WORKFLOW_FILE.tmp"
  git -C "$PROJ_ROOT" branch -D "feature/task-$TASK_ID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

mkdir -p "$FAKE_SANDBOX/subdir"

STATE=$(jq -n --arg id "$TASK_ID" --arg stage_name "6. Development Implementation" \
  '{task_id:$id,task_name:"existing-dir-fail-closed",description:"",current_stage:6,stage_name:$stage_name,status:"active",assignments:{"architect":"architect","developer":"developer","qa_lead":"qa-lead","tech_lead":"tech_lead"},artifacts:[],reviews:[],history:[]}')
echo "$STATE" | jq . > "$WORKFLOW_FILE"

set +e
OUTPUT=$(COLONY_ROOM_ID="$ROOM_ID" COLONY_AGENT_ID="developer" \
  bash -lc "echo '{\"action\":\"next\",\"notes\":\"validate fake sandbox is rejected\",\"evidence\":\"docs/features/worktree-isolation/TEST_CASES.md\"}' | bash '$HANDLER'" 2>&1)
STATUS=$?
set -e

if [ "$STATUS" -eq 0 ]; then
  echo "FAIL: workflow next succeeded with fake sandbox directory"
  exit 1
fi
if [[ "$OUTPUT" != *"not a registered git worktree"* ]]; then
  echo "FAIL: expected fail-closed error not found"
  echo "$OUTPUT"
  exit 1
fi

echo "PASS: existing non-worktree sandbox path is rejected fail-closed."
