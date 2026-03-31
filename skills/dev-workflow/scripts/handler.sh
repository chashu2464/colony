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

GIT_COMMON_DIR=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)
if [ -n "$GIT_COMMON_DIR" ]; then
  PROJ_ROOT=$(cd "$GIT_COMMON_DIR/.." 2>/dev/null && pwd)
else
  PROJ_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
fi
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

# --- UCD Helpers ---

function default_ucd_artifact_path() {
  local task_id="$1"
  echo "docs/workflow/task-$task_id/artifacts/$task_id-ucd.md"
}

function empty_ucd_audit_group() {
  jq -n '{
    ucd_required: false,
    ucd_reason_codes: [],
    ucd_override_reason: null,
    ucd_version: null,
    ucd_artifact: null,
    ucd_baseline_source: null
  }'
}

function evaluate_ucd_trigger() {
  local task_description="$1"
  local changed_paths_json="$2"
  local user_intent_flags_json="$3"
  local override_requested="$4"
  local override_reason="$5"
  local override_ucd_required="$6"

  local evaluator="$PROJ_ROOT/skills/ucd/scripts/evaluate-trigger.js"
  if [ ! -f "$evaluator" ]; then
    empty_ucd_audit_group
    return 0
  fi

  local payload
  payload=$(jq -n \
    --arg desc "$task_description" \
    --argjson changed_paths "${changed_paths_json:-[]}" \
    --argjson user_intent_flags "${user_intent_flags_json:-[]}" \
    --argjson override_requested "${override_requested:-false}" \
    --arg override_reason "$override_reason" \
    --argjson override_ucd_required "${override_ucd_required:-null}" \
    '{
      task_description: $desc,
      changed_paths: $changed_paths,
      user_intent_flags: $user_intent_flags,
      override_requested: $override_requested,
      override_reason: $override_reason,
      override_ucd_required: $override_ucd_required
    }')

  node "$evaluator" "$payload"
}

function validate_ucd_gate() {
  local state_json="$1"

  local required
  required=$(echo "$state_json" | jq -r '.ucd.ucd_required // false')
  local validator="$PROJ_ROOT/skills/ucd/scripts/validate-ucd.js"
  if [ ! -f "$validator" ]; then
    if [ "$required" == "true" ]; then
      echo '{"result":"block","block_reason":"UCD_VALIDATOR_MISSING","details":["ucd validator missing while ucd_required=true"]}'
      return 0
    fi
    echo '{"result":"pass","details":["ucd_required=false; validator missing; gate skipped"]}'
    return 0
  fi

  local task_id
  task_id=$(echo "$state_json" | jq -r '.task_id')
  local audited_artifact
  audited_artifact=$(echo "$state_json" | jq -r '.ucd.ucd_artifact // empty')
  if [ -z "$audited_artifact" ] || [ "$audited_artifact" == "null" ]; then
    audited_artifact=$(default_ucd_artifact_path "$task_id")
  fi

  local audit_group
  audit_group=$(echo "$state_json" | jq -c '.ucd // {}')
  local expected_version
  expected_version=$(echo "$state_json" | jq -r '.ucd.ucd_version // empty')

  local payload
  payload=$(jq -n \
    --arg artifact_path "$audited_artifact" \
    --arg expected_ucd_version "$expected_version" \
    --argjson audit "$audit_group" \
    '{artifact_path: $artifact_path, expected_ucd_version: $expected_ucd_version, audit: $audit}')

  node "$validator" "$payload"
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
      # Stage 8 approval owner migrated to architect; keep tech_lead fallback for legacy states.
      local ar=$(jq -r '.assignments["architect"] // .roles["architect"] // empty' "$WORKFLOW_FILE")
      local tl=$(jq -r '.assignments["tech_lead"] // .roles["tech_lead"] // empty' "$WORKFLOW_FILE")
      if [ ! -z "$ar" ] && [ "$ar" != "null" ]; then
        echo "architect"
      elif [ ! -z "$tl" ] && [ "$tl" != "null" ]; then
        echo "tech_lead"
      else
        echo "developer"
      fi
      ;;
    *) echo "developer" ;;
  esac
}

function is_routable_role() {
  local role="$1"
  case "$role" in
    architect|developer|qa_lead|designer|tech_lead) return 0 ;;
    *) return 1 ;;
  esac
}

