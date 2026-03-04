#!/bin/bash

# dev-workflow v2.1 handler script
# Uses jq to manage session-specific workflow state according to docs/SKILL_DESIGN.md.
# Enhanced with mandatory branching and squash merge.

WORKFLOW_DIR=".data/workflows"
mkdir -p "$WORKFLOW_DIR"

ROOM_ID="${COLONY_ROOM_ID:-default}"
WORKFLOW_FILE="$WORKFLOW_DIR/$ROOM_ID.json"

STAGES=(
  "0. Brainstorming"
  "1. Initial Requirements (IR)"
  "2. System/Architectural Design (SR/AR)"
  "3. Forward Briefing"
  "4. Reverse Briefing"
  "5. Test Case Design"
  "6. Development Implementation"
  "7. Integration Testing"
  "8. Go-Live Review"
)

# Notification Helper
function get_next_actor_role() {
  local stage=$1
  case $stage in
    0|1|2) echo "architect" ;;
    3|6) echo "developer" ;;
    4|5|7) echo "qa_lead" ;;
    8) echo "tech_lead" ;;
    *) echo "developer" ;;
  esac
}

function notify_server() {
  local from=$1
  local to=$2
  local role=$(get_next_actor_role $to)
  local actor=$(jq -r --arg role "$role" '.assignments[$role] // empty' "$WORKFLOW_FILE")
  
  if [ ! -z "$actor" ]; then
    # Use the port from environment or default to 3001
    local port="${PORT:-3001}"
    # Delay notification to let the current CLI invocation finish processing
    # the skill response before a new agent is triggered. Without this delay,
    # the server would spawn a new CLI process while the current one is still
    # running, potentially causing OOM kills.
    (sleep 2 && curl -X POST "http://localhost:${port}/api/workflow/events" \
      -H "Content-Type: application/json" \
      -d "{
        \"type\": \"WORKFLOW_STAGE_CHANGED\",
        \"roomId\": \"$ROOM_ID\",
        \"from_stage\": $from,
        \"to_stage\": $to,
        \"next_actor\": \"$actor\"
      }" \
      --silent --show-error > /dev/null 2>&1 || echo "Warning: Failed to send workflow event notification" >&2) &
  fi
}

# Git Helpers
function get_git_hash() {
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git rev-parse HEAD 2>/dev/null || echo ""
  else
    echo ""
  fi
}

function get_main_branch() {
  if git rev-parse --verify main >/dev/null 2>&1; then echo "main"
  elif git rev-parse --verify master >/dev/null 2>&1; then echo "master"
  else echo ""
  fi
}

function do_git_commit() {
  local stage_num=$1
  local stage_name=$2
  local msg=$3
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if ! git diff-index --quiet HEAD -- 2>/dev/null; then
      git add .
      git commit -m "chore(workflow): Advance to stage $stage_num - $stage_name" -m "Notes: $msg" --no-verify >/dev/null 2>&1
    fi
  fi
}

