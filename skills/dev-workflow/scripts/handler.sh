#!/bin/bash

# dev-workflow v2.2 handler script
# Uses jq to manage session-specific workflow state according to docs/SKILL_DESIGN.md.
# Phase 6 upgrade: added prev action, robust evidence validation, tech_lead role enforcement, and jq input verification.

PROJ_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
WORKFLOW_DIR="$PROJ_ROOT/.data/workflows"
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
  "9. Completed"
)

# Notification Helper
function get_next_actor_role() {
  local stage=$1
  
  # Try to use the new SSOT parser (Direction 1)
  local script_path="scripts/parse-workflow-table.js"
  if [ -f "$script_path" ]; then
    local role=$(node "$script_path" | jq -r --arg stage "$stage" '.[$stage].primaryRole // empty')
    if [ ! -z "$role" ] && [ "$role" != "null" ]; then
      echo "$role"
      return 0
    fi
  fi

  # Fallback to hardcoded logic if parser fails or file missing
  case $stage in
    0|1|2) echo "architect" ;;
    3|6) echo "developer" ;;
    4|5|7) echo "qa_lead" ;;
    8) 
      # Fallback to developer if tech_lead is not assigned
      local tl=$(jq -r '.assignments["tech_lead"] // .roles["tech_lead"] // empty' "$WORKFLOW_FILE")
      if [ -z "$tl" ] || [ "$tl" == "null" ]; then
        echo "developer"
      else
        echo "tech_lead"
      fi
      ;;
    *) echo "developer" ;;
  esac
}

function validate_assignments() {
  local assignments="$1"
  # Check if any value contains / or @ (heuristic for file paths or malformed IDs)
  local invalid=$(echo "$assignments" | jq -r 'to_entries[] | select(.value != null) | select(.value | contains("/") or contains("@")) | .key')
  if [ ! -z "$invalid" ]; then
    echo "Error: Invalid agent ID for role(s): $invalid. Expected agent ID (e.g., 'developer'), got file path or malformed string." >&2
    return 1
  fi
  return 0
}

function notify_server() {
  local from=$1
  local to=$2
  local role=$(get_next_actor_role $to)
  # Check assignments (legacy support for roles is handled during state loading/saving)
  local actor=$(jq -r --arg role "$role" '.assignments[$role] // empty' "$WORKFLOW_FILE")
  
  if [ ! -z "$actor" ]; then
    # Use the port from environment or default to 3001
    local port="${PORT:-3001}"
    # Delay notification to let the current CLI invocation finish processing
    # the skill response before a new agent is triggered.
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
    # Check both tracked changes AND untracked files
    local has_changes=false
    if ! git diff-index --quiet HEAD -- 2>/dev/null; then has_changes=true; fi
    if [ -n "$(git ls-files --others --exclude-standard 2>/dev/null)" ]; then has_changes=true; fi
    if [ "$has_changes" = true ]; then
      git add . 2>/dev/null
      if ! git commit -m "chore(workflow): Advance to stage $stage_num - $stage_name" -m "Notes: $msg" --no-verify >/dev/null 2>&1; then
        echo "Warning: git commit failed (stage $stage_num), continuing without commit" >&2
      fi
    fi
  fi
}

function ensure_feature_branch() {
  local branch=$1
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    local current=$(git branch --show-current)
    if [ "$current" != "$branch" ]; then
      # Auto-stash dirty changes to prevent checkout failure
      local stashed=false
      if [ ! -z "$(git status --porcelain 2>/dev/null)" ]; then
        git stash push -m "workflow-auto-stash" --quiet 2>/dev/null && stashed=true
      fi
      if ! git checkout "$branch" >/dev/null 2>&1; then
        if ! git checkout -b "$branch" >/dev/null 2>&1; then
          echo "Warning: Failed to switch to branch $branch, staying on $current" >&2
        fi
      fi
      # Restore stashed changes
      if [ "$stashed" = true ]; then
        git stash pop --quiet 2>/dev/null || echo "Warning: Failed to restore stashed changes" >&2
      fi
    fi
  fi
}

# State Helper
function log_history() {
  local from=$1
  local to=$2
  local action=$3
  local actor=$4
  local notes=$5
  local hash=$6
  
  # Ensure we have numeric values for from/to if not null
  local from_val="null"
  if [ ! -z "$from" ] && [ "$from" != "null" ]; then from_val=$from; fi
  local to_val="null"
  if [ ! -z "$to" ] && [ "$to" != "null" ]; then to_val=$to; fi

  local history_entry=$(jq -n --argjson from "$from_val" --argjson to "$to_val" --arg action "$action" --arg actor "$actor" --arg notes "$notes" --arg hash "$hash" \
    '{from_stage: $from, to_stage: $to, action: $action, actor: $actor, notes: $notes, git_commit_hash: $hash, timestamp: "'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'" }')
  jq --argjson entry "$history_entry" '.history += [$entry]' "$WORKFLOW_FILE" > "${WORKFLOW_FILE}.tmp" && mv "${WORKFLOW_FILE}.tmp" "$WORKFLOW_FILE"
}

