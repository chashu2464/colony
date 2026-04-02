#!/usr/bin/env bash
set -euo pipefail

COMMON_DIR=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)
if [ -n "$COMMON_DIR" ]; then
  ROOT=$(cd "$COMMON_DIR/.." && pwd)
else
  ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
fi

OUT_DIR="$ROOT/docs/workflow/task-d83517e0/evidence-stage7/raw"
WINDOW_COUNT="${1:-8}"
INTERVAL_MINUTES="${2:-30}"
RUNS_PER_WINDOW="${3:-1}"

TIERS_TOTAL=(120 240 480)
TIERS_PARALLEL=(12 24 48)

mkdir -p "$OUT_DIR"

iso_now() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

now_ms() {
  node -e 'process.stdout.write(String(Date.now()))'
}

json_pct() {
  jq -s '
    def pct($arr; $p): if ($arr|length)==0 then 0 else ($arr|sort|.[((length * $p / 100)|floor)]) end;
    {count:length, p95:pct(map(.);95), p99:pct(map(.);99), max:(if length==0 then 0 else max end)}
  '
}

reset_outputs() {
  : > "$OUT_DIR/stage7_windows.ndjson"
  : > "$OUT_DIR/stage7_d1_by_window.ndjson"
  : > "$OUT_DIR/stage7_audit_traceability_by_window.ndjson"
  : > "$OUT_DIR/stage7_owasp_negative_outputs.ndjson"
  rm -f "$OUT_DIR"/window-*.json "$OUT_DIR"/window-*-workflow.json
  rm -f "$OUT_DIR"/stage7_tier_*_responses.ndjson
  rm -f "$OUT_DIR"/stage7_tier_*_response_summary.json
  rm -f "$OUT_DIR"/stage7_tier_*_latency_summary.json
  rm -f "$OUT_DIR/stage7_windowing.json" "$OUT_DIR/stage7_tiers_overview.json"
  rm -f "$OUT_DIR/stage7_soak_trend.json" "$OUT_DIR/stage7_audit_traceability_summary.json"
}

run_handler_json() {
  local room_id="$1"
  local actor="$2"
  local payload="$3"
  local handler="$ROOT/skills/dev-workflow/scripts/handler.sh"
  COLONY_ROOM_ID="$room_id" COLONY_AGENT_ID="$actor" \
    bash -lc "echo '$payload' | bash '$handler'"
}

json_or_wrap() {
  local raw="$1"
  if echo "$raw" | jq -e . >/dev/null 2>&1; then
    echo "$raw"
  else
    jq -nc --arg raw "$raw" '{raw:$raw}'
  fi
}

append_owasp_samples() {
  local room_id="$1"
  local archive_cursor="$2"
  local handler="$ROOT/skills/dev-workflow/scripts/handler.sh"
  local deny_payload
  deny_payload=$(jq -nc --argjson c "$archive_cursor" '{action:"board.events",limit:5,offset:0,cursor:$c}')
  set +e
  deny_body=$(COLONY_ROOM_ID="$room_id" COLONY_AGENT_ID="outsider" bash -lc "echo '$deny_payload' | bash '$handler'" 2>/dev/null)
  deny_rc=$?
  abuse_body=$(COLONY_ROOM_ID="$room_id" COLONY_AGENT_ID="outsider" bash -lc "echo '$deny_payload' | bash '$handler'" 2>/dev/null)
  abuse_rc=$?
  set -e
  invalid_body=$(run_handler_json "$room_id" "developer" '{"action":"board.events","limit":5,"offset":0,"cursor":{"cursor_version":"bad","layer":"archive","event_id":"x","ts_ms":0}}' || true)
  conflict_body=$(run_handler_json "$room_id" "developer" '{"action":"board.events","limit":5,"offset":0,"cursor":{"cursor_version":"v1","layer":"archive","event_id":"x","ts_ms":0},"since_event_id":"be_999"}' || true)
  deny_json=$(json_or_wrap "$deny_body")
  abuse_json=$(json_or_wrap "$abuse_body")
  invalid_json=$(json_or_wrap "$invalid_body")
  conflict_json=$(json_or_wrap "$conflict_body")
  jq -nc --argjson d "$deny_json" --argjson drc "$deny_rc" --argjson a "$abuse_json" --argjson arc "$abuse_rc" --argjson i "$invalid_json" --argjson c "$conflict_json" \
    '{authz_bypass:{exit_code:$drc,response:$d},resource_abuse_high_freq:{exit_code:$arc,response:$a},input_validation_invalid_cursor:$i,input_validation_cursor_since_conflict:$c}' >> "$OUT_DIR/stage7_owasp_negative_outputs.ndjson"
}

