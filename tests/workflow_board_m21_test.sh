#!/usr/bin/env bash
set -euo pipefail

COMMON_DIR=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)
if [ -n "$COMMON_DIR" ]; then
  PROJ_ROOT=$(cd "$COMMON_DIR/.." && pwd)
else
  PROJ_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
fi

HANDLER="$PROJ_ROOT/skills/dev-workflow/scripts/handler.sh"
ROOM_ID="workflow-board-m21-$(date +%s)"
WORKFLOW_FILE="$PROJ_ROOT/.data/workflows/$ROOM_ID.json"

cleanup() {
  if [ "${KEEP_STATE:-0}" = "1" ]; then
    return
  fi
  rm -f "$WORKFLOW_FILE" "$WORKFLOW_FILE.backup" "$WORKFLOW_FILE.tmp"
}
trap cleanup EXIT

run_handler() {
  local actor="$1"
  local payload="$2"
  COLONY_ROOM_ID="$ROOM_ID" COLONY_AGENT_ID="$actor" \
    bash -lc "echo '$payload' | bash '$HANDLER'"
}

assert_jq() {
  local json="$1"
  local expr="$2"
  local message="$3"
  if ! echo "$json" | jq -e "$expr" >/dev/null; then
    echo "FAIL: $message"
    exit 1
  fi
}

INIT='{"action":"init","task_name":"Workflow Board M2.1 Test","workflow_version":"v2","assignments":{"architect":"architect","developer":"developer","qa_lead":"qa-lead","designer":"designer"}}'
INIT_RESULT=$(run_handler "architect" "$INIT")
assert_jq "$INIT_RESULT" '.extensions.board_mode == true' "v2 init should enable board mode"

ADD1=$(run_handler "architect" '{"action":"board.update","operations":[{"action":"add","to_column":"todo","card":{"id":"M21_1","title":"Card1","owner":"developer"}}]}')
assert_jq "$ADD1" '.board_event_count == 1' "first add should create one event"
ADD2=$(run_handler "architect" '{"action":"board.update","operations":[{"action":"add","to_column":"todo","card":{"id":"M21_2","title":"Card2","owner":"developer"}}]}')
assert_jq "$ADD2" '.board_event_count == 2' "second add should create two events total"
MOVE1=$(run_handler "architect" '{"action":"board.update","operations":[{"action":"move","card_id":"M21_1","to_column":"in_progress"}]}')
assert_jq "$MOVE1" '.board_event_count == 3' "move should create third event"

# A2 retry/backoff and fail-closed
BOARD_BEFORE_FAIL=$(run_handler "developer" '{"action":"board.get"}')
FAIL_SYNC_1=$(run_handler "developer" '{"action":"board.sync","simulate_failure":true,"forced_drift_seconds":12}')
assert_jq "$FAIL_SYNC_1" '.status == "failed" and .retry_count == 1' "first sync failure should set retry_count=1"
FAIL_SYNC_2=$(run_handler "developer" '{"action":"board.sync","simulate_failure":true,"forced_drift_seconds":18}')
assert_jq "$FAIL_SYNC_2" '.status == "failed" and .retry_count == 2' "second sync failure should set retry_count=2"
FAIL_SYNC_3=$(run_handler "developer" '{"action":"board.sync","simulate_failure":true,"forced_drift_seconds":19}')
assert_jq "$FAIL_SYNC_3" '.status == "failed" and .retry_count == 3' "third sync failure should set retry_count=3"
FAIL_SYNC_4=$(run_handler "developer" '{"action":"board.sync","simulate_failure":true,"forced_drift_seconds":10}')
assert_jq "$FAIL_SYNC_4" '.status == "failed" and .retry_count == 4' "fourth sync failure should set retry_count=4"
FAIL_SYNC_5=$(run_handler "developer" '{"action":"board.sync","simulate_failure":true,"forced_drift_seconds":9}')
assert_jq "$FAIL_SYNC_5" '.status == "failed" and .retry_count == 5' "fifth sync failure should set retry_count=5"

BOARD_AFTER_FAIL=$(run_handler "developer" '{"action":"board.get"}')
BOARD_BEFORE_CANON=$(echo "$BOARD_BEFORE_FAIL" | jq -cS '.board')
BOARD_AFTER_CANON=$(echo "$BOARD_AFTER_FAIL" | jq -cS '.board')
if [ "$BOARD_BEFORE_CANON" != "$BOARD_AFTER_CANON" ]; then
  echo "FAIL: sync failure should not pollute board snapshot"
  exit 1
fi

# Recovery clears queue depth and retry count
SYNC_OK=$(run_handler "developer" '{"action":"board.sync","forced_drift_seconds":8}')
assert_jq "$SYNC_OK" '.status == "ok" and .retry_count == 0' "successful sync should reset retry_count"

# Build archive boundary and validate C1
ARCHIVE_RESULT=$(run_handler "developer" '{"action":"board.archive","cutoff_seq":2}')
assert_jq "$ARCHIVE_RESULT" '.archived_count == 2' "archive should move first two events"

