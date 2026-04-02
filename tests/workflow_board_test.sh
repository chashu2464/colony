#!/usr/bin/env bash
set -euo pipefail

COMMON_DIR=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)
if [ -n "$COMMON_DIR" ]; then
  PROJ_ROOT=$(cd "$COMMON_DIR/.." && pwd)
else
  PROJ_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
fi

HANDLER="$PROJ_ROOT/skills/dev-workflow/scripts/handler.sh"
ROOM_ID="workflow-board-test-$(date +%s)"
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

assert_iso_parseable() {
  local iso="$1"
  local message="$2"
  if ! node -e 'const v = process.argv[1]; process.exit(Number.isNaN(Date.parse(v)) ? 1 : 0);' "$iso"; then
    echo "FAIL: $message ($iso)"
    exit 1
  fi
}

INIT='{"action":"init","task_name":"Workflow Board Test","workflow_version":"v2","assignments":{"architect":"architect","developer":"developer","qa_lead":"qa-lead","designer":"designer"}}'
INIT_RESULT=$(run_handler "architect" "$INIT")

if [ "$(echo "$INIT_RESULT" | jq -r '.extensions.board_mode')" != "true" ]; then
  echo "FAIL: v2 init should enable board_mode"
  exit 1
fi

GET0=$(run_handler "developer" '{"action":"board.get"}')
if [ "$(echo "$GET0" | jq -r '.snapshot.current_stage')" != "0" ]; then
  echo "FAIL: board.get should include current_stage"
  exit 1
fi
if [ "$(echo "$GET0" | jq -r '.board.todo | length')" != "0" ]; then
  echo "FAIL: initial board todo should be empty"
  exit 1
fi
if [ "$(echo "$GET0" | jq -r '.board.last_updated_at | test("Z$")')" != "true" ]; then
  echo "FAIL: board.get should expose UTC last_updated_at"
  exit 1
fi

DENY_STAGE0=$(run_handler "developer" '{"action":"board.update","operations":[{"action":"add","to_column":"todo","card":{"id":"B_1","title":"Implement board","owner":"developer"}}]}' || true)
if ! echo "$DENY_STAGE0" | jq -e '.reason == "WF_PERMISSION_DENIED"' >/dev/null; then
  echo "FAIL: non-owner board.update should return WF_PERMISSION_DENIED at stage 0"
  exit 1
fi

ADD_RESULT=$(run_handler "architect" '{"action":"board.update","operations":[{"action":"add","to_column":"todo","card":{"id":"B_1","title":"Implement board","owner":"developer"}}]}')
if [ "$(echo "$ADD_RESULT" | jq -r '.board.todo | length')" != "1" ]; then
  echo "FAIL: board.update add should append card to todo"
  exit 1
fi
if [ "$(echo "$ADD_RESULT" | jq -r '.updated_events[0].seq')" != "1" ]; then
  echo "FAIL: first board event seq should be 1"
  exit 1
fi

IDEMP_ADD_1=$(run_handler "architect" '{"action":"board.update","idempotency":{"source_stage_event_id":"wf_stage_evt_1","action":"sync_stage_to_board"},"operations":[{"action":"add","to_column":"todo","card":{"id":"B_2","title":"Idempotent add","owner":"developer"}}]}')
if [ "$(echo "$IDEMP_ADD_1" | jq -r '.idempotency.status')" != "applied" ]; then
  echo "FAIL: first idempotent board.update should be applied"
  exit 1
fi
assert_iso_parseable "$(echo "$IDEMP_ADD_1" | jq -r '.board.last_updated_at')" "idempotency first apply board.last_updated_at must be parseable RFC3339"
assert_iso_parseable "$(echo "$IDEMP_ADD_1" | jq -r '.updated_events[0].timestamp')" "idempotency first apply event timestamp must be parseable RFC3339"
assert_iso_parseable "$(echo "$IDEMP_ADD_1" | jq -r '.idempotency.first_applied_at')" "idempotency first_applied_at must be parseable RFC3339"
assert_iso_parseable "$(echo "$IDEMP_ADD_1" | jq -r '.idempotency.last_seen_at')" "idempotency last_seen_at must be parseable RFC3339"

IDEMP_ADD_2=$(run_handler "architect" '{"action":"board.update","idempotency":{"source_stage_event_id":"wf_stage_evt_1","action":"sync_stage_to_board"},"operations":[{"action":"add","to_column":"todo","card":{"id":"B_2","title":"Idempotent add","owner":"developer"}}]}')
if [ "$(echo "$IDEMP_ADD_2" | jq -r '.idempotency.status')" != "already_applied" ]; then
  echo "FAIL: repeated idempotent board.update should be already_applied"
  exit 1