function generate_workflow_event_id() {
  local uid
  uid=$(uuidgen 2>/dev/null | tr '[:upper:]' '[:lower:]')
  if [ -z "$uid" ]; then
    uid="$(date +%s)-$RANDOM"
  fi
  echo "wf_${uid}"
}

function resolve_routing_decision() {
  local state_json="$1"
  local from_stage="$2"
  local to_stage="$3"

  local role
  role=$(get_next_actor_role "$to_stage")
  if [ -z "$role" ] || [ "$role" == "null" ] || ! is_routable_role "$role"; then
    jq -n \
      --argjson from "$from_stage" \
      --argjson to "$to_stage" \
      '{result:"block",reason:"WF_STAGE_TRANSITION_INVALID",details:["next actor role is not routable for stage transition"],from_stage:$from,to_stage:$to}'
    return 0
  fi

  local actor
  actor=$(echo "$state_json" | jq -r --arg role "$role" '.assignments[$role] // empty')
  if [ -z "$actor" ] || [ "$actor" == "null" ]; then
    jq -n \
      --arg role "$role" \
      --argjson from "$from_stage" \
      --argjson to "$to_stage" \
      '{result:"block",reason:"WF_ROUTING_MISSING_ASSIGNMENT",details:["assignment for target role is empty"],next_actor_role:$role,from_stage:$from,to_stage:$to}'
    return 0
  fi

  if [[ ! "$actor" =~ ^[A-Za-z0-9._-]+$ ]]; then
    jq -n \
      --arg role "$role" \
      --arg actor "$actor" \
      --argjson from "$from_stage" \
      --argjson to "$to_stage" \
      '{result:"block",reason:"WF_ROUTING_NON_ROUTABLE_AGENT",details:["actor id format is not routable"],next_actor_role:$role,next_actor:$actor,from_stage:$from,to_stage:$to}'
    return 0
  fi

  jq -n \
    --arg role "$role" \
    --arg actor "$actor" \
    '{result:"pass",routing:{next_actor_role:$role,next_actor:$actor,decision_source:"stage_map"}}'
}

function notify_server() {
  local from=$1
  local to=$2
  local role="$3"
  local actor="$4"
  local event_id="$5"
  local decision_source="${6:-stage_map}"
  local port="${PORT:-3001}"

  local payload
  payload=$(jq -n \
    --arg type "WORKFLOW_STAGE_CHANGED" \
    --arg roomId "$ROOM_ID" \
    --argjson from_stage "$from" \
    --argjson to_stage "$to" \
    --arg next_actor_role "$role" \
    --arg next_actor "$actor" \
    --arg event_id "$event_id" \
    --arg decision_source "$decision_source" \
    '{type:$type,roomId:$roomId,from_stage:$from_stage,to_stage:$to_stage,next_actor_role:$next_actor_role,next_actor:$next_actor,event_id:$event_id,decision_source:$decision_source}')

  local response
  response=$(curl -X POST "http://localhost:${port}/api/workflow/events" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    --silent --show-error \
    --write-out '\n%{http_code}' 2>&1)
  local curl_exit=$?
  if [ $curl_exit -ne 0 ]; then
    jq -n \
      --arg reason "WF_EVENT_DISPATCH_FAILED" \
      --arg err "$response" \
      '{status:"failed",failure_reason:$reason,details:[$err]}'
    return 0
  fi

  local http_code body reason
  http_code=$(echo "$response" | tail -n1 | tr -d '\r')
  body=$(echo "$response" | sed '$d')

  if [[ "$http_code" =~ ^2[0-9][0-9]$ ]]; then
    jq -n --arg at "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" '{status:"success",dispatched_at:$at}'
    return 0
  fi

  reason=$(echo "$body" | jq -r '.reason // empty' 2>/dev/null)
  if [ -z "$reason" ] || [ "$reason" == "null" ]; then
    reason="WF_EVENT_DISPATCH_FAILED"
  fi
  jq -n \
    --arg reason "$reason" \
    --arg http "$http_code" \
    --arg body "$body" \
    '{status:"failed",failure_reason:$reason,http_status:$http,details:[$body]}'
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
  local git_dir="${4:-$PROJ_ROOT}"
  if git -C "$git_dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    local has_changes=false
    if ! git -C "$git_dir" diff-index --quiet HEAD -- 2>/dev/null; then has_changes=true; fi
    if [ -n "$(git -C "$git_dir" ls-files --others --exclude-standard 2>/dev/null)" ]; then has_changes=true; fi
    if [ "$has_changes" = true ]; then
      git -C "$git_dir" add . 2>/dev/null
      if ! git -C "$git_dir" commit -m "chore(workflow): Advance to stage $stage_num - $stage_name" -m "Notes: $msg" --no-verify >/dev/null 2>&1; then
        echo "Warning: git commit failed (stage $stage_num), continuing without commit" >&2
      fi
    fi
  fi
}