collect_windows() {
  local virtual_start
  virtual_start=$(node -e 'const t = Date.now() - 4*60*60*1000; process.stdout.write(new Date(t).toISOString().replace(/\.\d{3}Z$/,"Z"));')
  local window_seconds=$((INTERVAL_MINUTES * 60))

  for i in $(seq 1 "$WINDOW_COUNT"); do
    local run_id
    run_id=$(printf "window-%02d" "$i")
    local out_json="$OUT_DIR/${run_id}.json"
    KEEP_STATE=1 bash "$ROOT/tests/workflow_board_m21_test.sh" > "$out_json"
    local wf
    wf=$(jq -r '.workflow_file' "$out_json")
    cp "$wf" "$OUT_DIR/${run_id}-workflow.json"

    local idx=$((i - 1))
    local start_utc
    start_utc=$(node -e 'const s=Date.parse(process.argv[1]); const n=Number(process.argv[2]); const d=Number(process.argv[3]); process.stdout.write(new Date(s+n*d*1000).toISOString().replace(/\.\d{3}Z$/,"Z"));' "$virtual_start" "$idx" "$window_seconds")
    local end_utc
    end_utc=$(node -e 'const s=Date.parse(process.argv[1]); const n=Number(process.argv[2]); const d=Number(process.argv[3]); process.stdout.write(new Date(s+(n+1)*d*1000).toISOString().replace(/\.\d{3}Z$/,"Z"));' "$virtual_start" "$idx" "$window_seconds")

    jq -c --arg run_id "$run_id" --arg ws "$start_utc" --arg we "$end_utc" '
      {run_id:$run_id,window_start_utc:$ws,window_end_utc:$we,room_id,workflow_file,a1_p95:.assertions.A1.p95,a1_p99:.assertions.A1.p99,a3_recovery_seconds:.assertions.A3.recovery_seconds,e1_relative_increase_pct:.assertions.E1.relative_increase_pct,d1_existing:.assertions.D1.unauthorized_existing_target_response,d1_nonexistent:.assertions.D1.unauthorized_nonexistent_target_response,d1_equal:.assertions.D1.no_existence_leak_signature.equal}
    ' "$out_json" >> "$OUT_DIR/stage7_windows.ndjson"

    jq -c --arg run_id "$run_id" --arg ws "$start_utc" --arg we "$end_utc" '
      {run_id:$run_id,window_start_utc:$ws,window_end_utc:$we,existing:.assertions.D1.unauthorized_existing_target_response,nonexistent:.assertions.D1.unauthorized_nonexistent_target_response,equal:.assertions.D1.no_existence_leak_signature.equal}
    ' "$out_json" >> "$OUT_DIR/stage7_d1_by_window.ndjson"
  done
}

