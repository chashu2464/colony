#!/usr/bin/env bash
set -euo pipefail

PROJ_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
HANDLER="$PROJ_ROOT/skills/quick-task/scripts/handler.sh"
TMP_ROOT=$(mktemp -d)
trap 'rm -rf "$TMP_ROOT"' EXIT

setup_repo() {
  local dir="$1"
  mkdir -p "$dir"
  git -C "$dir" init -b main >/dev/null
  git -C "$dir" config user.name "Quick Task Test"
  git -C "$dir" config user.email "quick-task-test@example.com"
  cat > "$dir/tracked.txt" <<'EOF'
base
EOF
  cat > "$dir/.gitignore" <<'EOF'
.data/
EOF
  git -C "$dir" add tracked.txt .gitignore
  git -C "$dir" commit -m "chore: baseline" >/dev/null
}

run_action() {
  local room_id="$1"
  local cwd="$2"
  local payload="$3"
  COLONY_ROOM_ID="$room_id" COLONY_AGENT_ID="developer" bash -lc "cd '$cwd' && echo '$payload' | bash '$HANDLER'"
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  local message="$3"
  if ! echo "$haystack" | grep -q "$needle"; then
    echo "FAIL: $message"
    echo "$haystack"
    exit 1
  fi
}

assert_repo_clean_after_done() {
  local dir="$1"
  local room_id="$2"
  local feature_branch="$3"
  local expected_main_commits="$4"

  local state_file="$dir/.data/quick-tasks/$room_id.json"
  if [ -f "$state_file" ]; then
    echo "FAIL: state file still exists after done: $state_file"
    exit 1
  fi

  if git -C "$dir" rev-parse --verify "$feature_branch" >/dev/null 2>&1; then
    echo "FAIL: feature branch was not deleted after done: $feature_branch"
    exit 1
  fi

  local stash_count
  stash_count=$(git -C "$dir" stash list | wc -l | tr -d '[:space:]')
  if [ "$stash_count" != "0" ]; then
    echo "FAIL: unexpected stash entries remain after done"
    git -C "$dir" stash list
    exit 1
  fi

  local main_commits
  main_commits=$(git -C "$dir" rev-list --count main)
  if [ "$main_commits" != "$expected_main_commits" ]; then
    echo "FAIL: unexpected commit count on main. expected=$expected_main_commits actual=$main_commits"
    exit 1
  fi
}

scenario_tracked_only() {
  local dir="$TMP_ROOT/tracked-only"
  local room_id="quick-task-tracked-$(date +%s)-$$"
  setup_repo "$dir"

  local start_out
  start_out=$(run_action "$room_id" "$dir" '{"action":"start","task_name":"tracked only"}')
  local feature_branch
  feature_branch=$(echo "$start_out" | jq -r '.branch')
  echo "tracked-change" >> "$dir/tracked.txt"
  local done_out
  done_out=$(run_action "$room_id" "$dir" '{"action":"done","description":"tracked only update"}')
  assert_contains "$done_out" '"success": true' "tracked-only done should succeed"

  if ! grep -q "tracked-change" "$dir/tracked.txt"; then
    echo "FAIL: tracked-only content was not merged into main"
    exit 1
  fi

  assert_repo_clean_after_done "$dir" "$room_id" "$feature_branch" "2"
}

scenario_untracked_only() {
  local dir="$TMP_ROOT/untracked-only"
  local room_id="quick-task-untracked-$(date +%s)-$$"
  setup_repo "$dir"

  local start_out
  start_out=$(run_action "$room_id" "$dir" '{"action":"start","task_name":"untracked only"}')
  local feature_branch
  feature_branch=$(echo "$start_out" | jq -r '.branch')
  mkdir -p "$dir/docs/workflow/task-u1"
  cat > "$dir/docs/workflow/task-u1/note.md" <<'EOF'
workflow note
EOF
  local done_out
  done_out=$(run_action "$room_id" "$dir" '{"action":"done","description":"untracked only update"}')
  assert_contains "$done_out" '"success": true' "untracked-only done should succeed"

  if [ ! -f "$dir/docs/workflow/task-u1/note.md" ]; then
    echo "FAIL: untracked-only file missing after done"
    exit 1
  fi
  if ! git -C "$dir" ls-files --error-unmatch docs/workflow/task-u1/note.md >/dev/null 2>&1; then
    echo "FAIL: untracked-only file was not committed to main"
    exit 1
  fi

  assert_repo_clean_after_done "$dir" "$room_id" "$feature_branch" "2"
}

scenario_mixed_changes() {
  local dir="$TMP_ROOT/mixed"
  local room_id="quick-task-mixed-$(date +%s)-$$"
  setup_repo "$dir"

  local start_out
  start_out=$(run_action "$room_id" "$dir" '{"action":"start","task_name":"mixed changes"}')
  local feature_branch
  feature_branch=$(echo "$start_out" | jq -r '.branch')
  echo "mixed-change" >> "$dir/tracked.txt"
  mkdir -p "$dir/docs/workflow/task-m1"
  cat > "$dir/docs/workflow/task-m1/note.md" <<'EOF'
mixed workflow note
EOF
  local done_out
  done_out=$(run_action "$room_id" "$dir" '{"action":"done","description":"mixed update"}')
  assert_contains "$done_out" '"success": true' "mixed done should succeed"

  if ! grep -q "mixed-change" "$dir/tracked.txt"; then
    echo "FAIL: mixed tracked change missing after done"
    exit 1
  fi
  if ! git -C "$dir" ls-files --error-unmatch docs/workflow/task-m1/note.md >/dev/null 2>&1; then
    echo "FAIL: mixed untracked file was not committed to main"
    exit 1
  fi

  assert_repo_clean_after_done "$dir" "$room_id" "$feature_branch" "2"
}

scenario_no_changes() {
  local dir="$TMP_ROOT/no-changes"
  local room_id="quick-task-nochanges-$(date +%s)-$$"
  setup_repo "$dir"

  local start_out
  start_out=$(run_action "$room_id" "$dir" '{"action":"start","task_name":"no changes"}')
  local feature_branch
  feature_branch=$(echo "$start_out" | jq -r '.branch')
  local done_out
  done_out=$(run_action "$room_id" "$dir" '{"action":"done","description":"no-op done"}')
  assert_contains "$done_out" '"success": true' "no-changes done should still complete cleanly"

  assert_repo_clean_after_done "$dir" "$room_id" "$feature_branch" "1"
}

scenario_tracked_only
scenario_untracked_only
scenario_mixed_changes
scenario_no_changes

echo "PASS: quick-task done change detection covers tracked/untracked/mixed/no-op paths."