function ensure_feature_branch() {
  local branch=$1
  local branch_task_id=$(echo "$branch" | sed -n 's|^feature/task-\([a-f0-9]\{8\}\)$|\1|p')
  local sandbox_path="$PROJ_ROOT/.worktrees/task-$branch_task_id"

  if [ -n "$branch_task_id" ] && [ -d "$sandbox_path" ] && [[ "$PWD" != "$sandbox_path"* ]]; then
    return 0
  fi

  local git_dir="$PROJ_ROOT"
  if [ -n "$branch_task_id" ] && [[ "$PWD" == "$sandbox_path"* ]]; then
    git_dir="$sandbox_path"
  fi

  if git -C "$git_dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    local current=$(git -C "$git_dir" branch --show-current)
    if [ "$current" != "$branch" ]; then
      local stashed=false
      if [ ! -z "$(git -C "$git_dir" status --porcelain 2>/dev/null)" ]; then
        git -C "$git_dir" stash push -m "workflow-auto-stash" --quiet 2>/dev/null && stashed=true
      fi
      if ! git -C "$git_dir" checkout "$branch" >/dev/null 2>&1; then
        if ! git -C "$git_dir" checkout -b "$branch" >/dev/null 2>&1; then
          echo "Warning: Failed to switch to branch $branch, staying on $current" >&2
        fi
      fi
      if [ "$stashed" = true ]; then
        git -C "$git_dir" stash pop --quiet 2>/dev/null || echo "Warning: Failed to restore stashed changes" >&2
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

function is_registered_worktree_path() {
  local path="$1"
  git worktree list --porcelain | grep -Fx "worktree $path" >/dev/null 2>&1
}

function create_sandbox() {
  local task_id=$1
  local branch=$2
  local worktree_root="$PROJ_ROOT/.worktrees"
  local sandbox_path="$worktree_root/task-$task_id"

  local host_node_modules="$PROJ_ROOT/node_modules"
  local rel_node_modules=$(python3 -c "import os; print(os.path.relpath('$host_node_modules', '$sandbox_path'))" 2>/dev/null)
  if [ -z "$rel_node_modules" ]; then
    # Fallback to standard 2-level depth if python fails
    rel_node_modules="../../node_modules"
  fi

  if [ -d "$sandbox_path" ]; then
    if is_registered_worktree_path "$sandbox_path"; then
      local existing_branch=$(git -C "$sandbox_path" branch --show-current 2>/dev/null || true)
      if [ -n "$existing_branch" ] && [ "$existing_branch" != "$branch" ]; then
        echo "{\"error\": \"Sandbox branch mismatch for $task_id: expected $branch, got $existing_branch\"}" >&2
        return 1
      fi

      if [ ! -L "$sandbox_path/node_modules" ] || [ ! -d "$sandbox_path/node_modules" ]; then
        rm -f "$sandbox_path/node_modules" 2>/dev/null || true
        (cd "$sandbox_path" && ln -s "$rel_node_modules" node_modules)
      fi
      if [ ! -L "$sandbox_path/node_modules" ] || [ ! -d "$sandbox_path/node_modules" ]; then
        echo "{\"error\": \"Sandbox environment check failed (Broken node_modules link).\"}" >&2
        return 1
      fi
      return 0
    fi

    echo "{\"error\": \"Sandbox path exists but is not a registered git worktree: $sandbox_path\"}" >&2
    return 1
  fi

  mkdir -p "$worktree_root"
  if git show-ref --verify --quiet "refs/heads/$branch"; then
    if ! git worktree add "$sandbox_path" "$branch" >/dev/null 2>&1; then
      echo "{\"error\": \"Failed to create git worktree for $task_id\"}" >&2
      return 1
    fi
  else
    local base_branch=$(get_main_branch)
    if [ -z "$base_branch" ]; then
      base_branch=$(git branch --show-current)
    fi
    if [ -z "$base_branch" ]; then
      echo "{\"error\": \"Failed to determine base branch for sandbox creation\"}" >&2
      return 1
    fi
    if ! git worktree add -b "$branch" "$sandbox_path" "$base_branch" >/dev/null 2>&1; then
      echo "{\"error\": \"Failed to create git worktree for $task_id\"}" >&2
      return 1
    fi
  fi

  # Symlink node_modules
  # Dynamically calculate relative path from sandbox to host node_modules [P1-ENV-002]
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
    CHANGED_PATHS=$(echo "$INPUT" | jq -c '.changed_paths // []')
    USER_INTENT_FLAGS=$(echo "$INPUT" | jq -c '.user_intent_flags // []')
    OVERRIDE_REQUESTED=$(echo "$INPUT" | jq -r '.override_requested // false')
    OVERRIDE_REASON=$(echo "$INPUT" | jq -r '.override_reason // ""')
    OVERRIDE_UCD_REQUIRED=$(echo "$INPUT" | jq -r 'if has("override_ucd_required") then .override_ucd_required else "null" end')
    ASSIGNMENTS=$(echo "$INPUT" | jq -c '.assignments // .roles // {"architect":null,"qa_lead":null,"developer":null,"designer":null}')
    
    # Simple ID validation
    INVALID_ID=$(echo "$ASSIGNMENTS" | jq -r 'to_entries[] | select(.value != null) | select(.value | contains("/") or contains("@")) | .key')
    if [ ! -z "$INVALID_ID" ]; then
      echo "{\"error\": \"Invalid agent ID for role(s): $INVALID_ID\", \"exit_code\": $EXIT_VALIDATION}"
      exit $EXIT_VALIDATION
    fi

    TASK_ID="$(uuidgen 2>/dev/null | tr '[:upper:]' '[:lower:]' | cut -c1-8 || echo $RANDOM-$RANDOM)"
    BRANCH_NAME="feature/task-${TASK_ID}"
    DEFAULT_UCD_ARTIFACT=$(default_ucd_artifact_path "$TASK_ID")

    UCD_DECISION=$(evaluate_ucd_trigger "$DESCRIPTION" "$CHANGED_PATHS" "$USER_INTENT_FLAGS" "$OVERRIDE_REQUESTED" "$OVERRIDE_REASON" "$OVERRIDE_UCD_REQUIRED")
    if ! echo "$UCD_DECISION" | jq . >/dev/null 2>&1; then
      echo "{\"error\": \"Failed to evaluate UCD trigger\", \"exit_code\": $EXIT_SYSTEM}"
      exit $EXIT_SYSTEM
    fi

    if [ "$(echo "$UCD_DECISION" | jq -r '.ucd_required')" == "true" ]; then
      UCD_AUDIT=$(echo "$UCD_DECISION" | jq --arg art "$DEFAULT_UCD_ARTIFACT" '{
        ucd_required: .ucd_required,
        ucd_reason_codes: .reason_codes,
        ucd_override_reason: .ucd_override_reason,
        ucd_artifact: $art,
        ucd_version: null,
        ucd_baseline_source: null
      }')
    else
      UCD_AUDIT=$(echo "$UCD_DECISION" | jq '{
        ucd_required: .ucd_required,
        ucd_reason_codes: .reason_codes,
        ucd_override_reason: .ucd_override_reason,
        ucd_artifact: null,
        ucd_version: null,
        ucd_baseline_source: null
      }')
    fi

    # Create sandbox worktree immediately on init to support parallel work from start
    create_sandbox "$TASK_ID" "$BRANCH_NAME" || exit $?

    STATE=$(jq -n --arg id "$TASK_ID" --arg name "$TASK_NAME" --arg desc "$DESCRIPTION" --argjson assign "$ASSIGNMENTS" --arg stage_name "${STAGES[0]}" --argjson ucd "$UCD_AUDIT" \
      '{task_id: $id, task_name: $name, description: $desc, current_stage: 0, stage_name: $stage_name, status: "active", assignments: $assign, ucd: $ucd, artifacts: [], reviews: [], history: []}')
    
    # Log history
    HASH=$(get_git_hash)
    ENTRY=$(jq -n --argjson from null --argjson to 0 --arg act "init" --arg actor "$COLONY_AGENT_ID" --arg notes "Workflow initialized" --arg hash "$HASH" --argjson ucd "$UCD_AUDIT" \
      '{from_stage: $from, to_stage: $to, action: $act, actor: $actor, notes: $notes, git_commit_hash: $hash, timestamp: "'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'", ucd: $ucd }')
    STATE=$(echo "$STATE" | jq --argjson entry "$ENTRY" '.history += [$entry]')
    
    save_state "$STATE"
    echo "$STATE"
    ;;

  next)
    STATE=$(load_state) || exit $?
    STATE=$(echo "$STATE" | jq '.ucd = (.ucd // {
      ucd_required: false,
      ucd_reason_codes: ["NON_UI_TEXT_ONLY"],
      ucd_override_reason: null,
      ucd_version: null,
      ucd_artifact: null,
      ucd_baseline_source: null
    })')
    
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
        LEAD_ACTOR=$(echo "$STATE" | jq -r '.assignments["architect"] // .assignments["tech_lead"] // .assignments["developer"] // empty')
        APPROVED=$(echo "$STATE" | jq --arg stage "$CURRENT" --arg lead "$LEAD_ACTOR" '.reviews | map(select(.stage == ($stage|tonumber) and .status == "approved" and .reviewer == $lead)) | length')
        if [ "$APPROVED" -eq 0 ]; then
          echo "{\"error\": \"Stage 8 requires approval from the assigned architect/leader ($LEAD_ACTOR)\", \"exit_code\": $EXIT_GENERAL}"
          exit $EXIT_GENERAL
        fi
        ;;
    esac

    # UCD Gate (Phase 1: dev-workflow only)
    if [ "$CURRENT" -ge 1 ] && [ "$CURRENT" -le 8 ]; then
      UCD_VALIDATION=$(validate_ucd_gate "$STATE")
      if ! echo "$UCD_VALIDATION" | jq . >/dev/null 2>&1; then
        echo "{\"error\": \"UCD gate validation failed to execute\", \"exit_code\": $EXIT_SYSTEM}"
        exit $EXIT_SYSTEM
      fi
      UCD_RESULT=$(echo "$UCD_VALIDATION" | jq -r '.result')
      if [ "$UCD_RESULT" == "block" ]; then
        UCD_REASON=$(echo "$UCD_VALIDATION" | jq -r '.block_reason // "UCD_GATE_BLOCKED"')
        UCD_DETAIL=$(echo "$UCD_VALIDATION" | jq -c '.details // []')
        echo "{\"error\": \"UCD gate blocked stage advance\", \"block_reason\": \"$UCD_REASON\", \"details\": $UCD_DETAIL, \"exit_code\": $EXIT_GENERAL}"
        exit $EXIT_GENERAL
      fi

      UCD_META=$(echo "$UCD_VALIDATION" | jq -c '.metadata // null')
      if [ "$UCD_META" != "null" ]; then
        STATE=$(echo "$STATE" | jq --argjson meta "$UCD_META" '
          .ucd.ucd_version = ($meta.ucd_version // .ucd.ucd_version)
          | .ucd.ucd_baseline_source = ($meta.baseline_source // .ucd.ucd_baseline_source)
          | .ucd.ucd_artifact = ($meta.artifact_path // .ucd.ucd_artifact)
        ')
      fi
    fi

    # TDD Quality Gates (Stage 6 -> 7)
    if [ "$CURRENT" -eq 6 ]; then
      export TASK_ID=$(echo "$STATE" | jq -r '.task_id')
      BRANCH_NAME="feature/task-$TASK_ID"
      export COLONY_AGENT_ID
      SANDBOX_PATH="$PROJ_ROOT/.worktrees/task-$TASK_ID"
      create_sandbox "$TASK_ID" "$BRANCH_NAME" || exit $?
      if ! is_registered_worktree_path "$SANDBOX_PATH"; then
        echo "{\"error\": \"Sandbox invalid for task $TASK_ID\", \"exit_code\": $EXIT_SYSTEM}" >&2
        exit $EXIT_SYSTEM
      fi
      if [ "$SKIP_QUALITY_GATES" != "true" ]; then
        if ! (cd "$SANDBOX_PATH" && node scripts/generate-tdd-log.js --verify >/dev/null 2>&1); then
          (cd "$SANDBOX_PATH" && node scripts/generate-tdd-log.js > /dev/null 2>&1)
          if ! (cd "$SANDBOX_PATH" && node scripts/generate-tdd-log.js --verify >/dev/null 2>&1); then
            echo "{\"error\": \"TDD Log Verification Failed\", \"exit_code\": $EXIT_GENERAL}"
            exit $EXIT_GENERAL
          fi
        fi
        if ! (cd "$SANDBOX_PATH" && TASK_ID="$TASK_ID" COLONY_AGENT_ID="$COLONY_AGENT_ID" SKIP_QUALITY_GATES="$SKIP_QUALITY_GATES" bash scripts/check-quality-gates.sh >/dev/null 2>&1); then
          echo "{\"error\": \"Quality Gate Failed (metrics not met)\", \"exit_code\": $EXIT_GENERAL}"
          exit $EXIT_GENERAL
        fi
      fi
    fi

    ROUTING_DECISION=$(resolve_routing_decision "$STATE" "$CURRENT" "$NEXT")
    ROUTING_RESULT=$(echo "$ROUTING_DECISION" | jq -r '.result // "block"')
    if [ "$ROUTING_RESULT" != "pass" ]; then
      echo "$ROUTING_DECISION"
      exit $EXIT_GENERAL
    fi
    NEXT_ACTOR_ROLE=$(echo "$ROUTING_DECISION" | jq -r '.routing.next_actor_role')
    NEXT_ACTOR=$(echo "$ROUTING_DECISION" | jq -r '.routing.next_actor')
    DECISION_SOURCE=$(echo "$ROUTING_DECISION" | jq -r '.routing.decision_source')
    EVENT_ID=$(generate_workflow_event_id)

    # Advance Stage
    TASK_ID=$(echo "$STATE" | jq -r '.task_id')
    BRANCH_NAME="feature/task-$TASK_ID"
    COMMIT_WORKSPACE="$PROJ_ROOT/.worktrees/task-$TASK_ID"
    if [ ! -d "$COMMIT_WORKSPACE" ]; then
      COMMIT_WORKSPACE="$PROJ_ROOT"
    fi
    
    # Ensure sandbox exists for implementation stages (Stage 6)
    if [ "$NEXT" -ge 6 ] && [ "$NEXT" -le 8 ]; then
      create_sandbox "$TASK_ID" "$BRANCH_NAME" || exit $?
    fi

    if [ "$NEXT" -le 7 ]; then ensure_feature_branch "$BRANCH_NAME"; fi

    if [ "$NEXT" -eq 9 ]; then
      # Completion logic (Merge)
      # 1. Perform safety check before merge (this also checks the worktree if it exists)
      cleanup_sandbox "$TASK_ID" || exit $?

      do_git_commit "$CURRENT" "${STAGES[$CURRENT]}" "$NOTES" "$COMMIT_WORKSPACE"
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
      do_git_commit "$NEXT" "${STAGES[$NEXT]}" "$NOTES" "$COMMIT_WORKSPACE"
    fi

    # Update State
    HASH=$(get_git_hash)
    STATUS="active"
    if [ "$NEXT" -eq 9 ]; then STATUS="completed"; fi
    
    UCD_AUDIT_ENTRY=$(echo "$STATE" | jq -c '.ucd')
    ENTRY=$(jq -n \
      --argjson from "$CURRENT" \
      --argjson to "$NEXT" \
      --arg act "next" \
      --arg actor "$COLONY_AGENT_ID" \
      --arg notes "$NOTES" \
      --arg hash "$HASH" \
      --arg event_id "$EVENT_ID" \
      --arg next_actor_role "$NEXT_ACTOR_ROLE" \
      --arg next_actor "$NEXT_ACTOR" \
      --arg decision_source "$DECISION_SOURCE" \
      --argjson ucd "$UCD_AUDIT_ENTRY" \
      '{from_stage: $from, to_stage: $to, action: $act, actor: $actor, notes: $notes, git_commit_hash: $hash, timestamp: "'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'", event_id: $event_id, routing: {next_actor_role: $next_actor_role, next_actor: $next_actor, decision_source: $decision_source}, dispatch: {status: "pending"}, ucd: $ucd }')
    
    NEW_STATE=$(echo "$STATE" | jq --arg next "$NEXT" --arg name "${STAGES[$NEXT]}" --arg status "$STATUS" --argjson entry "$ENTRY" \
      '.current_stage = ($next|tonumber) | .stage_name = $name | .status = $status | .history += [$entry]')
    
    if [ ! -z "$EVIDENCE" ] && [ "$EVIDENCE" != "null" ]; then
      ARTIFACT=$(jq -n --arg stage "$CURRENT" --arg path "$EVIDENCE" --arg desc "$NOTES" '{stage: ($stage|tonumber), path: $path, description: $desc, created_at: "'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'" }')
      NEW_STATE=$(echo "$NEW_STATE" | jq --argjson art "$ARTIFACT" '.artifacts += [$art]')
    fi

    save_state "$NEW_STATE"

    DISPATCH_RESULT=$(notify_server "$CURRENT" "$NEXT" "$NEXT_ACTOR_ROLE" "$NEXT_ACTOR" "$EVENT_ID" "$DECISION_SOURCE")
    DISPATCH_STATUS=$(echo "$DISPATCH_RESULT" | jq -r '.status // "failed"')
    if [ "$DISPATCH_STATUS" == "success" ]; then
      NEW_STATE=$(echo "$NEW_STATE" | jq \
        --arg dispatched_at "$(echo "$DISPATCH_RESULT" | jq -r '.dispatched_at')" \
        '.history[-1].dispatch = {status: "success", dispatched_at: $dispatched_at}')
    else
      DISPATCH_FAILURE_REASON=$(echo "$DISPATCH_RESULT" | jq -r '.failure_reason // "WF_EVENT_DISPATCH_FAILED"')
      NEW_STATE=$(echo "$NEW_STATE" | jq \
        --arg reason "$DISPATCH_FAILURE_REASON" \
        --arg at "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        '.history[-1].dispatch = {status: "failed", failure_reason: $reason, dispatched_at: $at}')
      echo "Warning: Workflow dispatch failed for event $EVENT_ID ($DISPATCH_FAILURE_REASON)" >&2
    fi

    save_state "$NEW_STATE"
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
    BACKTRACK_ROUTING=$(resolve_routing_decision "$NEW_STATE" "$CURRENT" "$TARGET")
    if [ "$(echo "$BACKTRACK_ROUTING" | jq -r '.result // "block"')" == "pass" ]; then
      BT_ROLE=$(echo "$BACKTRACK_ROUTING" | jq -r '.routing.next_actor_role')
      BT_ACTOR=$(echo "$BACKTRACK_ROUTING" | jq -r '.routing.next_actor')
      BT_SOURCE=$(echo "$BACKTRACK_ROUTING" | jq -r '.routing.decision_source')
      BT_EVENT_ID=$(generate_workflow_event_id)
      notify_server "$CURRENT" "$TARGET" "$BT_ROLE" "$BT_ACTOR" "$BT_EVENT_ID" "$BT_SOURCE" >/dev/null
    fi
    echo "$NEW_STATE"
    ;;

  status)
    load_state || exit $?
    ;;

  update)
    STATE=$(load_state) || exit $?
    NEW_ASSIGNMENTS=$(echo "$INPUT" | jq -c '.assignments // .roles // empty')
    NEW_STATE="$STATE"
    TASK_ID=$(echo "$STATE" | jq -r '.task_id')

    NEW_STATE=$(echo "$NEW_STATE" | jq '.ucd = (.ucd // {
      ucd_required: false,
      ucd_reason_codes: ["NON_UI_TEXT_ONLY"],
      ucd_override_reason: null,
      ucd_version: null,
      ucd_artifact: null,
      ucd_baseline_source: null
    })')

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

    UCD_METADATA=$(echo "$INPUT" | jq -c '.ucd_metadata // {}')
    UCD_ARTIFACT_PATCH=$(echo "$UCD_METADATA" | jq -r '.ucd_artifact // empty')
    UCD_VERSION_PATCH=$(echo "$UCD_METADATA" | jq -r '.ucd_version // empty')
    UCD_BASELINE_PATCH=$(echo "$UCD_METADATA" | jq -r '.ucd_baseline_source // empty')

    if [ -n "$UCD_ARTIFACT_PATCH" ] || [ -n "$UCD_VERSION_PATCH" ] || [ -n "$UCD_BASELINE_PATCH" ]; then
      NEW_STATE=$(echo "$NEW_STATE" | jq \
        --arg art "$UCD_ARTIFACT_PATCH" \
        --arg ver "$UCD_VERSION_PATCH" \
        --arg base "$UCD_BASELINE_PATCH" '
        .ucd.ucd_artifact = (if $art == "" then .ucd.ucd_artifact else $art end)
        | .ucd.ucd_version = (if $ver == "" then .ucd.ucd_version else $ver end)
        | .ucd.ucd_baseline_source = (if $base == "" then .ucd.ucd_baseline_source else $base end)
      ')
    fi

    UPDATE_CHECKPOINT=$(echo "$INPUT" | jq -r '.update_checkpoint // false')
    if [ "$UPDATE_CHECKPOINT" == "true" ]; then
      CHECKPOINT_DESC=$(echo "$NEW_STATE" | jq -r '.description // ""')
      CHECKPOINT_PATHS=$(echo "$INPUT" | jq -c '.changed_paths // []')
      CHECKPOINT_FLAGS=$(echo "$INPUT" | jq -c '.user_intent_flags // []')
      CHECKPOINT_OVERRIDE_REQUESTED=$(echo "$INPUT" | jq -r '.override_requested // false')
      CHECKPOINT_OVERRIDE_REASON=$(echo "$INPUT" | jq -r '.override_reason // ""')
      CHECKPOINT_OVERRIDE_REQUIRED=$(echo "$INPUT" | jq -r 'if has("override_ucd_required") then .override_ucd_required else "null" end')

      UCD_DECISION=$(evaluate_ucd_trigger "$CHECKPOINT_DESC" "$CHECKPOINT_PATHS" "$CHECKPOINT_FLAGS" "$CHECKPOINT_OVERRIDE_REQUESTED" "$CHECKPOINT_OVERRIDE_REASON" "$CHECKPOINT_OVERRIDE_REQUIRED")
      if ! echo "$UCD_DECISION" | jq . >/dev/null 2>&1; then
        echo "{\"error\": \"Failed to evaluate UCD trigger at update-checkpoint\", \"exit_code\": $EXIT_SYSTEM}"
        exit $EXIT_SYSTEM
      fi

      CURRENT_ARTIFACT=$(echo "$NEW_STATE" | jq -r '.ucd.ucd_artifact // empty')
      if [ -z "$CURRENT_ARTIFACT" ] || [ "$CURRENT_ARTIFACT" == "null" ]; then
        CURRENT_ARTIFACT=$(default_ucd_artifact_path "$TASK_ID")
      fi

      if [ "$(echo "$UCD_DECISION" | jq -r '.ucd_required')" == "true" ]; then
        NEW_STATE=$(echo "$NEW_STATE" | jq --arg art "$CURRENT_ARTIFACT" --argjson decision "$UCD_DECISION" '
          .ucd.ucd_required = $decision.ucd_required
          | .ucd.ucd_reason_codes = $decision.reason_codes
          | .ucd.ucd_override_reason = $decision.ucd_override_reason
          | .ucd.ucd_artifact = $art
        ')
      else
        NEW_STATE=$(echo "$NEW_STATE" | jq --argjson decision "$UCD_DECISION" '
          .ucd.ucd_required = $decision.ucd_required
          | .ucd.ucd_reason_codes = $decision.reason_codes
          | .ucd.ucd_override_reason = $decision.ucd_override_reason
          | .ucd.ucd_artifact = null
          | .ucd.ucd_version = null
          | .ucd.ucd_baseline_source = null
        ')
      fi
    fi

    HASH=$(get_git_hash)
    UCD_AUDIT_ENTRY=$(echo "$NEW_STATE" | jq -c '.ucd')
    ENTRY=$(jq -n --argjson from "$(echo "$STATE" | jq -r '.current_stage')" --argjson to "$(echo "$STATE" | jq -r '.current_stage')" --arg act "update" --arg actor "$COLONY_AGENT_ID" --arg notes "Workflow metadata updated" --arg hash "$HASH" --argjson ucd "$UCD_AUDIT_ENTRY" \
      '{from_stage: $from, to_stage: $to, action: $act, actor: $actor, notes: $notes, git_commit_hash: $hash, timestamp: "'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'", ucd: $ucd }')
    NEW_STATE=$(echo "$NEW_STATE" | jq --argjson entry "$ENTRY" '.history += [$entry]')

    save_state "$NEW_STATE"
    echo "$NEW_STATE"
    ;;

  *)
    echo "{\"error\": \"Unknown action: $ACTION\", \"exit_code\": $EXIT_VALIDATION}"
    exit $EXIT_VALIDATION
    ;;
esac