fi
if [ "$(echo "$IDEMP_ADD_2" | jq -r '.updated_events | length')" != "0" ]; then
  echo "FAIL: repeated idempotent board.update should not emit new events"
  exit 1
fi
if [ "$(echo "$IDEMP_ADD_2" | jq -r '.board_event_count')" != "2" ]; then
  echo "FAIL: repeated idempotent board.update should keep board_event_count unchanged"
  exit 1
fi
assert_iso_parseable "$(echo "$IDEMP_ADD_2" | jq -r '.idempotency.first_applied_at')" "idempotency first_applied_at should remain parseable RFC3339 on replay"
assert_iso_parseable "$(echo "$IDEMP_ADD_2" | jq -r '.idempotency.last_seen_at')" "idempotency last_seen_at should remain parseable RFC3339 on replay"

IDEMP_CONFLICT=$(run_handler "architect" '{"action":"board.update","idempotency":{"source_stage_event_id":"wf_stage_evt_1","action":"sync_stage_to_board"},"operations":[{"action":"remove","card_id":"B_2"}]}' || true)
if ! echo "$IDEMP_CONFLICT" | jq -e '.error == "BOARD_VALIDATION_ERROR" and .reason == "BOARD_IDEMPOTENCY_CONFLICT"' >/dev/null; then
  echo "FAIL: conflicting idempotency payload should fail closed"
  exit 1
fi

STEP1=$(run_handler "architect" '{"action":"next","notes":"Discovery complete and scope frozen"}')
if [ "$(echo "$STEP1" | jq -r '.current_stage')" != "1" ]; then
  echo "FAIL: expected stage 1 before board owner boundary checks"
  exit 1
fi
run_handler "qa-lead" '{"action":"submit-review","status":"approved","comments":"design review approved"}' >/dev/null
STEP2=$(run_handler "architect" "{\"action\":\"next\",\"notes\":\"Design approved and implementation handoff ready\",\"evidence\":\"$EVIDENCE_PATH\"}")
if [ "$(echo "$STEP2" | jq -r '.current_stage')" != "2" ]; then
  echo "FAIL: expected stage 2 for developer-owned board.update"
  exit 1
fi

DENY_STAGE2=$(run_handler "architect" '{"action":"board.update","operations":[{"action":"move","card_id":"B_1","to_column":"in_progress"}]}' || true)
if ! echo "$DENY_STAGE2" | jq -e '.reason == "WF_PERMISSION_DENIED"' >/dev/null; then
  echo "FAIL: non-owner board.update should return WF_PERMISSION_DENIED at stage 2"
  exit 1
fi

MOVE_RESULT=$(run_handler "developer" '{"action":"board.update","operations":[{"action":"move","card_id":"B_1","to_column":"in_progress"}]}')
if [ "$(echo "$MOVE_RESULT" | jq -r '.board.in_progress | length')" != "1" ]; then
  echo "FAIL: board.update move should move card to in_progress"
  exit 1
fi

BLOCK_RESULT=$(run_handler "developer" '{"action":"board.update","operations":[{"action":"block","card_id":"B_1","block_reason":"WAITING_QA"}]}')
if [ "$(echo "$BLOCK_RESULT" | jq -r '.board.blocked | length')" != "1" ]; then
  echo "FAIL: board.update block should move card to blocked"
  exit 1
fi

BLOCKERS=$(run_handler "qa-lead" '{"action":"board.blockers","owner":"developer"}')
if [ "$(echo "$BLOCKERS" | jq -r '.count')" != "1" ]; then
  echo "FAIL: board.blockers owner filter should return one blocker"
  exit 1
fi

EV_PAGE=$(run_handler "developer" '{"action":"board.events","limit":2,"offset":0}')
if [ "$(echo "$EV_PAGE" | jq -r '.events | length')" != "2" ]; then
  echo "FAIL: board.events should support limit pagination"
  exit 1
fi

TOO_LARGE_PAGE=$(run_handler "developer" '{"action":"board.events","limit":201,"offset":0}' || true)
if ! echo "$TOO_LARGE_PAGE" | jq -e '.error == "BOARD_VALIDATION_ERROR"' >/dev/null; then
  echo "FAIL: board.events should reject limit > 200"
  exit 1
fi

