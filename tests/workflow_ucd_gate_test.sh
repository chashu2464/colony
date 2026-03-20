#!/bin/bash
set -euo pipefail

PROJ_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
HANDLER="$PROJ_ROOT/skills/dev-workflow/scripts/handler.sh"
UCD_VALIDATOR="$PROJ_ROOT/skills/ucd/scripts/validate-ucd.js"

run_handler() {
  local payload="$1"
  echo "$payload" | COLONY_ROOM_ID="$ROOM_ID" COLONY_AGENT_ID="developer" bash "$HANDLER"
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  if ! echo "$haystack" | grep -q "$needle"; then
    echo "FAIL: expected '$needle' in output"
    echo "$haystack"
    exit 1
  fi
}

create_valid_ucd() {
  local task_id="$1"
  local artifact_path="$2"
  local metadata_artifact_path="$3"
  mkdir -p "$(dirname "$artifact_path")"
  cat > "$artifact_path" <<EOF
---
ucd_version: 1.0.0
task_id: $task_id
artifact_path: $metadata_artifact_path
baseline_source: figma:v1
---

## scope
profile page
## interaction_states
normal/loading/empty/error/disabled
## visual_constraints
tokenized spacing
## assets
https://cdn.example.com/profile.png
## acceptance_criteria
UCD-AC-1
## non_goals
no redesign
## risk_notes
text overflow
EOF
}

ROOM_ID="test-ucd-gate-required-$(date +%s)"
WORKFLOW_FILE="$PROJ_ROOT/.data/workflows/$ROOM_ID.json"
rm -f "$WORKFLOW_FILE" "$WORKFLOW_FILE.backup" "$WORKFLOW_FILE.tmp"

INIT=$(run_handler '{"action":"init","task_name":"UCD required flow","description":"Implement new dashboard ui","changed_paths":["web/src/pages/dashboard.tsx"]}')
TASK_ID=$(echo "$INIT" | jq -r '.task_id')
REQUIRED=$(echo "$INIT" | jq -r '.ucd.ucd_required')
if [ "$REQUIRED" != "true" ]; then
  echo "FAIL: expected ucd_required=true"
  echo "$INIT"
  exit 1
fi

run_handler '{"action":"next","notes":"Move to stage 1"}' >/dev/null
touch "$PROJ_ROOT/test_ucd_evidence.md"

BLOCK_AUDIT=$(run_handler '{"action":"next","notes":"Try stage 2 with missing UCD audit","evidence":"test_ucd_evidence.md"}' || true)
assert_contains "$BLOCK_AUDIT" '"block_reason": "UCD_AUDIT_FIELDS_INCOMPLETE"'

ARTIFACT="docs/workflow/task-$TASK_ID/artifacts/$TASK_ID-ucd.md"
run_handler "{\"action\":\"update\",\"ucd_metadata\":{\"ucd_artifact\":\"$ARTIFACT\",\"ucd_version\":\"1.0.0\",\"ucd_baseline_source\":\"figma:v1\"}}" >/dev/null
BLOCK_MISSING=$(run_handler '{"action":"next","notes":"Try stage 2 with missing artifact file","evidence":"test_ucd_evidence.md"}' || true)
assert_contains "$BLOCK_MISSING" '"block_reason": "UCD_REQUIRED_BUT_MISSING_ARTIFACT"'

create_valid_ucd "$TASK_ID" "$PROJ_ROOT/$ARTIFACT" "$ARTIFACT"
BACKUP_VALIDATOR="$UCD_VALIDATOR.bak.$$"
mv "$UCD_VALIDATOR" "$BACKUP_VALIDATOR"
trap 'if [ -f "$BACKUP_VALIDATOR" ]; then mv "$BACKUP_VALIDATOR" "$UCD_VALIDATOR"; fi' EXIT
BLOCK_VALIDATOR_MISSING=$(run_handler '{"action":"next","notes":"Stage 2 should block when validator missing","evidence":"test_ucd_evidence.md"}' || true)
assert_contains "$BLOCK_VALIDATOR_MISSING" '"block_reason": "UCD_VALIDATOR_MISSING"'
mv "$BACKUP_VALIDATOR" "$UCD_VALIDATOR"
trap - EXIT

PASS=$(run_handler '{"action":"next","notes":"Stage 2 with valid UCD artifact","evidence":"test_ucd_evidence.md"}')
assert_contains "$PASS" '"current_stage": 2'

ROOM_ID="test-ucd-gate-non-ui-$(date +%s)"
WORKFLOW_FILE="$PROJ_ROOT/.data/workflows/$ROOM_ID.json"
rm -f "$WORKFLOW_FILE" "$WORKFLOW_FILE.backup" "$WORKFLOW_FILE.tmp"

INIT_NON_UI=$(run_handler '{"action":"init","task_name":"Backend patch","description":"Refactor server cache","changed_paths":["src/server/cache.ts"]}')
NON_UI_REQUIRED=$(echo "$INIT_NON_UI" | jq -r '.ucd.ucd_required')
if [ "$NON_UI_REQUIRED" != "false" ]; then
  echo "FAIL: expected ucd_required=false for backend-only task"
  echo "$INIT_NON_UI"
  exit 1
fi

run_handler '{"action":"next","notes":"Move backend task to stage 1"}' >/dev/null
PASS_NON_UI=$(run_handler '{"action":"next","notes":"Backend-only can reach stage 2 without UCD gate","evidence":"test_ucd_evidence.md"}')
assert_contains "$PASS_NON_UI" '"current_stage": 2'

rm -f "$PROJ_ROOT/test_ucd_evidence.md"
echo "PASS: workflow UCD gate integration."
