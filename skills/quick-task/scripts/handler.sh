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
      # Add all changes
      git add .
      # If there are changes to commit on the feature branch
      if ! git diff-index --quiet HEAD -- 2>/dev/null; then
        git commit -m "feat: wip for quick task $TASK_ID" --no-verify >/dev/null 2>&1
      fi
      
      git checkout "$MAIN_BRANCH" >/dev/null 2>&1
      
      if git merge --squash "$BRANCH_NAME" >/dev/null 2>&1; then
        git commit -m "feat: complete quick task $TASK_ID - $TASK_NAME" --no-verify >/dev/null 2>&1
        git branch -D "$BRANCH_NAME" >/dev/null 2>&1
        rm "$STATE_FILE"
        echo "{"success": true, "message": "Task $TASK_ID completed and merged to $MAIN_BRANCH"}"
      else
        echo '{"error": "Merge conflict detected. Please resolve manually on master branch."}'
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
