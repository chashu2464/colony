#!/usr/bin/env bash
set -euo pipefail

COMMON_DIR=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)
if [ -n "$COMMON_DIR" ]; then
  ROOT=$(cd "$COMMON_DIR/.." && pwd)
else
  ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
fi

OUT_DIR="$ROOT/docs/workflow/task-d83517e0/evidence-stage6/raw"
RUNS="${1:-12}"
BURST_TOTAL="${2:-200}"
BURST_PARALLEL="${3:-20}"

mkdir -p "$OUT_DIR"
: > "$OUT_DIR/stage6_runs.ndjson"
rm -f "$OUT_DIR"/run-*.json "$OUT_DIR"/run-*-workflow.json
rm -f "$OUT_DIR/stage6_aggregate.json" "$OUT_DIR/stage6_burst_responses.ndjson"
rm -f "$OUT_DIR/stage6_burst_summary.json" "$OUT_DIR/stage6_burst_latency_summary.json"
rm -f "$OUT_DIR/stage6_d1_status_semantics.ndjson" "$OUT_DIR/stage6_window.json"

iso_now() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

now_ms() {
  node -e 'process.stdout.write(String(Date.now()))'
}

WINDOW_START="$(iso_now)"

for i in $(seq 1 "$RUNS"); do
  run_id=$(printf "run-%02d" "$i")
  out_json="$OUT_DIR/${run_id}.json"
  KEEP_STATE=1 bash "$ROOT/tests/workflow_board_m21_test.sh" > "$out_json"

  wf=$(jq -r '.workflow_file' "$out_json")
  cp "$wf" "$OUT_DIR/${run_id}-workflow.json"

  jq -c --arg run_id "$run_id" '
    {
      run_id: $run_id,
      room_id,
      workflow_file,
      a1_p95: .assertions.A1.p95,
      a1_p99: .assertions.A1.p99,
      a3_recovery_seconds: .assertions.A3.recovery_seconds,
      e1_baseline_p95: .assertions.E1.baseline_p95,
      e1_archive_p95: .assertions.E1.archive_p95,
      e1_relative_increase_pct: .assertions.E1.relative_increase_pct,
      d1_equal: .assertions.D1.no_existence_leak_signature.equal,
      d1_existing: .assertions.D1.unauthorized_existing_target_response,
      d1_nonexistent: .assertions.D1.unauthorized_nonexistent_target_response
    }
  ' "$out_json" >> "$OUT_DIR/stage6_runs.ndjson"
done

ROOM_ID=$(head -n 1 "$OUT_DIR/stage6_runs.ndjson" | jq -r '.room_id')
WORKFLOW_FILE=$(head -n 1 "$OUT_DIR/stage6_runs.ndjson" | jq -r '.workflow_file')
ARCHIVE_EVENT_ID=$(jq -r '.board_archives[0].events[0].event_id // empty' "$WORKFLOW_FILE")

if [ -z "$ARCHIVE_EVENT_ID" ]; then
  echo "ERROR: ARCHIVE_EVENT_ID missing in workflow state: $WORKFLOW_FILE" >&2
  exit 1
fi

CURSOR=$(jq -nc --arg eid "$ARCHIVE_EVENT_ID" '{cursor_version:"v1",layer:"archive",event_id:$eid,ts_ms:0}')
HANDLER="$ROOT/skills/dev-workflow/scripts/handler.sh"

run_handler_json() {
  local actor="$1"
  local payload="$2"
  COLONY_ROOM_ID="$ROOM_ID" COLONY_AGENT_ID="$actor" \
    bash -lc "echo '$payload' | bash '$HANDLER'"
}