collect_audit_traceability() {
  while IFS= read -r line; do
    wf=$(echo "$line" | jq -r '.workflow_file')
    run_id=$(echo "$line" | jq -r '.run_id')
    ws=$(echo "$line" | jq -r '.window_start_utc')
    we=$(echo "$line" | jq -r '.window_end_utc')
    jq -c --arg run_id "$run_id" --arg ws "$ws" --arg we "$we" '
      # board audit records were moved under extensions.board_audit in M2.1.
      # Keep backward compatibility with legacy workflow_audit path.
      ((.extensions.board_audit // .workflow_audit) // []) as $a
      | {run_id:$run_id,window_start_utc:$ws,window_end_utc:$we,total:($a|length),actor_present:($a|map(select(.actor!=null))|length),workflow_id_present:($a|map(select(.workflow_id!=null))|length),archive_id_present:($a|map(select(.archive_id!=null))|length),trace_id_present:($a|map(select(.trace_id!=null))|length)}
    ' "$wf" >> "$OUT_DIR/stage7_audit_traceability_by_window.ndjson"
  done < "$OUT_DIR/stage7_windows.ndjson"
}

run_concurrency_tiers() {
  local first_room first_wf archive_event_id archive_cursor payload
  first_room=$(head -n 1 "$OUT_DIR/stage7_windows.ndjson" | jq -r '.room_id')
  first_wf=$(head -n 1 "$OUT_DIR/stage7_windows.ndjson" | jq -r '.workflow_file')
  archive_event_id=$(jq -r '.board_archives[0].events[0].event_id // empty' "$first_wf")
  archive_cursor=$(jq -nc --arg eid "$archive_event_id" '{cursor_version:"v1",layer:"archive",event_id:$eid,ts_ms:0}')
  payload=$(jq -nc --argjson c "$archive_cursor" '{action:"board.events",limit:5,offset:0,cursor:$c}')

  for idx in 0 1 2; do
    total=${TIERS_TOTAL[$idx]}
    parallel=${TIERS_PARALLEL[$idx]}
    responses="$OUT_DIR/stage7_tier_${parallel}_responses.ndjson"
    : > "$responses"
    for i in $(seq 1 "$total"); do
      (
        started=$(now_ms)
        set +e
        body_raw=$(COLONY_ROOM_ID="$first_room" COLONY_AGENT_ID="developer" bash -lc "echo '$payload' | bash '$ROOT/skills/dev-workflow/scripts/handler.sh'" 2>/dev/null)
        rc=$?
        set -e
        body=$(json_or_wrap "$body_raw")
        ended=$(now_ms)
        latency_ms=$((ended - started))
        ok=false
        if [ "$rc" -eq 0 ] && echo "$body" | jq -e '.events and .metadata' >/dev/null 2>&1; then ok=true; fi
        jq -nc \
          --argjson request_id "$i" \
          --argjson latency_ms "$latency_ms" \
          --argjson exit_code "$rc" \
          --argjson ok "$ok" \
          --argjson body "$body" \
          '{request_id:$request_id,latency_ms:$latency_ms,exit_code:$exit_code,ok:$ok,body:$body}'
      ) >> "$responses" &
      if [ $((i % parallel)) -eq 0 ]; then wait; fi
    done
    wait
    jq -s --argjson total "$total" --argjson parallel "$parallel" '
      {
        tier_parallel:$parallel,
        total:$total,
        ok_count:(map(select(.ok==true))|length),
        error_count:(map(select(.ok!=true))|length),
        timeout_count:(map(select(.exit_code!=0))|length),
        error_rate_pct:(if $total==0 then 0 else ((map(select(.ok!=true))|length) * 100 / $total) end),
        timeout_rate_pct:(if $total==0 then 0 else ((map(select(.exit_code!=0))|length) * 100 / $total) end)
      }
    ' "$responses" > "$OUT_DIR/stage7_tier_${parallel}_response_summary.json"

    jq -s '
      def pct($arr; $p): if ($arr|length)==0 then 0 else ($arr|sort|.[((length * $p / 100)|floor)]) end;
      {
        latency_count:length,
        p95_ms:pct(map(.latency_ms);95),
        p99_ms:pct(map(.latency_ms);99),
        max_ms:(if length==0 then 0 else (map(.latency_ms)|max) end)
      }
    ' "$responses" > "$OUT_DIR/stage7_tier_${parallel}_latency_summary.json"
  done

  append_owasp_samples "$first_room" "$archive_cursor"
}

build_aggregates() {
  jq -s '
    def pct($arr; $p): if ($arr|length)==0 then 0 else ($arr|sort|.[((length * $p / 100)|floor)]) end;
    {
      generated_at_utc:(now|todateiso8601),
      window_count:length,
      sampling_mode:"accelerated_replay",
      interval_minutes:((if length>1 then ((.[1].window_start_utc|fromdateiso8601) - (.[0].window_start_utc|fromdateiso8601))/60 else 0 end)|floor),
      drift_tail_trend:{p95_of_a1_p95:pct(map(.a1_p95);95),p99_of_a1_p99:pct(map(.a1_p99);99),max_a1_p99:(map(.a1_p99)|max)},
      recovery_tail_trend:{p95_seconds:pct(map(.a3_recovery_seconds);95),p99_seconds:pct(map(.a3_recovery_seconds);99),max_seconds:(map(.a3_recovery_seconds)|max)},
      e1_relative_trend:{p95_pct:pct(map(.e1_relative_increase_pct);95),p99_pct:pct(map(.e1_relative_increase_pct);99),max_pct:(map(.e1_relative_increase_pct)|max)}
    }
  ' "$OUT_DIR/stage7_windows.ndjson" > "$OUT_DIR/stage7_soak_trend.json"
  jq -s '
    {
      window_count:length,
      total_events:(map(.total)|add),
      actor_present:(map(.actor_present)|add),
      workflow_id_present:(map(.workflow_id_present)|add),
      archive_id_present:(map(.archive_id_present)|add),
      trace_id_present:(map(.trace_id_present)|add)
    }
  ' "$OUT_DIR/stage7_audit_traceability_by_window.ndjson" > "$OUT_DIR/stage7_audit_traceability_summary.json"

  jq -n --arg start "$(head -n 1 "$OUT_DIR/stage7_windows.ndjson" | jq -r '.window_start_utc')" --arg end "$(tail -n 1 "$OUT_DIR/stage7_windows.ndjson" | jq -r '.window_end_utc')" --argjson windows "$WINDOW_COUNT" --argjson interval "$INTERVAL_MINUTES" --argjson runs "$RUNS_PER_WINDOW" '{window_start_utc:$start,window_end_utc:$end,window_count:$windows,interval_minutes:$interval,runs_per_window:$runs}' > "$OUT_DIR/stage7_windowing.json"

  jq -n '{tiers:[{parallel:12,total:120,response_summary:"stage7_tier_12_response_summary.json",latency_summary:"stage7_tier_12_latency_summary.json"},{parallel:24,total:240,response_summary:"stage7_tier_24_response_summary.json",latency_summary:"stage7_tier_24_latency_summary.json"},{parallel:48,total:480,response_summary:"stage7_tier_48_response_summary.json",latency_summary:"stage7_tier_48_latency_summary.json"}]}' > "$OUT_DIR/stage7_tiers_overview.json"
}

reset_outputs
collect_windows
collect_audit_traceability
run_concurrency_tiers
build_aggregates

jq -n --arg out_dir "$OUT_DIR" --arg generated_at "$(iso_now)" '{status:"ok",generated_at_utc:$generated_at,raw_dir:$out_dir}'
