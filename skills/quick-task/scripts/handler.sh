#!/bin/bash

# quick-task handler script
# Lightweight branching workflow.

STATE_DIR=".data/quick-tasks"
mkdir -p "$STATE_DIR"

ROOM_ID="${COLONY_ROOM_ID:-default}"
STATE_FILE="$STATE_DIR/$ROOM_ID.json"

# Git Helpers
function get_main_branch() {
  if git rev-parse --verify main >/dev/null 2>&1; then echo "main"
  elif git rev-parse --verify master >/dev/null 2>&1; then echo "master"
  else echo ""
  fi
}

# Read input JSON
INPUT=$(cat)
ACTION=$(echo "$INPUT" | jq -r '.action // empty')

if [ -z "$ACTION" ]; then
  echo '{"error": "Missing action parameter"}'
  exit 1
fi

case "$ACTION" in
  start)
    TASK_NAME=$(echo "$INPUT" | jq -r '.task_name // "Untitled Quick Task"')
    TASK_ID=$(date +%s)
    BRANCH_NAME="feature/quick-$TASK_ID"
    
    if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      git checkout -b "$BRANCH_NAME" >/dev/null 2>&1 || git checkout "$BRANCH_NAME" >/dev/null 2>&1
    fi

    cat > "$STATE_FILE" <<EOF
{
  "task_id": "$TASK_ID",
  "task_name": "$TASK_NAME",
  "branch": "$BRANCH_NAME",
  "status": "in_progress",
  "started_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
    cat "$STATE_FILE"
    ;;

  done)
    if [ ! -f "$STATE_FILE" ]; then
      echo '{"error": "No active quick-task found for this room."}'
      exit 1
    fi
    
    BRANCH_NAME=$(jq -r '.branch' "$STATE_FILE")
    TASK_NAME=$(jq -r '.task_name' "$STATE_FILE")
    TASK_ID=$(jq -r '.task_id' "$STATE_FILE")
    MAIN_BRANCH=$(get_main_branch)

    if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      # Commit any pending changes on feature branch before merge
      git add . 2>/dev/null
      if ! git diff-index --quiet HEAD -- 2>/dev/null; then
        git commit -m "feat: wip for quick task $TASK_ID" --no-verify >/dev/null 2>&1
      fi
      # Stash any remaining untracked/ignored changes before switching
      local stashed=false
      if [ ! -z "$(git status --porcelain 2>/dev/null)" ]; then
        git stash push -m "quick-task-merge-stash" --quiet 2>/dev/null && stashed=true
      fi
      git checkout "$MAIN_BRANCH" >/dev/null 2>&1
      
      if git merge --squash "$BRANCH_NAME" >/dev/null 2>&1; then
        git commit -m "feat: complete quick task $TASK_ID - $TASK_NAME" --no-verify >/dev/null 2>&1
        git branch -D "$BRANCH_NAME" >/dev/null 2>&1
        rm "$STATE_FILE"
        echo "{\"success\": true, \"message\": \"Task $TASK_ID completed and merged to $MAIN_BRANCH\"}"
      else
        # Abort failed merge and return to feature branch
        git merge --abort >/dev/null 2>&1
        git checkout "$BRANCH_NAME" >/dev/null 2>&1
        if [ "$stashed" = true ]; then
          git stash pop --quiet 2>/dev/null
        fi
        echo '{"error": "Merge conflict detected. Merge aborted and returned to feature branch. Please resolve manually."}'
        exit 1
      fi
    fi
    ;;

  status)
    if [ ! -f "$STATE_FILE" ]; then
      echo '{"status": "idle"}'
    else
      cat "$STATE_FILE"
    fi
    ;;

  *)
    echo "{"error": "Unknown action: $ACTION"}"
    exit 1
    ;;
esac