PAGE_1=$(run_handler "developer" '{"action":"board.events","limit":2,"offset":0}')
P1_E0=$(echo "$PAGE_1" | jq -r '.events[0].event_id')
P1_E1=$(echo "$PAGE_1" | jq -r '.events[1].event_id')
CURSOR_1=$(echo "$PAGE_1" | jq -c '.cursor')
PAGE_2=$(run_handler "developer" "{\"action\":\"board.events\",\"limit\":2,\"offset\":0,\"cursor\":$CURSOR_1}")
P2_E0=$(echo "$PAGE_2" | jq -r '.events[0].event_id')
if [ "$P2_E0" = "$P1_E1" ]; then
  echo "FAIL: cross-layer cursor page must dedupe neighbor event"
  exit 1
fi

# D1 unauthorized archive path read should fail-closed without existence leakage
UNAUTH=$(run_handler "outsider" '{"action":"board.events","limit":5,"offset":0}' || true)
assert_jq "$UNAUTH" '.error == "WF_PERMISSION_DENIED" and .reason == "WF_PERMISSION_DENIED"' "unassigned actor should be denied"
UNAUTH_ARCHIVE_EXISTING=$(run_handler "outsider" "{\"action\":\"board.events\",\"limit\":5,\"offset\":0,\"cursor\":{\"cursor_version\":\"v1\",\"layer\":\"archive\",\"event_id\":\"$P1_E0\",\"ts_ms\":0}}" || true)
assert_jq "$UNAUTH_ARCHIVE_EXISTING" '.error == "WF_PERMISSION_DENIED" and .reason == "WF_PERMISSION_DENIED"' "unauthorized archive read should be denied (existing target)"
UNAUTH_ARCHIVE_NONEXISTENT=$(run_handler "outsider" '{"action":"board.events","limit":5,"offset":0,"cursor":{"cursor_version":"v1","layer":"archive","event_id":"be_missing_archive_event","ts_ms":0}}' || true)
assert_jq "$UNAUTH_ARCHIVE_NONEXISTENT" '.error == "WF_PERMISSION_DENIED" and .reason == "WF_PERMISSION_DENIED"' "unauthorized archive read should be denied (non-existent target)"
UNAUTH_EXISTING_SIG=$(echo "$UNAUTH_ARCHIVE_EXISTING" | jq -c '{error, reason, message}')
UNAUTH_NONEXISTENT_SIG=$(echo "$UNAUTH_ARCHIVE_NONEXISTENT" | jq -c '{error, reason, message}')
if [ "$UNAUTH_EXISTING_SIG" != "$UNAUTH_NONEXISTENT_SIG" ]; then
  echo "FAIL: unauthorized archive read responses must have identical semantics for existing/non-existent targets"
  exit 1
fi

# Generate baseline and archive windows for E1
for _ in $(seq 1 20); do
  run_handler "developer" '{"action":"board.events","limit":5,"offset":0}' >/dev/null
done
for _ in $(seq 1 20); do
  run_handler "developer" "{\"action\":\"board.events\",\"limit\":5,\"offset\":0,\"cursor\":$CURSOR_1}" >/dev/null
done

STATE_JSON=$(cat "$WORKFLOW_FILE")

