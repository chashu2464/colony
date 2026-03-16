#!/bin/bash

# dev-workflow v3.0 handler script
# Enhancements:
# - Concurrency control (mkdir-based locking)
# - Input validation (jq schema checks)
# - Atomic state updates (temp file + rename)
# - Automated backups (.backup)
# - Standardized exit codes (0-5)

# Exit Codes
EXIT_SUCCESS=0
EXIT_GENERAL=1
EXIT_VALIDATION=2
EXIT_LOCK_TIMEOUT=3
EXIT_STATE_CORRUPT=4
EXIT_SYSTEM=5

PROJ_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
WORKFLOW_DIR="$PROJ_ROOT/.data/workflows"
mkdir -p "$WORKFLOW_DIR"

ROOM_ID="${COLONY_ROOM_ID:-default}"
WORKFLOW_FILE="$WORKFLOW_DIR/$ROOM_ID.json"
LOCK_DIR="$WORKFLOW_FILE.lock"

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

# --- Concurrency Control ---

function acquire_lock() {
  local timeout=5
  local start=$(date +%s)
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    local now=$(date +%s)
    if [ $((now - start)) -ge $timeout ]; then
      echo "{\"error\": \"Lock acquisition timeout after $timeout seconds\", \"details\": \"Could not acquire lock on $ROOM_ID\", \"exit_code\": $EXIT_LOCK_TIMEOUT}" >&2
      return $EXIT_LOCK_TIMEOUT
    fi
    sleep 0.1
  done
  return $EXIT_SUCCESS
}

function release_lock() {
  rmdir "$LOCK_DIR" 2>/dev/null
}

# Ensure lock is released on exit
trap release_lock EXIT

# --- State Management ---

function save_state() {
  local json="$1"
  # Create backup of current state if it exists and is valid
  if [ -f "$WORKFLOW_FILE" ] && jq . "$WORKFLOW_FILE" >/dev/null 2>&1; then
    cp "$WORKFLOW_FILE" "${WORKFLOW_FILE}.backup" 2>/dev/null
  fi
  
  # Atomic write using temp file
  echo "$json" | jq . > "${WORKFLOW_FILE}.tmp" && mv "${WORKFLOW_FILE}.tmp" "$WORKFLOW_FILE"
}

function load_state() {
  if [ ! -f "$WORKFLOW_FILE" ]; then
    return $EXIT_GENERAL
  fi
  
  # Validate JSON integrity
  if ! jq . "$WORKFLOW_FILE" >/dev/null 2>&1; then
    echo "{\"error\": \"State file corrupted\", \"details\": \"$WORKFLOW_FILE is not valid JSON\", \"recovery\": \"Restore from ${WORKFLOW_FILE}.backup\", \"exit_code\": $EXIT_STATE_CORRUPT}" >&2
    return $EXIT_STATE_CORRUPT
  fi
  cat "$WORKFLOW_FILE"
}

# --- Notification Helper ---

function get_next_actor_role() {
  local stage=$1
  
  # Try to use the new SSOT parser
  local script_path="scripts/parse-workflow-table.js"
  if [ -f "$script_path" ]; then
    local role=$(node "$script_path" | jq -r --arg stage "$stage" '.[$stage].primaryRole // empty')
    if [ ! -z "$role" ] && [ "$role" != "null" ]; then
      echo "$role"
      return 0
    fi
  fi

  # Fallback to hardcoded logic
  case $stage in
    0|1|2) echo "architect" ;;
    3|6) echo "developer" ;;
    4|5|7) echo "qa_lead" ;;
    8) 
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

function notify_server() {
  local from=$1
  local to=$2
  local role=$(get_next_actor_role $to)
  local actor=$(jq -r --arg role "$role" '.assignments[$role] // empty' "$WORKFLOW_FILE")
  
  if [ ! -z "$actor" ] && [ "$actor" != "null" ]; then
    local port="${PORT:-3001}"
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

# --- Git Helpers ---

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
      local stashed=false
      if [ ! -z "$(git status --porcelain 2>/dev/null)" ]; then
        git stash push -m "workflow-auto-stash" --quiet 2>/dev/null && stashed=true
      fi
      if ! git checkout "$branch" >/dev/null 2>&1; then
        if ! git checkout -b "$branch" >/dev/null 2>&1; then
          echo "Warning: Failed to switch to branch $branch, staying on $current" >&2
        fi
      fi
      if [ "$stashed" = true ]; then
        git stash pop --quiet 2>/dev/null || echo "Warning: Failed to restore stashed changes" >&2
      fi
    fi
  fi
}

