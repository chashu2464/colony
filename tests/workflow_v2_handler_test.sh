#!/usr/bin/env bash
set -euo pipefail

COMMON_DIR=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)
if [ -n "$COMMON_DIR" ]; then
  PROJ_ROOT=$(cd "$COMMON_DIR/.." && pwd)
else
  PROJ_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
fi

HANDLER="$PROJ_ROOT/skills/dev-workflow/scripts/handler.sh"
ROOM_ID="workflow-v2-test-$(date +%s)"
WORKFLOW_FILE="$PROJ_ROOT/.data/workflows/$ROOM_ID.json"
EVIDENCE_PATH="docs/workflow/task-2f6c911d/qa-stage5-test-case-design-2026-03-31.md"

cleanup() {
  rm -f "$WORKFLOW_FILE" "$WORKFLOW_FILE.backup" "$WORKFLOW_FILE.tmp"
}
trap cleanup EXIT

run_handler() {
  local agent="$1"
  local payload="$2"
  COLONY_ROOM_ID="$ROOM_ID" COLONY_AGENT_ID="$agent" \
    bash -lc "echo '$payload' | bash '$HANDLER'"
}

INIT_PAYLOAD='{"action":"init","task_name":"Workflow V2 Handler Test","workflow_version":"v2","assignments":{"architect":"architect","developer":"developer","qa_lead":"qa-lead","designer":"designer"}}'
INIT_RESULT=$(run_handler "architect" "$INIT_PAYLOAD")

if [ "$(echo "$INIT_RESULT" | jq -r '.workflow_version')" != "v2" ]; then
  echo "FAIL: init did not persist workflow_version=v2"
  exit 1
fi
if [ "$(echo "$INIT_RESULT" | jq -r '.stage_name')" != "0. Discovery" ]; then
  echo "FAIL: v2 stage zero name mismatch"
  exit 1
fi

DENY_RESULT=$(run_handler "developer" '{"action":"next","notes":"developer tries to bypass owner"}' || true)
if ! echo "$DENY_RESULT" | jq -e '.reason == "WF_PERMISSION_DENIED"' >/dev/null; then
  echo "FAIL: non-owner next was not denied"
  exit 1
fi

STEP1=$(run_handler "architect" '{"action":"next","notes":"Discovery complete and scope frozen"}')
if [ "$(echo "$STEP1" | jq -r '.current_stage')" != "1" ]; then
  echo "FAIL: expected stage 1 after first next"
  exit 1
fi

MISSING_REVIEW=$(run_handler "architect" "{\"action\":\"next\",\"notes\":\"Design done without review should block\",\"evidence\":\"$EVIDENCE_PATH\"}" || true)
if ! echo "$MISSING_REVIEW" | jq -e '.error | test("requires an approved review")' >/dev/null; then
  echo "FAIL: stage 1 progressed without approved review gate"
  exit 1
fi

run_handler "qa-lead" '{"action":"submit-review","status":"approved","comments":"design review approved"}' >/dev/null
STEP2=$(run_handler "architect" "{\"action\":\"next\",\"notes\":\"Design approved and implementation handoff ready\",\"evidence\":\"$EVIDENCE_PATH\"}")
if [ "$(echo "$STEP2" | jq -r '.current_stage')" != "2" ]; then
  echo "FAIL: expected stage 2 (Build) after approved review"
  exit 1
fi
if [ "$(echo "$STEP2" | jq -r '.history[-1].workflow_version')" != "v2" ]; then
  echo "FAIL: stage history did not include workflow_version=v2"
  exit 1
fi

if [ -z "$(git status --porcelain 2>/dev/null)" ]; then
  BACKTRACK=$(run_handler "architect" '{"action":"backtrack","target_stage":1,"reason":"verify backtrack contract"}')
  if [ "$(echo "$BACKTRACK" | jq -r '.history[-1].action')" != "backtrack" ]; then
    echo "FAIL: latest history entry is not backtrack"
    exit 1
  fi
  if [ "$(echo "$BACKTRACK" | jq -r '.history[-1].workflow_version')" != "v2" ]; then
    echo "FAIL: backtrack history missing workflow_version=v2"
    exit 1
  fi
  if [ "$(echo "$BACKTRACK" | jq -r '.history[-1].event_id | length > 0')" != "true" ]; then
    echo "FAIL: backtrack history missing event_id"
    exit 1
  fi
  if [ "$(echo "$BACKTRACK" | jq -r '.history[-1].routing.next_actor_role // empty')" != "architect" ]; then
    echo "FAIL: backtrack routing metadata missing next_actor_role"
    exit 1
  fi
  if [ "$(echo "$BACKTRACK" | jq -r '.history[-1].dispatch.status | length > 0')" != "true" ]; then
    echo "FAIL: backtrack history missing dispatch status"
    exit 1
  fi
fi

BAD_EXT=$(run_handler "developer" '{"action":"update","extensions":{"board":{"blocked":[{"id":"B-1","owner":"developer"}]}}}' || true)
if ! echo "$BAD_EXT" | jq -e '.error | test("block_reason")' >/dev/null; then
  echo "FAIL: invalid board.blocked entry missing block_reason was accepted"
  exit 1
fi

BAD_CARD=$(run_handler "developer" '{"action":"update","extensions":{"cross_agent":{"task_cards":[{"id":"CA-1","status":"unknown"}]}}}' || true)
if ! echo "$BAD_CARD" | jq -e '.error | test("status")' >/dev/null; then
  echo "FAIL: invalid cross_agent.task_cards.status was accepted"
  exit 1
fi

GOOD_EXT=$(run_handler "developer" '{"action":"update","extensions":{"board_mode":true,"cross_agent_mode":true,"board":{"todo":[{"id":"B-1","title":"Implement","owner":"developer"}],"in_progress":[],"blocked":[{"id":"B-2","owner":"developer","block_reason":"WF_ROUTING_MISSING_ASSIGNMENT"}],"done":[]},"cross_agent":{"enabled":true,"main_owner":"developer","contributors":["qa-lead"],"task_cards":[{"id":"CA-1","title":"Coverage","owner":"qa-lead","status":"in_progress"}]}}}')
if [ "$(echo "$GOOD_EXT" | jq -r '.extensions.board_mode')" != "true" ]; then
  echo "FAIL: valid extensions payload was not persisted"
  exit 1
fi

echo "PASS: workflow v2 handler gating, ownership, and extensions validation behave as expected."