# Read input JSON
INPUT=$(cat)

# JSON validation
JSON_ERROR=$(echo "$INPUT" | jq . 2>&1 >/dev/null)
if [ $? -ne 0 ]; then
  # Clean up the error message to be JSON-safe
  CLEAN_ERROR=$(echo "$JSON_ERROR" | tr -d '\n' | tr '"' "'")
  echo "{\"error\": \"Invalid JSON input: $CLEAN_ERROR\"}"
  exit 1
fi

ACTION=$(echo "$INPUT" | jq -r '.action // empty')

if [ -z "$ACTION" ]; then
  echo '{"error": "Missing action parameter"}'
  exit 1
fi

case "$ACTION" in
  init)
    TASK_NAME=$(echo "$INPUT" | jq -r '.task_name // "Untitled Task"')
    DESCRIPTION=$(echo "$INPUT" | jq -r '.description // ""')
    # Support both 'roles' and 'assignments' for input
    ASSIGNMENTS=$(echo "$INPUT" | jq -c '.assignments // .roles // {"architect":null,"tech_lead":null,"qa_lead":null,"developer":null}')
    
    if ! validate_assignments "$ASSIGNMENTS"; then
      exit 1
    fi

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
    log_history "null" 0 "init" "$COLONY_AGENT_ID" "Workflow initialized and branch $BRANCH_NAME created" "$CURRENT_HASH"
    
    cat "$WORKFLOW_FILE"
    ;;

  next)
    if [ ! -f "$WORKFLOW_FILE" ]; then
      echo '{"error": "Workflow not initialized. Run init first."}'
      exit 1
    fi
    
    NOTES=$(echo "$INPUT" | jq -r '.notes // ""')
    EVIDENCE=$(echo "$INPUT" | jq -r '.evidence // empty' | xargs)
    
    CURRENT=$(jq -r '.current_stage' "$WORKFLOW_FILE")
    NEXT=$((CURRENT + 1))
    
    if [ $NEXT -ge ${#STAGES[@]} ]; then
      echo "{\"error\": \"Workflow already completed. (Last stage: $(( ${#STAGES[@]} - 1 )). ${STAGES[$(( ${#STAGES[@]} - 1 ))]})\"}"
      exit 0
    fi

    # Evidence Validation
    if [ ! -z "$EVIDENCE" ] && [ "$EVIDENCE" != "null" ]; then
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
      2|3|4|5|7)
        APPROVED=$(jq --arg stage "$CURRENT" '.reviews | map(select(.stage == ($stage|tonumber) and .status == "approved")) | length' "$WORKFLOW_FILE")
        if [ "$APPROVED" -eq 0 ]; then
          echo "{\"error\": \"Stage $CURRENT (${STAGES[$CURRENT]}) requires an approved review before proceeding.\"}"
          exit 1
        fi
        ;;
      8)
        # Stage 8 gate: working tree must be clean (no untracked or modified files)
        if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
          UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null)
          UNSTAGED=$(git status --porcelain 2>/dev/null)
          if [ -n "$UNTRACKED" ] || [ -n "$UNSTAGED" ]; then
            echo "{\"error\": \"Stage 8 (Go-Live Review) gate: working tree is not clean. Please commit or stash all changes before proceeding to Go-Live Review.\nUncommitted files:\n$(git status --short 2>/dev/null)\"}"
            exit 1
          fi
        fi
        # Stage 8 requires approval from the assigned tech_lead, falling back to developer
        TL_ACTOR=$(jq -r '.assignments["tech_lead"] // .roles["tech_lead"] // empty' "$WORKFLOW_FILE")
        if [ -z "$TL_ACTOR" ] || [ "$TL_ACTOR" == "null" ]; then
           # Fallback to developer
           TL_ACTOR=$(jq -r '.assignments["developer"] // .roles["developer"] // empty' "$WORKFLOW_FILE")
        fi
        
        if [ -z "$TL_ACTOR" ] || [ "$TL_ACTOR" == "null" ]; then
           echo "{\"error\": \"Stage 8 (Go-Live Review) cannot proceed: No tech_lead or developer is assigned to this task.\"}"
           exit 1
        fi
        APPROVED=$(jq --arg stage "$CURRENT" --arg tl "$TL_ACTOR" '.reviews | map(select(.stage == ($stage|tonumber) and .status == "approved" and .reviewer == $tl)) | length' "$WORKFLOW_FILE")
        if [ "$APPROVED" -eq 0 ]; then
          echo "{\"error\": \"Stage 8 (Go-Live Review) requires an approved review from the assigned leader ($TL_ACTOR) before completion.\"}"
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
    if [ "$NEXT" -eq 9 ]; then
      if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        # Commit remaining work on feature branch
        do_git_commit "$CURRENT" "${STAGES[$CURRENT]}" "Final changes before merge"
        
        # Squash Merge back to main branch
        MAIN_BRANCH=$(get_main_branch)
        if [ ! -z "$MAIN_BRANCH" ]; then
          # Stash any uncommitted changes before switching
          merge_stashed=false
          if [ ! -z "$(git status --porcelain 2>/dev/null)" ]; then
            git stash push -m "workflow-merge-stash" --quiet 2>/dev/null && merge_stashed=true
          fi
          git checkout "$MAIN_BRANCH" >/dev/null 2>&1
          log_msg="feat: complete task $TASK_ID - $TASK_NAME"
          if git merge --squash "$BRANCH_NAME" >/dev/null 2>&1; then
            git commit -m "$log_msg" --no-verify >/dev/null 2>&1
            git branch -D "$BRANCH_NAME" >/dev/null 2>&1
          else
            # Abort the failed merge to restore clean state
            git merge --abort >/dev/null 2>&1
            # Return to feature branch so repo isn't left on master with conflicts
            git checkout "$BRANCH_NAME" >/dev/null 2>&1
            if [ "$merge_stashed" = true ]; then
              git stash pop --quiet 2>/dev/null
            fi
            echo '{"error": "Merge conflict detected. Merge aborted and returned to feature branch. Please resolve manually."}'
            exit 1
          fi
        fi
      fi
    else
      do_git_commit "$NEXT" "${STAGES[$NEXT]}" "$NOTES"
    fi

    CURRENT_HASH=$(get_git_hash)

    # Store history and update stage
    log_history "$CURRENT" "$NEXT" "next" "$COLONY_AGENT_ID" "$NOTES" "$CURRENT_HASH"
    
    # Set status to completed if Stage 9
    FINAL_STATUS="active"
    if [ "$NEXT" -eq 9 ]; then FINAL_STATUS="completed"; fi

    jq --arg next "$NEXT" --arg next_name "${STAGES[$NEXT]}" --arg status "$FINAL_STATUS" \
      '.current_stage = ($next|tonumber) | .stage_name = $next_name | .status = $status' \
      "$WORKFLOW_FILE" > "${WORKFLOW_FILE}.tmp" && mv "${WORKFLOW_FILE}.tmp" "$WORKFLOW_FILE"

    # Notify server to wake up next actor (system will automatically handle it, no manual @mention needed)
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

  prev)
    if [ ! -f "$WORKFLOW_FILE" ]; then
      echo '{"error": "Workflow not initialized."}'
      exit 1
    fi

    # Safety check: ensure working directory is clean before rollback
    if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      if [ ! -z "$(git status --porcelain)" ]; then
        echo '{"error": "Working directory is dirty. Please commit or stash your changes before using prev action to prevent data loss."}'
        exit 1
      fi
    fi

    REASON=$(echo "$INPUT" | jq -r '.reason // "Backtrack to previous stage requested"')
    CURRENT=$(jq -r '.current_stage' "$WORKFLOW_FILE")
    STATUS=$(jq -r '.status' "$WORKFLOW_FILE")

    if [ "$STATUS" == "completed" ]; then
       echo '{"error": "Workflow is already completed. Cannot backtrack."}'
       exit 1
    fi
    
    if [ "$CURRENT" -eq 0 ]; then
       echo '{"error": "Already at Stage 0. Cannot go back further."}'
       exit 1
    fi
    
    TARGET=$((CURRENT - 1))
    
    # Retrieve the last known git hash for the target stage from history
    TARGET_HASH=$(jq -r --arg target "$TARGET" '
      .history | map(select(.to_stage == ($target|tonumber) and .git_commit_hash != null and .git_commit_hash != "")) | last | .git_commit_hash // empty
    ' "$WORKFLOW_FILE")

    CURRENT_HASH=$(get_git_hash)
    log_history "$CURRENT" "$TARGET" "prev" "$COLONY_AGENT_ID" "$REASON" "$CURRENT_HASH"
    
    jq --arg target "$TARGET" --arg target_name "${STAGES[$TARGET]}" \
      '.current_stage = ($target|tonumber) | .stage_name = $target_name | .status = "active"' \
      "$WORKFLOW_FILE" > "${WORKFLOW_FILE}.tmp" && mv "${WORKFLOW_FILE}.tmp" "$WORKFLOW_FILE"
      
    # Notify server to wake up next actor (system will automatically handle it, no manual @mention needed)
    notify_server $CURRENT $TARGET
      
    if [ ! -z "$TARGET_HASH" ] && [ "$TARGET_HASH" != "null" ]; then
      TASK_ID=$(jq -r '.task_id' "$WORKFLOW_FILE")
      WARNING_MSG="Workflow rolled back to Stage $TARGET. To explicitly rollback workspace files, execute: git reset --hard $TARGET_HASH (WARNING: destructs uncommitted files)"
      jq --arg msg "$WARNING_MSG" '.warning = $msg' "$WORKFLOW_FILE" > "${WORKFLOW_FILE}.tmp" && mv "${WORKFLOW_FILE}.tmp" "$WORKFLOW_FILE"
    fi
    
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
    STATUS=$(jq -r '.status' "$WORKFLOW_FILE")

    if [ "$STATUS" == "completed" ]; then
       echo '{"error": "Workflow is already completed. Cannot backtrack."}'
       exit 1
    fi
    
    if [ -z "$TARGET" ] || [ "$TARGET" == "null" ]; then
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
    log_history "$CURRENT" "$TARGET" "backtrack" "$COLONY_AGENT_ID" "$REASON" "$CURRENT_HASH"
    
    jq --arg target "$TARGET" --arg target_name "${STAGES[$TARGET]}" \
      '.current_stage = ($target|tonumber) | .stage_name = $target_name | .status = "active"' \
      "$WORKFLOW_FILE" > "${WORKFLOW_FILE}.tmp" && mv "${WORKFLOW_FILE}.tmp" "$WORKFLOW_FILE"
      
    # Notify server to wake up next actor (system will automatically handle it, no manual @mention needed)
    notify_server $CURRENT $TARGET
      
    if [ ! -z "$TARGET_HASH" ] && [ "$TARGET_HASH" != "null" ]; then
      TASK_ID=$(jq -r '.task_id' "$WORKFLOW_FILE")
      WARNING_MSG="Workflow backtracked to Stage $TARGET. To explicitly rollback workspace files, execute: git reset --hard $TARGET_HASH (WARNING: destructs uncommitted files)"
      jq --arg msg "$WARNING_MSG" '.warning = $msg' "$WORKFLOW_FILE" > "${WORKFLOW_FILE}.tmp" && mv "${WORKFLOW_FILE}.tmp" "$WORKFLOW_FILE"
    fi

    cat "$WORKFLOW_FILE"
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

    # Support both 'roles' and 'assignments'
    NEW_ASSIGNMENTS=$(echo "$INPUT" | jq -c '.assignments // .roles // empty')
    if [ ! -z "$NEW_ASSIGNMENTS" ] && [ "$NEW_ASSIGNMENTS" != "null" ]; then
      if ! validate_assignments "$NEW_ASSIGNMENTS"; then
        exit 1
      fi
      jq --argjson assignments "$NEW_ASSIGNMENTS" '.assignments = $assignments' "$WORKFLOW_FILE" > "${WORKFLOW_FILE}.tmp" && mv "${WORKFLOW_FILE}.tmp" "$WORKFLOW_FILE"
    fi
    
    # Update other fields if provided
    TASK_NAME=$(echo "$INPUT" | jq -r '.task_name // empty')
    if [ ! -z "$TASK_NAME" ] && [ "$TASK_NAME" != "null" ]; then
       jq --arg name "$TASK_NAME" '.task_name = $name' "$WORKFLOW_FILE" > "${WORKFLOW_FILE}.tmp" && mv "${WORKFLOW_FILE}.tmp" "$WORKFLOW_FILE"
    fi

    DESCRIPTION=$(echo "$INPUT" | jq -r '.description // empty')
    if [ ! -z "$DESCRIPTION" ] && [ "$DESCRIPTION" != "null" ]; then
       jq --arg desc "$DESCRIPTION" '.description = $desc' "$WORKFLOW_FILE" > "${WORKFLOW_FILE}.tmp" && mv "${WORKFLOW_FILE}.tmp" "$WORKFLOW_FILE"
    fi

    cat "$WORKFLOW_FILE"
    ;;

  *)
    echo "{\"error\": \"Unknown action: $ACTION\"}"
    exit 1
    ;;
esac
# TEST
# get_next_actor_role 3