run_unauth() {
  local target_label="$1"
  local cursor_payload="$2"
  set +e
  body=$(COLONY_ROOM_ID="$ROOM_ID" COLONY_AGENT_ID="outsider" \
    bash -lc "echo '{\"action\":\"board.events\",\"limit\":5,\"offset\":0,\"cursor\":$cursor_payload}' | bash '$HANDLER'" 2>/dev/null)
  code=$?
  set -e
  jq -nc --arg label "$target_label" --argjson body "$body" --argjson code "$code" '
    {
      target: $label,
      exit_code: $code,
      error: ($body.error // null),
      reason: ($body.reason // null),
      message: ($body.message // null),
      status_semantic: (if ($body.error == "WF_PERMISSION_DENIED") then "DENIED" else "UNKNOWN" end)
    }
  '
}

EXISTING_CURSOR="$CURSOR"
MISSING_CURSOR='{"cursor_version":"v1","layer":"archive","event_id":"be_missing_archive_event","ts_ms":0}'
run_unauth "existing" "$EXISTING_CURSOR" >> "$OUT_DIR/stage6_d1_status_semantics.ndjson"
run_unauth "nonexistent" "$MISSING_CURSOR" >> "$OUT_DIR/stage6_d1_status_semantics.ndjson"

PAYLOAD=$(jq -nc --argjson c "$CURSOR" '{action:"board.events",limit:5,offset:0,cursor:$c}')
: > "$OUT_DIR/stage6_burst_responses.ndjson"
for i in $(seq 1 "$BURST_TOTAL"); do
  (
    started=$(now_ms)
    set +e
    body=$(COLONY_ROOM_ID="$ROOM_ID" COLONY_AGENT_ID="developer" \
      bash -lc "echo '$PAYLOAD' | bash '$HANDLER'" 2>/dev/null)
    rc=$?
    set -e
    ended=$(now_ms)
    latency_ms=$((ended - started))
    ok=false
    layer="unknown"
    if [ "$rc" -eq 0 ] && echo "$body" | jq -e '.events and .metadata' >/dev/null 2>&1; then
      ok=true
      layer=$(echo "$body" | jq -r '.metadata.layer // "unknown"')
    fi
    jq -nc --argjson idx "$i" --argjson latency "$latency_ms" --argjson rc "$rc" --argjson ok "$ok" --arg layer "$layer" --argjson body "$body" \
      '{idx:$idx, latency_ms:$latency, exit_code:$rc, ok:$ok, layer:$layer, body:$body}'
  ) >> "$OUT_DIR/stage6_burst_responses.ndjson" &
  if [ $((i % BURST_PARALLEL)) -eq 0 ]; then
    wait
  fi
done
wait

jq -s '{
  total: length,
  ok_count: (map(select(.ok == true)) | length),
  fail_count: (map(select(.ok != true)) | length),
  max_latency_ms: (if length==0 then 0 else (map(.latency_ms) | max) end)
}' "$OUT_DIR/stage6_burst_responses.ndjson" > "$OUT_DIR/stage6_burst_summary.json"

jq -s '
  def pct($arr; $p): if ($arr|length)==0 then 0 else ($arr|sort|.[((length * $p / 100)|floor)]) end;
  {
    latency_count: (length),
    p95_ms: pct(map(.latency_ms); 95),
    p99_ms: pct(map(.latency_ms); 99),
    max_ms: (if length==0 then 0 else (map(.latency_ms) | max) end)
  }
' "$OUT_DIR/stage6_burst_responses.ndjson" > "$OUT_DIR/stage6_burst_latency_summary.json"

jq -s '
  def pct($arr; $p): if ($arr|length)==0 then 0 else ($arr|sort|.[((length * $p / 100)|floor)]) end;
  def max0($arr): if ($arr|length)==0 then 0 else ($arr|max) end;
  . as $runs
  | ($runs | map(.a1_p95)) as $a1p95
  | ($runs | map(.a1_p99)) as $a1p99
  | ($runs | map(.a3_recovery_seconds)) as $recovery
  | ($runs | map(.e1_relative_increase_pct)) as $e1rel
  | {
      generated_at_utc: (now | todateiso8601),
      runs: ($runs|length),
      drift_tail: {p95_of_a1_p95: pct($a1p95;95), p99_of_a1_p99: pct($a1p99;99), max_a1_p99: max0($a1p99)},
      recovery_tail: {p95_seconds: pct($recovery;95), p99_seconds: pct($recovery;99), max_seconds: max0($recovery)},
      e1_relative_tail: {p95_pct: pct($e1rel;95), p99_pct: pct($e1rel;99), max_pct: max0($e1rel)}
    }
' "$OUT_DIR/stage6_runs.ndjson" > "$OUT_DIR/stage6_aggregate.json"

WINDOW_END="$(iso_now)"
jq -n --arg start "$WINDOW_START" --arg end "$WINDOW_END" --argjson runs "$RUNS" --argjson burst_total "$BURST_TOTAL" --argjson burst_parallel "$BURST_PARALLEL" \
  '{window_start_utc:$start, window_end_utc:$end, soak_runs:$runs, burst_total:$burst_total, burst_parallel:$burst_parallel}' > "$OUT_DIR/stage6_window.json"