function ensure_feature_branch() {
  local branch=$1
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    local current=$(git branch --show-current)
    if [ "$current" != "$branch" ]; then
      git checkout "$branch" >/dev/null 2>&1 || git checkout -b "$branch" >/dev/null 2>&1
    fi
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
  init)
    TASK_NAME=$(echo "$INPUT" | jq -r '.task_name // "Untitled Task"')
    DESCRIPTION=$(echo "$INPUT" | jq -r '.description // ""')
    ASSIGNMENTS=$(echo "$INPUT" | jq -c '.assignments // {"architect":null,"tech_lead":null,"qa_lead":null,"developer":null}')
    
    TASK_ID="$(uuidgen 2>/dev/null | tr '[:upper:]' '[:lower:]' | cut -c1-8 || echo $RANDOM-$RANDOM)"
    
    # Create feature branch immediately
    BRANCH_NAME="feature/task-${TASK_ID}"
    if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      git checkout -b "$BRANCH_NAME" >/dev/null 2>&1 || git checkout "$BRANCH_NAME" >/dev/null 2>&1
    fi

    cat > "$WORKFLOW_FILE" <<EOF
{
  "task_id": "$TASK_ID",
  "task_name": "$TASK_NAME",
  "description": "$DESCRIPTION",
  "current_stage": 0,
  "stage_name": "${STAGES[0]}",
  "status": "active",
  "assignments": $ASSIGNMENTS,
  "artifacts": [],
  "reviews": [],
  "history": []
}
EOF
    # Log init to history
    CURRENT_HASH=$(get_git_hash)
    HISTORY_ENTRY=$(jq -n --arg actor "$COLONY_AGENT_ID" --arg notes "Workflow initialized and branch $BRANCH_NAME created" --arg hash "$CURRENT_HASH" '{from_stage: null, to_stage: 0, action: "init", actor: $actor, notes: $notes, git_commit_hash: $hash, timestamp: "'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'" }')
    jq --argjson entry "$HISTORY_ENTRY" '.history += [$entry]' "$WORKFLOW_FILE" > "${WORKFLOW_FILE}.tmp" && mv "${WORKFLOW_FILE}.tmp" "$WORKFLOW_FILE"
    
    cat "$WORKFLOW_FILE"
    ;;

  next)
    if [ ! -f "$WORKFLOW_FILE" ]; then
      echo '{"error": "Workflow not initialized. Run init first."}'
      exit 1
    fi
    
    NOTES=$(echo "$INPUT" | jq -r '.notes // ""')
    EVIDENCE=$(echo "$INPUT" | jq -r '.evidence // empty')
    
    CURRENT=$(jq -r '.current_stage' "$WORKFLOW_FILE")
    NEXT=$((CURRENT + 1))
    
    if [ $NEXT -ge ${#STAGES[@]} ]; then
      echo '{"error": "Workflow already completed. (Last stage: 8. Go-Live Review)"}'
      exit 0
    fi

    # Evidence Validation
    if [ ! -z "$EVIDENCE" ]; then
      if [ ! -e "$EVIDENCE" ] && [ ! -d "$EVIDENCE" ]; then
         echo "{\"error\": \"Evidence path not found: $EVIDENCE\"}"
         exit 1
      fi
      # Add to artifacts
      ARTIFACT=$(jq -n --arg stage "$CURRENT" --arg path "$EVIDENCE" --arg desc "$NOTES" '{stage: ($stage|tonumber), path: $path, description: $desc, created_at: "'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'" }')
      jq --argjson art "$ARTIFACT" '.artifacts += [$art]' "$WORKFLOW_FILE" > "${WORKFLOW_FILE}.tmp" && mv "${WORKFLOW_FILE}.tmp" "$WORKFLOW_FILE"
    elif [ $CURRENT -gt 0 ]; then
      echo '{"error": "Evidence (file path) is mandatory for advancing beyond Brainstorming stage."}'
      exit 1
    fi

    # Guardrails for critical stages requiring approval
    case $CURRENT in
      2|3|4|5|7|8)
        APPROVED=$(jq --arg stage "$CURRENT" '.reviews | map(select(.stage == ($stage|tonumber) and .status == "approved")) | length' "$WORKFLOW_FILE")
        if [ "$APPROVED" -eq 0 ]; then
          echo "{\"error\": \"Stage $CURRENT (${STAGES[$CURRENT]}) requires an approved review before proceeding.\"}"
          exit 1
        fi
        ;;
    esac
    
    # Ensure we are on the feature branch
    TASK_ID=$(jq -r '.task_id' "$WORKFLOW_FILE")
    TASK_NAME=$(jq -r '.task_name' "$WORKFLOW_FILE")
    BRANCH_NAME="feature/task-${TASK_ID}"
    
    if [ "$NEXT" -le 7 ]; then
      ensure_feature_branch "$BRANCH_NAME"
    fi

    # Handle completion and merge
    if [ "$NEXT" -eq 8 ]; then
      if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        # Commit remaining work on feature branch
        do_git_commit "$CURRENT" "${STAGES[$CURRENT]}" "Final changes before merge"
        
        # Squash Merge back to main branch
        MAIN_BRANCH=$(get_main_branch)
        if [ ! -z "$MAIN_BRANCH" ]; then
          git checkout "$MAIN_BRANCH" >/dev/null 2>&1
          log_msg="feat: complete task $TASK_ID - $TASK_NAME"
          if git merge --squash "$BRANCH_NAME" >/dev/null 2>&1; then
            git commit -m "$log_msg" --no-verify >/dev/null 2>&1
            git branch -D "$BRANCH_NAME" >/dev/null 2>&1
          else
            echo '{"error": "Merge conflict detected. Please resolve manually on master branch."}'
            exit 1
          fi
        fi
      fi
    else
      do_git_commit "$NEXT" "${STAGES[$NEXT]}" "$NOTES"
    fi

    CURRENT_HASH=$(get_git_hash)

    # Store history
    HISTORY_ENTRY=$(jq -n --arg from "$CURRENT" --arg to "$NEXT" --arg actor "$COLONY_AGENT_ID" --arg notes "$NOTES" --arg hash "$CURRENT_HASH" '{from_stage: ($from|tonumber), to_stage: ($to|tonumber), action: "next", actor: $actor, notes: $notes, git_commit_hash: $hash, timestamp: "'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'" }')
    
    jq --arg next "$NEXT" --arg next_name "${STAGES[$NEXT]}" --argjson entry "$HISTORY_ENTRY" \
      '.current_stage = ($next|tonumber) | .stage_name = $next_name | .status = "active" | .history += [$entry]' \
      "$WORKFLOW_FILE" > "${WORKFLOW_FILE}.tmp" && mv "${WORKFLOW_FILE}.tmp" "$WORKFLOW_FILE"
    
    # Notify next actor
    notify_server $CURRENT $NEXT

    cat "$WORKFLOW_FILE"
    ;;

  submit-review)
    if [ ! -f "$WORKFLOW_FILE" ]; then
      echo '{"error": "Workflow not initialized."}'
      exit 1
    fi
    
    STATUS=$(echo "$INPUT" | jq -r '.status // empty') # approved | rejected
    COMMENTS=$(echo "$INPUT" | jq -r '.comments // ""')
    CURRENT=$(jq -r '.current_stage' "$WORKFLOW_FILE")
    
    if [[ "$STATUS" != "approved" && "$STATUS" != "rejected" ]]; then
      echo '{"error": "Invalid review status. Use approved or rejected."}'
      exit 1
    fi
    
    REVIEW=$(jq -n --arg stage "$CURRENT" --arg reviewer "$COLONY_AGENT_ID" --arg status "$STATUS" --arg comments "$COMMENTS" \
      '{stage: ($stage|tonumber), reviewer: $reviewer, status: $status, comments: $comments, timestamp: "'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'" }')
    
    WF_STATUS="active"
    if [ "$STATUS" == "rejected" ]; then WF_STATUS="blocked"; fi
    
    jq --argjson review "$REVIEW" --arg wf_status "$WF_STATUS" \
      '.reviews += [$review] | .status = $wf_status' \
      "$WORKFLOW_FILE" > "${WORKFLOW_FILE}.tmp" && mv "${WORKFLOW_FILE}.tmp" "$WORKFLOW_FILE"
      
    cat "$WORKFLOW_FILE"
    ;;

  backtrack)
    if [ ! -f "$WORKFLOW_FILE" ]; then
      echo '{"error": "Workflow not initialized."}'
      exit 1
    fi

    TARGET=$(echo "$INPUT" | jq -r '.target_stage // empty')
    REASON=$(echo "$INPUT" | jq -r '.reason // "Backtrack requested"')
    CURRENT=$(jq -r '.current_stage' "$WORKFLOW_FILE")
    
    if [ -z "$TARGET" ]; then
       echo '{"error": "Missing target_stage for backtrack."}'
       exit 1
    fi
    
    if [ $TARGET -ge $CURRENT ]; then
       echo '{"error": "Target stage must be less than current stage."}'
       exit 1
    fi
    
    # Retrieve the last known git hash for the target stage from history
    TARGET_HASH=$(jq -r --arg target "$TARGET" '
      .history | map(select(.to_stage == ($target|tonumber) and .git_commit_hash != null and .git_commit_hash != "")) | last | .git_commit_hash // empty
    ' "$WORKFLOW_FILE")

    CURRENT_HASH=$(get_git_hash)
    HISTORY_ENTRY=$(jq -n --arg from "$CURRENT" --arg to "$TARGET" --arg actor "$COLONY_AGENT_ID" --arg notes "$REASON" --arg hash "$CURRENT_HASH" \
      '{from_stage: ($from|tonumber), to_stage: ($to|tonumber), action: "backtrack", actor: $actor, notes: $notes, git_commit_hash: $hash, timestamp: "'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'" }')
    
    jq --arg target "$TARGET" --arg target_name "${STAGES[$TARGET]}" --argjson entry "$HISTORY_ENTRY" \
      '.current_stage = ($target|tonumber) | .stage_name = $target_name | .status = "active" | .history += [$entry]' \
      "$WORKFLOW_FILE" > "${WORKFLOW_FILE}.tmp" && mv "${WORKFLOW_FILE}.tmp" "$WORKFLOW_FILE"
      
    if [ ! -z "$TARGET_HASH" ]; then
      TASK_ID=$(jq -r '.task_id' "$WORKFLOW_FILE")
      WARNING_MSG="Workflow backtracked. You should ensure you are on branch feature/task-${TASK_ID}. To explicitly rollback workspace files to Stage $TARGET, execute: git reset --hard $TARGET_HASH (WARNING: destructs uncommitted files)"
      jq --arg msg "$WARNING_MSG" '.warning = $msg' "$WORKFLOW_FILE"
    else
      cat "$WORKFLOW_FILE"
    fi
    ;;

  status)
    if [ ! -f "$WORKFLOW_FILE" ]; then
      echo '{"error": "Workflow not initialized."}'
      exit 1
    fi
    cat "$WORKFLOW_FILE"
    ;;

  update)
    if [ ! -f "$WORKFLOW_FILE" ]; then
      echo '{"error": "Workflow not initialized."}'
      exit 1
    fi
    
    jq --argjson input "$INPUT" \
      'if $input.description then .description = $input.description else . end |
       if $input.assignments then .assignments = (.assignments + $input.assignments) else . end |
       if $input.task_name then .task_name = $input.task_name else . end' \
      "$WORKFLOW_FILE" > "${WORKFLOW_FILE}.tmp" && mv "${WORKFLOW_FILE}.tmp" "$WORKFLOW_FILE"
    
    cat "$WORKFLOW_FILE"
    ;;

  *)
    echo "{\"error\": \"Unknown action: $ACTION\"}"
    exit 1
    ;;
esac