SECOND_EVENT_ID=$(echo "$EV_PAGE" | jq -r '.events[1].event_id')
INCR=$(run_handler "developer" "{\"action\":\"board.events\",\"limit\":10,\"offset\":0,\"since_event_id\":\"$SECOND_EVENT_ID\"}")
if [ "$(echo "$INCR" | jq -r '.meta.supports_incremental')" != "true" ]; then
  echo "FAIL: board.events since_event_id should mark supports_incremental=true"
  exit 1
fi
if [ "$(echo "$INCR" | jq -r '.events[0].seq')" != "3" ]; then
  echo "FAIL: incremental events should start after since_event_id"
  exit 1
fi

CURSOR_INCR=$(run_handler "developer" "{\"action\":\"board.events\",\"limit\":10,\"offset\":0,\"cursor\":{\"cursor_version\":\"v1\",\"layer\":\"online\",\"event_id\":\"$SECOND_EVENT_ID\",\"ts_ms\":0}}")
if [ "$(echo "$CURSOR_INCR" | jq -r '.meta.supports_incremental')" != "true" ]; then
  echo "FAIL: board.events cursor should mark supports_incremental=true"
  exit 1
fi
if [ "$(echo "$CURSOR_INCR" | jq -r '.events[0].seq')" != "3" ]; then
  echo "FAIL: cursor incremental events should start after cursor.event_id"
  exit 1
fi

CURSOR_CONFLICT=$(run_handler "developer" "{\"action\":\"board.events\",\"limit\":10,\"offset\":0,\"since_event_id\":\"$SECOND_EVENT_ID\",\"cursor\":{\"cursor_version\":\"v1\",\"layer\":\"online\",\"event_id\":\"$SECOND_EVENT_ID\",\"ts_ms\":0}}" || true)
if ! echo "$CURSOR_CONFLICT" | jq -e '.error == "BOARD_VALIDATION_ERROR" and .reason == "BOARD_CURSOR_CONFLICT"' >/dev/null; then
  echo "FAIL: cursor+since_event_id should fail with BOARD_CURSOR_CONFLICT"
  exit 1
fi

BAD_CURSOR_VERSION=$(run_handler "developer" "{\"action\":\"board.events\",\"limit\":10,\"offset\":0,\"cursor\":{\"cursor_version\":\"v2\",\"layer\":\"online\",\"event_id\":\"$SECOND_EVENT_ID\",\"ts_ms\":0}}" || true)
if ! echo "$BAD_CURSOR_VERSION" | jq -e '.error == "BOARD_VALIDATION_ERROR" and .reason == "BOARD_CURSOR_INVALID"' >/dev/null; then
  echo "FAIL: invalid cursor_version should fail with BOARD_CURSOR_INVALID"
  exit 1
fi

BAD_BLOCK=$(run_handler "developer" '{"action":"board.update","operations":[{"action":"move","card_id":"B_1","to_column":"blocked"}]}' || true)
if ! echo "$BAD_BLOCK" | jq -e '.error == "BOARD_VALIDATION_ERROR"' >/dev/null; then
  echo "FAIL: missing block_reason should trigger BOARD_VALIDATION_ERROR"
  exit 1
fi

ROOM_V1="workflow-board-v1-$(date +%s)"
WORKFLOW_FILE_V1="$PROJ_ROOT/.data/workflows/$ROOM_V1.json"
INIT_V1='{"action":"init","task_name":"Workflow Board v1 disabled","workflow_version":"v1","assignments":{"architect":"architect","developer":"developer","qa_lead":"qa-lead","designer":"designer"}}'
COLONY_ROOM_ID="$ROOM_V1" COLONY_AGENT_ID="architect" bash -lc "echo '$INIT_V1' | bash '$HANDLER'" >/dev/null
DISABLED=$(COLONY_ROOM_ID="$ROOM_V1" COLONY_AGENT_ID="developer" bash -lc "echo '{\"action\":\"board.get\"}' | bash '$HANDLER'" || true)
if ! echo "$DISABLED" | jq -e '.error == "BOARD_DISABLED"' >/dev/null; then
  echo "FAIL: v1 board.get should return BOARD_DISABLED"
  rm -f "$WORKFLOW_FILE_V1" "$WORKFLOW_FILE_V1.backup" "$WORKFLOW_FILE_V1.tmp"
  exit 1
fi
rm -f "$WORKFLOW_FILE_V1" "$WORKFLOW_FILE_V1.backup" "$WORKFLOW_FILE_V1.tmp"

echo "PASS: workflow-board contracts (get/events/blockers/update) satisfy phase-1 behavior."