A2_BACKOFF_SERIES=$(echo "$STATE_JSON" | jq -r '
  [.extensions.board_sync.scheduler_history[]? | select(.success == false)
    | (((.scheduled_at | sub("\\.[0-9]+Z$"; "Z")) | fromdateiso8601) - ((.run_at | sub("\\.[0-9]+Z$"; "Z")) | fromdateiso8601) | floor)
  ]
')
if ! echo "$A2_BACKOFF_SERIES" | jq -e '. == [60, 120, 240, 480, 900]' >/dev/null; then
  echo "FAIL: A2 backoff sequence must be [60,120,240,480,900]"
  exit 1
fi

# A1 drift thresholds
A1_P95=$(echo "$STATE_JSON" | jq -r '
  [.extensions.board_sync.scheduler_history[]?.drift_seconds // 0] as $v
  | if ($v | length) == 0 then 0
    else ($v | sort | .[((length * 95 / 100) | floor)])
    end
')
A1_P99=$(echo "$STATE_JSON" | jq -r '
  [.extensions.board_sync.scheduler_history[]?.drift_seconds // 0] as $v
  | if ($v | length) == 0 then 0
    else ($v | sort | .[((length * 99 / 100) | floor)])
    end
')
if [ "$A1_P95" -gt 20 ] || [ "$A1_P99" -ge 30 ]; then
  echo "FAIL: A1 threshold not met p95=$A1_P95 p99=$A1_P99"
  exit 1
fi

# A3 recovery: from first failure to first success
A3_RECOVERY_SECONDS=$(echo "$STATE_JSON" | jq -r '
  [.extensions.board_sync.scheduler_history[]?] as $h
  | ($h | map(select(.success == false)) | first) as $first_fail
  | ($h | map(select(.success == true)) | first) as $first_ok
  | if $first_fail == null or $first_ok == null then 0
    else (((($first_ok.run_at | sub("\\.[0-9]+Z$"; "Z")) | fromdateiso8601) - (($first_fail.run_at | sub("\\.[0-9]+Z$"; "Z")) | fromdateiso8601)) | floor)
    end
')
if [ "$A3_RECOVERY_SECONDS" -ge 1800 ]; then
  echo "FAIL: A3 recovery >=30m, seconds=$A3_RECOVERY_SECONDS"
  exit 1
fi

# C1 monotonic and no duplicate across concatenated pages
SEQ_OK=$(jq -n --argjson p1 "$(echo "$PAGE_1" | jq '.events')" --argjson p2 "$(echo "$PAGE_2" | jq '.events')" '
  ($p1 + $p2) as $all
  | ($all | map(.event_id)) as $ids
  | (($ids | unique | length) == ($ids | length))
    and (($all | map(.seq)) == (($all | map(.seq)) | sort))
')
if [ "$SEQ_OK" != "true" ]; then
  echo "FAIL: C1 sequence must be monotonic and duplicate-free"
  exit 1
fi

# E1 p95 relative increase based on query_logs layer labels
E1_BASELINE_P95=$(echo "$STATE_JSON" | jq -r '
  [.extensions.board_metrics.query_logs[]? | select(.layer == "online") | (.latency_ms // 0)] as $v
  | if ($v | length) == 0 then 0
    else ($v | sort | .[((length * 95 / 100) | floor)])
    end
')
E1_ARCHIVE_P95=$(echo "$STATE_JSON" | jq -r '
  [.extensions.board_metrics.query_logs[]? | select(.layer == "archive") | (.latency_ms // 0)] as $v
  | if ($v | length) == 0 then 0
    else ($v | sort | .[((length * 95 / 100) | floor)])
    end
')

if [ "$E1_BASELINE_P95" -eq 0 ]; then
  E1_RELATIVE_P95=0
else
  E1_RELATIVE_P95=$(node -e '
    const baseline = Number(process.argv[1]);
    const archive = Number(process.argv[2]);
    const delta = ((archive - baseline) / baseline) * 100;
    process.stdout.write(String(Number.isFinite(delta) ? delta : 0));
  ' "$E1_BASELINE_P95" "$E1_ARCHIVE_P95")
fi

if node -e 'process.exit(Number(process.argv[1]) < 10 ? 0 : 1)' "$E1_RELATIVE_P95"; then
  :
else
  echo "FAIL: E1 relative increase must be <10%, got $E1_RELATIVE_P95"
  exit 1
fi

jq -n \
  --arg room_id "$ROOM_ID" \
  --arg workflow_file "$WORKFLOW_FILE" \
  --argjson a1_p95 "$A1_P95" \
  --argjson a1_p99 "$A1_P99" \
  --argjson a3_recovery_seconds "$A3_RECOVERY_SECONDS" \
  --argjson e1_baseline_p95 "$E1_BASELINE_P95" \
  --argjson e1_archive_p95 "$E1_ARCHIVE_P95" \
  --argjson e1_relative_p95 "$E1_RELATIVE_P95" \
  --argjson a2_backoff "$A2_BACKOFF_SERIES" \
  --arg p1_last_event_id "$P1_E1" \
  --arg p2_first_event_id "$P2_E0" \
  --argjson d1_unauth_existing "$UNAUTH_ARCHIVE_EXISTING" \
  --argjson d1_unauth_nonexistent "$UNAUTH_ARCHIVE_NONEXISTENT" \
  --arg d1_existing_sig "$UNAUTH_EXISTING_SIG" \
  --arg d1_nonexistent_sig "$UNAUTH_NONEXISTENT_SIG" \
  '{
    status: "PASS",
    room_id: $room_id,
    workflow_file: $workflow_file,
    assertions: {
      A1: {p95: $a1_p95, p99: $a1_p99},
      A2: {retry_backoff_and_fail_closed: true},
      A2_details: {backoff_seconds: $a2_backoff},
      A3: {recovery_seconds: $a3_recovery_seconds},
      C1: {page1_last_event_id: $p1_last_event_id, page2_first_event_id: $p2_first_event_id},
      D1: {
        unauthorized_archive_read_denied: true,
        unauthorized_existing_target_response: $d1_unauth_existing,
        unauthorized_nonexistent_target_response: $d1_unauth_nonexistent,
        no_existence_leak_signature: {
          existing: $d1_existing_sig,
          nonexistent: $d1_nonexistent_sig,
          equal: ($d1_existing_sig == $d1_nonexistent_sig)
        }
      },
      E1: {baseline_p95: $e1_baseline_p95, archive_p95: $e1_archive_p95, relative_increase_pct: $e1_relative_p95}
    }
  }'