# --- Worktree Sandbox Helpers ---

function resolve_workspace_context() {
  local current_pwd=$(pwd)
  # Extract the directory name immediately following .worktrees/
  local worktree_dir=$(echo "$current_pwd" | sed -n 's|.*\.worktrees/\([^/]*\).*|\1|p')
  local task_id_regex="^task-([a-f0-9]{8})$"
  
  if [[ "$worktree_dir" =~ $task_id_regex ]]; then
    local extracted_id="${BASH_REMATCH[1]}"
    echo "$extracted_id"
    return 0
  fi
  return 1
}

function create_sandbox() {
  local task_id=$1
  local branch=$2
  local worktree_root="$PROJ_ROOT/.worktrees"
  local sandbox_path="$worktree_root/task-$task_id"

  if [ -d "$sandbox_path" ]; then
    return 0 # Already exists
  fi

  mkdir -p "$worktree_root"
  if ! git worktree add "$sandbox_path" "$branch" >/dev/null 2>&1; then
    echo "{\"error\": \"Failed to create git worktree for $task_id\"}" >&2
    return 1
  fi

  # Symlink node_modules
  # Dynamically calculate relative path from sandbox to host node_modules [P1-ENV-002]
  local host_node_modules="$PROJ_ROOT/node_modules"
  local rel_node_modules=$(python3 -c "import os; print(os.path.relpath('$host_node_modules', '$sandbox_path'))" 2>/dev/null)
  
  if [ -z "$rel_node_modules" ]; then
    # Fallback to standard 2-level depth if python fails
    rel_node_modules="../../node_modules"
  fi
  
  (cd "$sandbox_path" && ln -s "$rel_node_modules" node_modules)
  
  # Validation
  if [ ! -L "$sandbox_path/node_modules" ] || [ ! -d "$sandbox_path/node_modules" ]; then
    echo "{\"error\": \"Sandbox environment check failed (Broken node_modules link). ROLLING BACK...\"}" >&2
    git worktree remove "$sandbox_path" --force >/dev/null 2>&1
    rm -rf "$sandbox_path" 2>/dev/null
    return 1
  fi
  return 0
}

function cleanup_sandbox() {
  local task_id=$1
  local sandbox_path="$PROJ_ROOT/.worktrees/task-$task_id"

  if [ ! -d "$sandbox_path" ]; then
    return 0
  fi

  # Safety Checks
  if [ -n "$(cd "$sandbox_path" && git status --porcelain 2>/dev/null)" ]; then
    echo "{\"error\": \"Cleanup blocked: Worktree $task_id has uncommitted changes.\", \"audit\": \"Please commit or stash changes before Stage 9 completion.\"}" >&2
    return 1
  fi

  # Ahead check
  local branch="feature/task-$task_id"
  # Check if branch has upstream
  if ! (cd "$sandbox_path" && git rev-parse --abbrev-ref @{u} >/dev/null 2>&1); then
     # No upstream. If we are merging to main, we might still want to be careful.
     # But if we are in Stage 9, it means it's already merged.
     # However, ARCH-Ahead-01 says: If upstream missing, Fail-Closed.
     echo "{\"error\": \"Cleanup blocked: Worktree $task_id has no upstream tracking branch.\", \"audit\": \"Branch state unknown. Push to remote or merge manually.\"}" >&2
     return 1
  fi

  local ahead=$(cd "$sandbox_path" && git rev-list @{u}..HEAD 2>/dev/null)
  if [ -n "$ahead" ]; then
    echo "{\"error\": \"Cleanup blocked: Worktree $task_id has unpushed commits.\", \"audit\": \"Ensure all work is merged and pushed before removal.\"}" >&2
    return 1
  fi

  if ! git worktree remove "$sandbox_path" >/dev/null 2>&1; then
    # Fallback to force if regular remove fails (but we already did safety checks)
    git worktree remove "$sandbox_path" --force >/dev/null 2>&1
  fi
  return 0
}

# --- Main Logic ---

# Context Resolution [P1-SEC-002]
CURRENT_PWD=$(pwd)
if [[ "$CURRENT_PWD" == *"/.worktrees/"* ]]; then
  AUTO_TASK_ID=$(resolve_workspace_context)
  if [ -z "$AUTO_TASK_ID" ]; then
    echo "{\"error\": \"Security Violation: Execution within invalid worktree directory structure detected.\", \"audit\": \"Path: $CURRENT_PWD\"}" >&2
    exit $EXIT_SYSTEM
  fi
  
  # If we are in a worktree, ensure ROOM_ID matches if not explicitly set
  if [ "$ROOM_ID" == "default" ]; then
     # We don't have a direct map from task_id to ROOM_ID here, 
     # but usually ROOM_ID is used to find the workflow file.
     # In our system, TASK_ID is in the workflow file.
     # Let's see if we can find the workflow file that has this task_id.
     for f in "$WORKFLOW_DIR"/*.json; do
       if [ -f "$f" ] && jq -e --arg tid "$AUTO_TASK_ID" '.task_id == $tid' "$f" >/dev/null 2>&1; then
         ROOM_ID=$(basename "$f" .json)
         WORKFLOW_FILE="$f"
         LOCK_DIR="$WORKFLOW_FILE.lock"
         break
       fi
     done
  fi
fi

# Read and validate JSON input
INPUT=$(cat)
if ! echo "$INPUT" | jq . >/dev/null 2>&1; then
  echo "{\"error\": \"Invalid JSON input\", \"exit_code\": $EXIT_VALIDATION}"
  exit $EXIT_VALIDATION
fi

ACTION=$(echo "$INPUT" | jq -r '.action // empty')
if [ -z "$ACTION" ]; then
  echo "{\"error\": \"Missing action parameter\", \"exit_code\": $EXIT_VALIDATION}"
  exit $EXIT_VALIDATION
fi

# Acquire lock before processing any action that might modify state
acquire_lock || exit $?

case "$ACTION" in
  init)
    TASK_NAME=$(echo "$INPUT" | jq -r '.task_name // empty')
    if [ -z "$TASK_NAME" ] || [ "$TASK_NAME" == "null" ]; then
      echo "{\"error\": \"Missing required field: task_name\", \"exit_code\": $EXIT_VALIDATION}"
      exit $EXIT_VALIDATION
    fi
    
    DESCRIPTION=$(echo "$INPUT" | jq -r '.description // ""')
    ASSIGNMENTS=$(echo "$INPUT" | jq -c '.assignments // .roles // {"architect":null,"tech_lead":null,"qa_lead":null,"developer":null}')
    
    # Simple ID validation
    INVALID_ID=$(echo "$ASSIGNMENTS" | jq -r 'to_entries[] | select(.value != null) | select(.value | contains("/") or contains("@")) | .key')
    if [ ! -z "$INVALID_ID" ]; then
      echo "{\"error\": \"Invalid agent ID for role(s): $INVALID_ID\", \"exit_code\": $EXIT_VALIDATION}"
      exit $EXIT_VALIDATION
    fi

    TASK_ID="$(uuidgen 2>/dev/null | tr '[:upper:]' '[:lower:]' | cut -c1-8 || echo $RANDOM-$RANDOM)"
    BRANCH_NAME="feature/task-${TASK_ID}"
    
    if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      git checkout -b "$BRANCH_NAME" >/dev/null 2>&1 || git checkout "$BRANCH_NAME" >/dev/null 2>&1
    fi

    # Create sandbox worktree immediately on init to support parallel work from start
    create_sandbox "$TASK_ID" "$BRANCH_NAME" || exit $?

    STATE=$(jq -n --arg id "$TASK_ID" --arg name "$TASK_NAME" --arg desc "$DESCRIPTION" --argjson assign "$ASSIGNMENTS" --arg stage_name "${STAGES[0]}" \
      '{task_id: $id, task_name: $name, description: $desc, current_stage: 0, stage_name: $stage_name, status: "active", assignments: $assign, artifacts: [], reviews: [], history: []}')
    
    # Log history
    HASH=$(get_git_hash)
    ENTRY=$(jq -n --argjson from null --argjson to 0 --arg act "init" --arg actor "$COLONY_AGENT_ID" --arg notes "Workflow initialized" --arg hash "$HASH" \
      '{from_stage: $from, to_stage: $to, action: $act, actor: $actor, notes: $notes, git_commit_hash: $hash, timestamp: "'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'" }')
    STATE=$(echo "$STATE" | jq --argjson entry "$ENTRY" '.history += [$entry]')
    
    save_state "$STATE"
    echo "$STATE"
    ;;

  next)
    STATE=$(load_state) || exit $?
    
    NOTES=$(echo "$INPUT" | jq -r '.notes // empty' | xargs)
    EVIDENCE=$(echo "$INPUT" | jq -r '.evidence // empty' | xargs)
    CURRENT=$(echo "$STATE" | jq -r '.current_stage')
    NEXT=$((CURRENT + 1))
    
    if [ $NEXT -ge ${#STAGES[@]} ]; then
      echo "{\"error\": \"Workflow already completed\", \"exit_code\": $EXIT_GENERAL}"
      exit $EXIT_GENERAL
    fi

    # Notes Validation (Mandatory for all stages)
    if [ -z "$NOTES" ] || [ "$NOTES" == "null" ]; then
      echo "{\"error\": \"Progress notes (notes) are mandatory for advancing stage. Please describe what was accomplished.\", \"exit_code\": $EXIT_VALIDATION}"
      exit $EXIT_VALIDATION
    fi
    if [ ${#NOTES} -lt 10 ]; then
      echo "{\"error\": \"Progress notes are too brief (min 10 characters). Please provide more detail about the changes.\", \"exit_code\": $EXIT_VALIDATION}"
      exit $EXIT_VALIDATION
    fi

    # Evidence Validation
    if [ $CURRENT -gt 0 ]; then
      if [ -z "$EVIDENCE" ] || [ "$EVIDENCE" == "null" ]; then
        echo "{\"error\": \"Evidence (file path) is mandatory for advancing beyond Brainstorming stage\", \"exit_code\": $EXIT_VALIDATION}"
        exit $EXIT_VALIDATION
      fi
      if [ ! -e "$EVIDENCE" ]; then
        echo "{\"error\": \"Evidence path not found: $EVIDENCE\", \"exit_code\": $EXIT_VALIDATION}"
        exit $EXIT_VALIDATION
      fi
      # Path security: must be relative
      if [[ "$EVIDENCE" == /* ]]; then
        echo "{\"error\": \"Evidence path must be relative to workspace root\", \"exit_code\": $EXIT_VALIDATION}"
        exit $EXIT_VALIDATION
      fi
    fi

    # Approval Gates
    case $CURRENT in
      2|3|4|5|7)
        APPROVED=$(echo "$STATE" | jq --arg stage "$CURRENT" '.reviews | map(select(.stage == ($stage|tonumber) and .status == "approved")) | length')
        if [ "$APPROVED" -eq 0 ]; then
          echo "{\"error\": \"Stage $CURRENT (${STAGES[$CURRENT]}) requires an approved review before proceeding\", \"exit_code\": $EXIT_GENERAL}"
          exit $EXIT_GENERAL
        fi
        ;;
      8)
        # Clean tree check
        if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
          if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
            echo "{\"error\": \"Stage 8 (Go-Live Review) gate: working tree is not clean\", \"exit_code\": $EXIT_GENERAL}"
            exit $EXIT_GENERAL
          fi
        fi
        TL_ACTOR=$(echo "$STATE" | jq -r '.assignments["tech_lead"] // .assignments["developer"] // empty')
        APPROVED=$(echo "$STATE" | jq --arg stage "$CURRENT" --arg tl "$TL_ACTOR" '.reviews | map(select(.stage == ($stage|tonumber) and .status == "approved" and .reviewer == $tl)) | length')
        if [ "$APPROVED" -eq 0 ]; then
          echo "{\"error\": \"Stage 8 requires approval from the assigned leader ($TL_ACTOR)\", \"exit_code\": $EXIT_GENERAL}"
          exit $EXIT_GENERAL
        fi
        ;;
    esac

    # TDD Quality Gates (Stage 6 -> 7)
    if [ "$CURRENT" -eq 6 ]; then
      export TASK_ID=$(echo "$STATE" | jq -r '.task_id')
      export COLONY_AGENT_ID
      if [ "$SKIP_QUALITY_GATES" != "true" ]; then
        if ! node scripts/generate-tdd-log.js --verify >/dev/null 2>&1; then
          node scripts/generate-tdd-log.js > /dev/null 2>&1
          if ! node scripts/generate-tdd-log.js --verify >/dev/null 2>&1; then
            echo "{\"error\": \"TDD Log Verification Failed\", \"exit_code\": $EXIT_GENERAL}"
            exit $EXIT_GENERAL
          fi
        fi
        if ! bash scripts/check-quality-gates.sh >/dev/null 2>&1; then
          echo "{\"error\": \"Quality Gate Failed (metrics not met)\", \"exit_code\": $EXIT_GENERAL}"
          exit $EXIT_GENERAL
        fi
      fi
    fi

    # Advance Stage
    TASK_ID=$(echo "$STATE" | jq -r '.task_id')
    BRANCH_NAME="feature/task-$TASK_ID"
    
    # Ensure sandbox exists for implementation stages (Stage 6)
    if [ "$NEXT" -ge 6 ] && [ "$NEXT" -le 8 ]; then
      create_sandbox "$TASK_ID" "$BRANCH_NAME" || exit $?
    fi

    if [ "$NEXT" -le 7 ]; then ensure_feature_branch "$BRANCH_NAME"; fi

    if [ "$NEXT" -eq 9 ]; then
      # Completion logic (Merge)
      # 1. Perform safety check before merge (this also checks the worktree if it exists)
      cleanup_sandbox "$TASK_ID" || exit $?

      do_git_commit "$CURRENT" "${STAGES[$CURRENT]}" "$NOTES"
      MAIN=$(get_main_branch)
      if [ ! -z "$MAIN" ]; then
        git checkout "$MAIN" >/dev/null 2>&1
        TASK_NAME=$(echo "$STATE" | jq -r '.task_name')
        if git merge --squash "$BRANCH_NAME" >/dev/null 2>&1; then
          # Use task_name as subject and last notes as body
          git commit -m "feat: $TASK_NAME" -m "$NOTES" --no-verify >/dev/null 2>&1
          git branch -D "$BRANCH_NAME" >/dev/null 2>&1
        else
          git merge --abort >/dev/null 2>&1
          git checkout "$BRANCH_NAME" >/dev/null 2>&1
          echo "{\"error\": \"Merge conflict detected\", \"exit_code\": $EXIT_SYSTEM}"
          exit $EXIT_SYSTEM
        fi
      fi
    else
      do_git_commit "$NEXT" "${STAGES[$NEXT]}" "$NOTES"
    fi

    # Update State
    HASH=$(get_git_hash)
    STATUS="active"
    if [ "$NEXT" -eq 9 ]; then STATUS="completed"; fi
    
    ENTRY=$(jq -n --argjson from "$CURRENT" --argjson to "$NEXT" --arg act "next" --arg actor "$COLONY_AGENT_ID" --arg notes "$NOTES" --arg hash "$HASH" \
      '{from_stage: $from, to_stage: $to, action: $act, actor: $actor, notes: $notes, git_commit_hash: $hash, timestamp: "'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'" }')
    
    NEW_STATE=$(echo "$STATE" | jq --arg next "$NEXT" --arg name "${STAGES[$NEXT]}" --arg status "$STATUS" --argjson entry "$ENTRY" \
      '.current_stage = ($next|tonumber) | .stage_name = $name | .status = $status | .history += [$entry]')
    
    if [ ! -z "$EVIDENCE" ] && [ "$EVIDENCE" != "null" ]; then
      ARTIFACT=$(jq -n --arg stage "$CURRENT" --arg path "$EVIDENCE" --arg desc "$NOTES" '{stage: ($stage|tonumber), path: $path, description: $desc, created_at: "'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'" }')
      NEW_STATE=$(echo "$NEW_STATE" | jq --argjson art "$ARTIFACT" '.artifacts += [$art]')
    fi

    save_state "$NEW_STATE"
    notify_server $CURRENT $NEXT
    echo "$NEW_STATE"
    ;;

  submit-review)
    STATE=$(load_state) || exit $?
    STATUS=$(echo "$INPUT" | jq -r '.status // empty')
    COMMENTS=$(echo "$INPUT" | jq -r '.comments // ""')
    CURRENT=$(echo "$STATE" | jq -r '.current_stage')
    
    if [[ "$STATUS" != "approved" && "$STATUS" != "rejected" ]]; then
      echo "{\"error\": \"Invalid review status\", \"exit_code\": $EXIT_VALIDATION}"
      exit $EXIT_VALIDATION
    fi
    
    REVIEW=$(jq -n --arg stage "$CURRENT" --arg reviewer "$COLONY_AGENT_ID" --arg status "$STATUS" --arg comments "$COMMENTS" \
      '{stage: ($stage|tonumber), reviewer: $reviewer, status: $status, comments: $comments, timestamp: "'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'" }')
    
    WF_STATUS="active"
    if [ "$STATUS" == "rejected" ]; then WF_STATUS="blocked"; fi
    
    NEW_STATE=$(echo "$STATE" | jq --argjson review "$REVIEW" --arg wf_status "$WF_STATUS" \
      '.reviews += [$review] | .status = $wf_status')
    
    save_state "$NEW_STATE"
    echo "$NEW_STATE"
    ;;

  prev|backtrack)
    STATE=$(load_state) || exit $?
    CURRENT=$(echo "$STATE" | jq -r '.current_stage')
    
    if [ "$ACTION" == "prev" ]; then
      TARGET=$((CURRENT - 1))
      REASON=$(echo "$INPUT" | jq -r '.reason // "Backtrack to previous stage"')
    else
      TARGET=$(echo "$INPUT" | jq -r '.target_stage // empty')
      REASON=$(echo "$INPUT" | jq -r '.reason // "Backtrack requested"')
    fi

    if [ -z "$TARGET" ] || [ "$TARGET" == "null" ] || [ $TARGET -lt 0 ] || [ $TARGET -ge $CURRENT ]; then
      echo "{\"error\": \"Invalid target stage\", \"exit_code\": $EXIT_VALIDATION}"
      exit $EXIT_VALIDATION
    fi
    
    # Check clean tree for rollback
    if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
      echo "{\"error\": \"Working directory is dirty. Stash or commit before backtrack.\", \"exit_code\": $EXIT_GENERAL}"
      exit $EXIT_GENERAL
    fi

    HASH=$(get_git_hash)
    ENTRY=$(jq -n --argjson from "$CURRENT" --argjson to "$TARGET" --arg act "$ACTION" --arg actor "$COLONY_AGENT_ID" --arg notes "$REASON" --arg hash "$HASH" \
      '{from_stage: $from, to_stage: $to, action: $act, actor: $actor, notes: $notes, git_commit_hash: $hash, timestamp: "'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'" }')
    
    NEW_STATE=$(echo "$STATE" | jq --arg target "$TARGET" --arg name "${STAGES[$TARGET]}" --argjson entry "$ENTRY" \
      '.current_stage = ($target|tonumber) | .stage_name = $name | .status = "active" | .history += [$entry]')
    
    save_state "$NEW_STATE"
    notify_server $CURRENT $TARGET
    echo "$NEW_STATE"
    ;;

  status)
    load_state || exit $?
    ;;

  update)
    STATE=$(load_state) || exit $?
    NEW_ASSIGNMENTS=$(echo "$INPUT" | jq -c '.assignments // .roles // empty')
    NEW_STATE="$STATE"

    if [ ! -z "$NEW_ASSIGNMENTS" ] && [ "$NEW_ASSIGNMENTS" != "null" ]; then
      NEW_STATE=$(echo "$NEW_STATE" | jq --argjson assign "$NEW_ASSIGNMENTS" '.assignments = $assign')
    fi
    
    TASK_NAME=$(echo "$INPUT" | jq -r '.task_name // empty')
    if [ ! -z "$TASK_NAME" ] && [ "$TASK_NAME" != "null" ]; then
       NEW_STATE=$(echo "$NEW_STATE" | jq --arg name "$TASK_NAME" '.task_name = $name')
    fi

    DESCRIPTION=$(echo "$INPUT" | jq -r '.description // empty')
    if [ ! -z "$DESCRIPTION" ] && [ "$DESCRIPTION" != "null" ]; then
       NEW_STATE=$(echo "$NEW_STATE" | jq --arg desc "$DESCRIPTION" '.description = $desc')
    fi

    save_state "$NEW_STATE"
    echo "$NEW_STATE"
    ;;

  *)
    echo "{\"error\": \"Unknown action: $ACTION\", \"exit_code\": $EXIT_VALIDATION}"
    exit $EXIT_VALIDATION
    ;;
esac
