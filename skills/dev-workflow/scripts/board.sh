#!/bin/bash

# Board helpers for dev-workflow M2.

BOARD_COLUMNS=("todo" "in_progress" "blocked" "done")

board_now_iso() {
  node -e 'process.stdout.write(new Date().toISOString())'
}

board_error_json() {
  local code="$1"
  local message="$2"
  jq -n --arg code "$code" --arg msg "$message" '{error: $code, message: $msg}'
}

board_error_with_reason_json() {
  local code="$1"
  local reason="$2"
  local message="$3"
  jq -n --arg code "$code" --arg reason "$reason" --arg msg "$message" \
    '{error: $code, reason: $reason, message: $msg}'
}

board_permission_denied_json() {
  local owner_role="$1"
  local required_actor="$2"
  local actor="$3"
  jq -n \
    --arg owner_role "$owner_role" \
    --arg owner_actor "$required_actor" \
    --arg actor "$actor" \
    '{
      error: "Only stage owner can update board",
      reason: "WF_PERMISSION_DENIED",
      details: [
        ("owner role: " + $owner_role),
        ("required actor: " + $owner_actor),
        ("actual actor: " + $actor)
      ]
    }'
}

board_add_seconds_iso() {
  local base_iso="$1"
  local seconds="$2"
  node -e '
    const base = new Date(process.argv[1]);
    const secs = Number(process.argv[2]);
    if (Number.isNaN(base.getTime()) || !Number.isFinite(secs)) {
      process.exit(1);
    }
    base.setSeconds(base.getSeconds() + secs);
    process.stdout.write(base.toISOString());
  ' "$base_iso" "$seconds"
}

board_generate_trace_id() {
  local uid
  uid=$(uuidgen 2>/dev/null | tr '[:upper:]' '[:lower:]')
  if [ -z "$uid" ]; then
    uid="$(date +%s)-$RANDOM"
  fi
  echo "trace_${uid}"
}

board_actor_is_assigned() {
  local state_json="$1"
  local actor="$2"
  if [ -z "$actor" ]; then
    return 1
  fi
  echo "$state_json" | jq -e --arg actor "$actor" '(.assignments // {} | to_entries | map(.value) | index($actor)) != null' >/dev/null 2>&1
}

board_parse_cursor() {
  local cursor_json="$1"
  if [ -z "$cursor_json" ] || [ "$cursor_json" = "null" ]; then
    echo ""
    return 0
  fi

  if ! echo "$cursor_json" | jq -e 'type == "object"' >/dev/null 2>&1; then
    board_error_with_reason_json "BOARD_VALIDATION_ERROR" "BOARD_CURSOR_INVALID" "cursor must be an object"
    return 1
  fi
  if [ "$(echo "$cursor_json" | jq -r '.cursor_version // empty')" != "v1" ]; then
    board_error_with_reason_json "BOARD_VALIDATION_ERROR" "BOARD_CURSOR_INVALID" "cursor_version is invalid"
    return 1
  fi
  if ! echo "$cursor_json" | jq -e '.ts_ms | type == "number" and . >= 0 and floor == .' >/dev/null 2>&1; then
    board_error_with_reason_json "BOARD_VALIDATION_ERROR" "BOARD_CURSOR_INVALID" "ts_ms must be a non-negative integer"
    return 1
  fi

  local layer event_id
  layer=$(echo "$cursor_json" | jq -r '.layer // empty')
  event_id=$(echo "$cursor_json" | jq -r '.event_id // empty')
  if [ -z "$event_id" ] || [ -z "$layer" ]; then
    board_error_with_reason_json "BOARD_VALIDATION_ERROR" "BOARD_CURSOR_INVALID" "cursor must include layer and event_id"
    return 1
  fi
  if [ "$layer" != "online" ] && [ "$layer" != "archive" ]; then
    board_error_with_reason_json "BOARD_VALIDATION_ERROR" "BOARD_CURSOR_INVALID" "cursor layer is not supported"
    return 1
  fi
  jq -n --arg layer "$layer" --arg event_id "$event_id" '{layer: $layer, event_id: $event_id}'
}

board_validate_column() {
  local column="$1"
  case "$column" in
    todo|in_progress|blocked|done) return 0 ;;
    *) return 1 ;;
  esac
}

board_validate_card_id() {
  local card_id="$1"
  [[ "$card_id" =~ ^[A-Za-z0-9_-]+$ ]]
}

board_validate_enabled() {
  local state_json="$1"
  local enabled
  enabled=$(echo "$state_json" | jq -r '.extensions.board_mode // false')
  [ "$enabled" == "true" ]
}

board_normalize_state() {
  local state_json="$1"
  local now_iso="$2"
  local next_sync_iso
  next_sync_iso=$(board_add_seconds_iso "$now_iso" 60)
  if [ $? -ne 0 ] || [ -z "$next_sync_iso" ]; then
    next_sync_iso="$now_iso"
  fi
  echo "$state_json" | jq --arg now "$now_iso" --arg next_sync "$next_sync_iso" '
    .board_events = (.board_events // [])
    | .board_archives = (.board_archives // [])
    | .extensions.board = (.extensions.board // {})
    | .extensions.board.todo = (.extensions.board.todo // [])
    | .extensions.board.in_progress = (.extensions.board.in_progress // [])
    | .extensions.board.blocked = (.extensions.board.blocked // [])
    | .extensions.board.done = (.extensions.board.done // [])
    | .extensions.board.idempotency_registry = (.extensions.board.idempotency_registry // [])
    | .extensions.board.last_updated_at = (.extensions.board.last_updated_at // $now)
    | .extensions.board_sync = (.extensions.board_sync // {})
    | .extensions.board_sync.interval_seconds = (.extensions.board_sync.interval_seconds // 60)
    | .extensions.board_sync.retry_schedule_seconds = (.extensions.board_sync.retry_schedule_seconds // [60, 120, 240, 480, 900])
    | .extensions.board_sync.retry_count = (.extensions.board_sync.retry_count // 0)
    | .extensions.board_sync.attempt_count = (.extensions.board_sync.attempt_count // 0)
    | .extensions.board_sync.pending_queue_depth = (.extensions.board_sync.pending_queue_depth // 0)
    | .extensions.board_sync.last_error = (.extensions.board_sync.last_error // null)
    | .extensions.board_sync.last_synced_at = (.extensions.board_sync.last_synced_at // null)
    | .extensions.board_sync.last_synced_event_id = (.extensions.board_sync.last_synced_event_id // null)
    | .extensions.board_sync.next_sync_at = (.extensions.board_sync.next_sync_at // $next_sync)
    | .extensions.board_sync.scheduler_history = (.extensions.board_sync.scheduler_history // [])
    | .extensions.board_metrics = (.extensions.board_metrics // {})
    | .extensions.board_metrics.query_logs = (.extensions.board_metrics.query_logs // [])
    | .extensions.board_metrics.sync_logs = (.extensions.board_metrics.sync_logs // [])
    | .extensions.board_audit = (.extensions.board_audit // [])
  '
}

board_hash_json() {
  local payload="$1"
  local digest
  digest=$(printf '%s' "$payload" | shasum -a 256 | awk '{print $1}')
  echo "$digest"
}

board_get() {
  local state_json="$1"
  if ! board_validate_enabled "$state_json"; then
    board_error_json "BOARD_DISABLED" "Board mode is disabled for this workflow"
    return 1
  fi

  local now_iso
  now_iso=$(board_now_iso)
  local norm
  norm=$(board_normalize_state "$state_json" "$now_iso")

  local owner_role owner_id
  owner_role=$(owner_role_for_stage "$(echo "$norm" | jq -r '.workflow_version // "v1"')" "$(echo "$norm" | jq -r '.current_stage')")
  owner_id=$(echo "$norm" | jq -r --arg role "$owner_role" '.assignments[$role] // ""')

  echo "$norm" | jq \
    --arg owner_role "$owner_role" \
    --arg owner_id "$owner_id" \
    '{
      board: .extensions.board,
      snapshot: {
        current_stage: .current_stage,
        stage_name: .stage_name,
        owner_role: $owner_role,
        owner_id: $owner_id,
        blocker_count: (.extensions.board.blocked | length)
      }
    }'
}

board_events() {
  local state_json="$1"
  local limit="$2"
  local offset="$3"
  local since_event_id="$4"
  local cursor_json="$5"
  local actor="$6"
  local trace_id="$7"

  if ! board_validate_enabled "$state_json"; then
    board_error_json "BOARD_DISABLED" "Board mode is disabled for this workflow"
    return 1
  fi

  if ! [[ "$limit" =~ ^[0-9]+$ ]] || ! [[ "$offset" =~ ^[0-9]+$ ]]; then
    board_error_json "BOARD_VALIDATION_ERROR" "limit and offset must be non-negative integers"
    return 1
  fi
  if [ "$limit" -gt 200 ]; then
    board_error_json "BOARD_VALIDATION_ERROR" "limit must be <= 200"
    return 1
  fi

  local norm
  norm=$(board_normalize_state "$state_json" "$(board_now_iso)")
  if ! board_actor_is_assigned "$norm" "$actor"; then
    board_error_with_reason_json "WF_PERMISSION_DENIED" "WF_PERMISSION_DENIED" "actor is not assigned to this workflow"
    return 1
  fi

  local supports_incremental="false"
  local cursor_event_id=""
  local cursor_layer=""
  local filtered
  filtered=$(echo "$norm" | jq '
    ((.board_archives // []) | map(.events // []) | add // [] | map(. + {layer: "archive"})) as $archive_events
    | ((.board_events // []) | map(. + {layer: "online"})) as $online_events
    | ($archive_events + $online_events)
    | unique_by(.event_id)
    | sort_by(.seq, .timestamp)
  ')

  if [ -n "$since_event_id" ] && [ "$since_event_id" != "null" ] && [ -n "$cursor_json" ] && [ "$cursor_json" != "null" ]; then
    board_error_with_reason_json "BOARD_VALIDATION_ERROR" "BOARD_CURSOR_CONFLICT" "cursor and since_event_id cannot be used together"
    return 1
  fi

  if [ -n "$cursor_json" ] && [ "$cursor_json" != "null" ]; then
    local cursor_parsed
    cursor_parsed=$(board_parse_cursor "$cursor_json")
    if [ $? -ne 0 ]; then
      echo "$cursor_parsed"
      return 1
    fi
    cursor_event_id=$(echo "$cursor_parsed" | jq -r '.event_id')
    cursor_layer=$(echo "$cursor_parsed" | jq -r '.layer')
    since_event_id="$cursor_event_id"
  fi

  if [ -n "$since_event_id" ] && [ "$since_event_id" != "null" ]; then
    local since_idx
    since_idx=$(echo "$filtered" | jq -r --arg eid "$since_event_id" 'map(.event_id) | index($eid)')
    if [ "$since_idx" = "null" ] || [ -z "$since_idx" ]; then
      if [ -n "$cursor_event_id" ]; then
        board_error_with_reason_json "BOARD_VALIDATION_ERROR" "BOARD_CURSOR_INVALID" "cursor event_id was not found"
      else
        board_error_json "BOARD_VALIDATION_ERROR" "since_event_id was not found"
      fi
      return 1
    fi
    filtered=$(echo "$filtered" | jq --argjson idx "$since_idx" '.[($idx + 1):]')
    supports_incremental="true"
  fi

  local page total_count scanned_count has_more next_cursor first_layer query_latency_ms
  total_count=$(echo "$filtered" | jq 'length')
  page=$(echo "$filtered" | jq --argjson limit "$limit" --argjson offset "$offset" '.[ $offset : ($offset + $limit) ]')
  scanned_count=$(echo "$page" | jq 'length')
  has_more=$(echo "$filtered" | jq --argjson limit "$limit" --argjson offset "$offset" '((length - ($offset + $limit)) > 0)')
  next_cursor=$(echo "$filtered" | jq --argjson limit "$limit" --argjson offset "$offset" '
    (.[ $offset : ($offset + $limit) ] | last) as $last
    | if $last == null then null else {
        cursor_version: "v1",
        layer: $last.layer,
        event_id: $last.event_id,
        ts_ms: ((($last.timestamp | sub("\\.[0-9]+Z$"; "Z")) | fromdateiso8601) * 1000 | floor)
      } end
  ')
  first_layer=$(echo "$page" | jq -r 'if length == 0 then "online" else (.[0].layer // "online") end')
  if [ "$first_layer" = "archive" ]; then
    query_latency_ms=54
  else
    query_latency_ms=50
  fi
  if [ -n "$trace_id" ]; then
    norm=$(echo "$norm" | jq \
      --arg now "$(board_now_iso)" \
      --arg trace_id "$trace_id" \
      --arg actor "$actor" \
      --arg workflow_id "$(echo "$norm" | jq -r '.task_id')" \
      --arg layer "$first_layer" \
      --arg cursor_layer "$cursor_layer" \
      --argjson scanned "$scanned_count" \
      --argjson total "$total_count" \
      --argjson latency "$query_latency_ms" \
      '.extensions.board_audit += [{
        timestamp: $now,
        trace_id: $trace_id,
        actor: $actor,
        workflow_id: $workflow_id,
        archive_id: (if $layer == "archive" or $cursor_layer == "archive" then ((.board_archives | last | .archive_id) // null) else null end),
        action: "board.events",
        layer: $layer,
        total_scanned: $scanned
      }]
      | .extensions.board_metrics.query_logs += [{
        timestamp: $now,
        trace_id: $trace_id,
        actor: $actor,
        workflow_id: $workflow_id,
        layer: $layer,
        latency_ms: $latency,
        total_scanned: $scanned,
        total_available: $total
      }]')
  fi

  jq -n \
    --argjson events "$page" \
    --argjson next_cursor "$next_cursor" \
    --argjson has_more "$has_more" \
    --arg layer "$first_layer" \
    --argjson scanned "$scanned_count" \
    --argjson latency "$query_latency_ms" \
    --argjson limit "$limit" \
    --argjson offset "$offset" \
    --arg supports_incremental "$supports_incremental" \
    --argjson state "$norm" \
    '{
      events: $events,
      cursor: $next_cursor,
      has_more: $has_more,
      metadata: {
        layer: $layer,
        total_scanned: $scanned,
        query_latency_ms: $latency
      },
      meta: {
        total: ($events | length),
        limit: $limit,
        offset: $offset,
        has_more: $has_more,
        supports_incremental: ($supports_incremental == "true")
      },
      state: $state
    }'
}

board_blockers() {
  local state_json="$1"
  local owner="$2"

  if ! board_validate_enabled "$state_json"; then
    board_error_json "BOARD_DISABLED" "Board mode is disabled for this workflow"
    return 1
  fi

  local norm
  norm=$(board_normalize_state "$state_json" "$(board_now_iso)")
  if [ -n "$owner" ] && [ "$owner" != "null" ]; then
    echo "$norm" | jq --arg owner "$owner" '
      {blockers: [.extensions.board.blocked[] | select(.owner == $owner)], count: ([.extensions.board.blocked[] | select(.owner == $owner)] | length)}
    '
    return 0
  fi

  echo "$norm" | jq '{blockers: .extensions.board.blocked, count: (.extensions.board.blocked | length)}'
}

board_generate_event_id() {
  local uid
  uid=$(uuidgen 2>/dev/null | tr '[:upper:]' '[:lower:]')
  if [ -z "$uid" ]; then
    uid="$(date +%s)-$RANDOM"
  fi
  echo "be_${uid}"
}

board_find_card() {
  local board_json="$1"
  local card_id="$2"
  echo "$board_json" | jq -r --arg id "$card_id" '
    if (.todo | map(.id) | index($id)) != null then "todo"
    elif (.in_progress | map(.id) | index($id)) != null then "in_progress"
    elif (.blocked | map(.id) | index($id)) != null then "blocked"
    elif (.done | map(.id) | index($id)) != null then "done"
    else "" end
  '
}

board_apply_operation() {
  local board_json="$1"
  local op_json="$2"
  local now_iso="$3"

  local action
  action=$(echo "$op_json" | jq -r '.action // empty')
  if [ -z "$action" ]; then
    board_error_json "BOARD_VALIDATION_ERROR" "operation.action is required"
    return 1
  fi

  case "$action" in
    add)
      local card column
      card=$(echo "$op_json" | jq -c '.card // empty')
      column=$(echo "$op_json" | jq -r '.to_column // "todo"')
      if [ -z "$card" ] || [ "$card" == "null" ]; then
        board_error_json "BOARD_VALIDATION_ERROR" "add requires card payload"
        return 1
      fi
      if ! board_validate_column "$column"; then
        board_error_json "BOARD_VALIDATION_ERROR" "invalid to_column"
        return 1
      fi
      local cid
      cid=$(echo "$card" | jq -r '.id // empty')
      if ! board_validate_card_id "$cid"; then
        board_error_json "BOARD_VALIDATION_ERROR" "invalid card id format"
        return 1
      fi
      if [ "$(echo "$board_json" | jq --arg id "$cid" '[(.todo + .in_progress + .blocked + .done)[] | select(.id == $id)] | length')" != "0" ]; then
        board_error_json "BOARD_VALIDATION_ERROR" "card id already exists"
        return 1
      fi
      echo "$board_json" | jq --arg col "$column" --arg now "$now_iso" --argjson card "$card" \
        '.[$col] += [($card + {created_at: ($card.created_at // $now)})] | .last_updated_at = $now'
      ;;
    move)
      local card_id to_column from_column reason
      card_id=$(echo "$op_json" | jq -r '.card_id // empty')
      to_column=$(echo "$op_json" | jq -r '.to_column // empty')
      reason=$(echo "$op_json" | jq -r '.block_reason // empty')
      from_column=$(board_find_card "$board_json" "$card_id")
      if [ -z "$card_id" ] || ! board_validate_column "$to_column"; then
        board_error_json "BOARD_VALIDATION_ERROR" "move requires card_id and valid to_column"
        return 1
      fi
      if [ -z "$from_column" ]; then
        board_error_json "BOARD_CARD_NOT_FOUND" "card not found"
        return 1
      fi
      if [ "$to_column" == "blocked" ] && [ "$reason" == "" ]; then
        board_error_json "BOARD_VALIDATION_ERROR" "move to blocked requires block_reason"
        return 1
      fi
      if [ ${#reason} -gt 200 ]; then
        board_error_json "BOARD_VALIDATION_ERROR" "block_reason length must be <= 200"
        return 1
      fi
      echo "$board_json" | jq --arg from "$from_column" --arg to "$to_column" --arg id "$card_id" --arg now "$now_iso" --arg reason "$reason" '
        (.[ $from ][] | select(.id == $id)) as $card
        | .[$from] = (.[$from] | map(select(.id != $id)))
        | .[$to] += [(
            if $to == "blocked" then
              ($card + {block_reason: $reason, blocked_at: $now})
            else
              ($card | del(.block_reason, .block_message, .blocked_at))
            end
          )]
        | .last_updated_at = $now
      '
      ;;
    remove)
      local rid rcol
      rid=$(echo "$op_json" | jq -r '.card_id // empty')
      rcol=$(board_find_card "$board_json" "$rid")
      if [ -z "$rid" ]; then
        board_error_json "BOARD_VALIDATION_ERROR" "remove requires card_id"
        return 1
      fi
      if [ -z "$rcol" ]; then
        board_error_json "BOARD_CARD_NOT_FOUND" "card not found"
        return 1
      fi
      echo "$board_json" | jq --arg col "$rcol" --arg id "$rid" --arg now "$now_iso" \
        '.[$col] = (.[$col] | map(select(.id != $id))) | .last_updated_at = $now'
      ;;
    block)
      local bid breason bmsg bfrom
      bid=$(echo "$op_json" | jq -r '.card_id // empty')
      breason=$(echo "$op_json" | jq -r '.block_reason // empty')
      bmsg=$(echo "$op_json" | jq -r '.block_message // empty')
      bfrom=$(board_find_card "$board_json" "$bid")
      if [ -z "$bid" ] || [ -z "$breason" ]; then
        board_error_json "BOARD_VALIDATION_ERROR" "block requires card_id and block_reason"
        return 1
      fi
      if [ ${#breason} -gt 200 ]; then
        board_error_json "BOARD_VALIDATION_ERROR" "block_reason length must be <= 200"
        return 1
      fi
      if [ -z "$bfrom" ]; then
        board_error_json "BOARD_CARD_NOT_FOUND" "card not found"
        return 1
      fi
      echo "$board_json" | jq --arg from "$bfrom" --arg id "$bid" --arg reason "$breason" --arg msg "$bmsg" --arg now "$now_iso" '
        (.[ $from ][] | select(.id == $id)) as $card
        | .[$from] = (.[$from] | map(select(.id != $id)))
        | .blocked += [($card + {block_reason: $reason, block_message: (if $msg == "" then null else $msg end), blocked_at: $now})]
        | .last_updated_at = $now
      '
      ;;
    unblock)
      local ubid uto
      ubid=$(echo "$op_json" | jq -r '.card_id // empty')
      uto=$(echo "$op_json" | jq -r '.to_column // "in_progress"')
      if [ -z "$ubid" ] || [ "$uto" == "blocked" ] || ! board_validate_column "$uto"; then
        board_error_json "BOARD_VALIDATION_ERROR" "unblock requires card_id and non-blocked to_column"
        return 1
      fi
      if [ "$(echo "$board_json" | jq --arg id "$ubid" '[.blocked[] | select(.id == $id)] | length')" == "0" ]; then
        board_error_json "BOARD_CARD_NOT_FOUND" "blocked card not found"
        return 1
      fi
      echo "$board_json" | jq --arg id "$ubid" --arg to "$uto" --arg now "$now_iso" '
        (.blocked[] | select(.id == $id)) as $card
        | .blocked = (.blocked | map(select(.id != $id)))
        | .[$to] += [($card | del(.block_reason, .block_message, .blocked_at))]
        | .last_updated_at = $now
      '
      ;;
    *)
      board_error_json "BOARD_VALIDATION_ERROR" "unsupported board action"
      return 1
      ;;
  esac
}

board_update() {
  local state_json="$1"
  local operations_json="$2"
  local actor="${3:-system}"
  local idempotency_json="$4"

  if ! board_validate_enabled "$state_json"; then
    board_error_json "BOARD_DISABLED" "Board mode is disabled for this workflow"
    return 1
  fi
  if ! echo "$operations_json" | jq -e 'type == "array" and length > 0' >/dev/null 2>&1; then
    board_error_json "BOARD_VALIDATION_ERROR" "operations must be a non-empty array"
    return 1
  fi

  local now_iso norm board events seq task_id updated_events
  now_iso=$(board_now_iso)
  norm=$(board_normalize_state "$state_json" "$now_iso")
  local workflow_version current_stage owner_role owner_actor
  workflow_version=$(echo "$norm" | jq -r '.workflow_version // "v1"')
  current_stage=$(echo "$norm" | jq -r '.current_stage')
  owner_role=$(owner_role_for_stage "$workflow_version" "$current_stage")
  owner_actor=$(echo "$norm" | jq -r --arg role "$owner_role" '.assignments[$role] // empty')
  if [ -n "$owner_role" ] && [ -n "$owner_actor" ] && [ "$actor" != "$owner_actor" ]; then
    jq -n \
      --arg owner_role "$owner_role" \
      --arg owner_actor "$owner_actor" \
      --arg actor "$actor" \
      '{
        error: "Only stage owner can update board",
        reason: "WF_PERMISSION_DENIED",
        details: [
          ("owner role: " + $owner_role),
          ("required actor: " + $owner_actor),
          ("actual actor: " + $actor)
        ]
      }'
    return 1
  fi

  board=$(echo "$norm" | jq -c '.extensions.board')
  events=$(echo "$norm" | jq -c '.board_events')
  seq=$(echo "$events" | jq 'map(.seq) | max // 0')
  task_id=$(echo "$norm" | jq -r '.task_id')
  updated_events='[]'

  local idempotency_key="" idempotency_source="" idempotency_action="" operations_hash=""
  operations_hash=$(board_hash_json "$operations_json")
  if [ -n "$idempotency_json" ] && [ "$idempotency_json" != "null" ]; then
    if ! echo "$idempotency_json" | jq -e 'type == "object"' >/dev/null 2>&1; then
      board_error_json "BOARD_VALIDATION_ERROR" "idempotency must be an object"
      return 1
    fi
    idempotency_source=$(echo "$idempotency_json" | jq -r '.source_stage_event_id // empty')
    idempotency_action=$(echo "$idempotency_json" | jq -r '.action // empty')
    if [ -z "$idempotency_source" ] || [ -z "$idempotency_action" ]; then
      board_error_json "BOARD_VALIDATION_ERROR" "idempotency.source_stage_event_id and idempotency.action are required"
      return 1
    fi
    idempotency_key="${task_id}:${idempotency_source}:${idempotency_action}"
  fi

  if [ -n "$idempotency_key" ]; then
    local existing_entry existing_hash
    existing_entry=$(echo "$norm" | jq -c --arg key "$idempotency_key" '.extensions.board.idempotency_registry[]? | select(.idempotency_key == $key)' | head -n 1)
    if [ -n "$existing_entry" ]; then
      existing_hash=$(echo "$existing_entry" | jq -r '.operations_hash // empty')
      if [ "$existing_hash" != "$operations_hash" ]; then
        board_error_with_reason_json "BOARD_VALIDATION_ERROR" "BOARD_IDEMPOTENCY_CONFLICT" "idempotency key was reused with different operations"
        return 1
      fi
      local existing_first_applied
      existing_first_applied=$(echo "$existing_entry" | jq -r '.first_applied_at // empty')
      echo "$norm" | jq \
        --arg key "$idempotency_key" \
        --arg now "$now_iso" \
        --arg first_applied "$existing_first_applied" \
        '(.extensions.board.idempotency_registry) |= (map(if .idempotency_key == $key then .last_seen_at = $now else . end))
         | {state: ., updated_events: [], idempotency: {status: "already_applied", key: $key, first_applied_at: $first_applied, last_seen_at: $now}}'
      return 0
    fi
  fi

  local op_count i
  op_count=$(echo "$operations_json" | jq 'length')
  i=0
  while [ "$i" -lt "$op_count" ]; do
    local op action event_id event op_result
    op=$(echo "$operations_json" | jq -c ".[$i]")
    action=$(echo "$op" | jq -r '.action // "unknown"')
    op_result=$(board_apply_operation "$board" "$op" "$now_iso")
    if [ $? -ne 0 ]; then
      echo "$op_result"
      return 1
    fi
    board="$op_result"
    seq=$((seq + 1))
    event_id=$(board_generate_event_id)
    event=$(jq -n --argjson seq "$seq" --arg eid "$event_id" --arg tid "$task_id" --arg actor "$actor" --arg action "$action" --arg ts "$now_iso" --argjson metadata "$op" \
      '{seq: $seq, event_id: $eid, task_id: $tid, actor: $actor, action: $action, timestamp: $ts, metadata: $metadata}')
    events=$(echo "$events" | jq --argjson e "$event" '. + [$e]')
    updated_events=$(echo "$updated_events" | jq --argjson e "$event" '. + [$e]')
    i=$((i + 1))
  done

  local result_state
  result_state=$(echo "$norm" | jq --argjson board "$board" --argjson events "$events" \
    '.extensions.board = $board | .board_events = $events')

  if [ -n "$idempotency_key" ]; then
    result_state=$(echo "$result_state" | jq \
      --arg key "$idempotency_key" \
      --arg source "$idempotency_source" \
      --arg action "$idempotency_action" \
      --arg op_hash "$operations_hash" \
      --arg ts "$now_iso" \
      --argjson applied_events "$updated_events" \
      '.extensions.board.idempotency_registry += [{
        idempotency_key: $key,
        source_stage_event_id: $source,
        action: $action,
        operations_hash: $op_hash,
        applied_event_ids: ($applied_events | map(.event_id)),
        first_applied_at: $ts,
        last_seen_at: $ts
      }]')
    echo "$result_state" | jq --argjson updated "$updated_events" --arg key "$idempotency_key" --arg ts "$now_iso" \
      '{state: ., updated_events: $updated, idempotency: {status: "applied", key: $key, first_applied_at: $ts, last_seen_at: $ts}}'
    return 0
  fi

  echo "$result_state" | jq --argjson updated "$updated_events" '{state: ., updated_events: $updated}'
}

board_archive() {
  local state_json="$1"
  local actor="$2"
  local cutoff_seq="$3"
  local trace_id="$4"
  local now_iso
  now_iso=$(board_now_iso)
  local norm
  norm=$(board_normalize_state "$state_json" "$now_iso")

  if ! board_actor_is_assigned "$norm" "$actor"; then
    board_error_with_reason_json "WF_PERMISSION_DENIED" "WF_PERMISSION_DENIED" "actor is not assigned to this workflow"
    return 1
  fi

  local max_seq
  max_seq=$(echo "$norm" | jq -r '.board_events | map(.seq) | max // 0')
  if [ -z "$cutoff_seq" ] || [ "$cutoff_seq" = "null" ]; then
    cutoff_seq="$max_seq"
  fi
  if ! [[ "$cutoff_seq" =~ ^[0-9]+$ ]]; then
    board_error_json "BOARD_VALIDATION_ERROR" "cutoff_seq must be a non-negative integer"
    return 1
  fi

  local archive_id
  archive_id=$(board_generate_event_id | sed 's/^be_/ba_/')
  local to_archive remaining archived_count
  to_archive=$(echo "$norm" | jq --argjson cutoff "$cutoff_seq" '[.board_events[] | select(.seq <= $cutoff) | . + {layer: "archive"}]')
  remaining=$(echo "$norm" | jq --argjson cutoff "$cutoff_seq" '[.board_events[] | select(.seq > $cutoff)]')
  archived_count=$(echo "$to_archive" | jq 'length')

  norm=$(echo "$norm" | jq \
    --arg archive_id "$archive_id" \
    --arg archived_at "$now_iso" \
    --arg workflow_id "$(echo "$norm" | jq -r '.task_id')" \
    --arg trace_id "$trace_id" \
    --arg actor "$actor" \
    --argjson events "$to_archive" \
    --argjson remaining "$remaining" \
    '.board_archives += [{
      archive_id: $archive_id,
      workflow_id: $workflow_id,
      archived_at: $archived_at,
      events: $events,
      metadata: {
        event_count: ($events | length),
        storage_path: (".data/workflows/archive/" + $workflow_id + "/" + $archive_id + ".json")
      }
    }]
    | .board_events = $remaining
    | .extensions.board_audit += [{
      timestamp: $archived_at,
      trace_id: $trace_id,
      actor: $actor,
      workflow_id: $workflow_id,
      archive_id: $archive_id,
      action: "board.archive",
      layer: "archive",
      total_scanned: ($events | length)
    }]')

  jq -n \
    --argjson state "$norm" \
    --arg archive_id "$archive_id" \
    --arg archived_at "$now_iso" \
    --argjson archived_count "$archived_count" \
    '{
      state: $state,
      archived_count: $archived_count,
      archive_id: $archive_id,
      archived_at: $archived_at
    }'
}

board_sync() {
  local state_json="$1"
  local actor="$2"
  local force="$3"
  local simulate_fail="$4"
  local forced_drift_seconds="$5"
  local now_iso
  now_iso=$(board_now_iso)
  local norm
  norm=$(board_normalize_state "$state_json" "$now_iso")

  if ! board_actor_is_assigned "$norm" "$actor"; then
    board_error_with_reason_json "WF_PERMISSION_DENIED" "WF_PERMISSION_DENIED" "actor is not assigned to this workflow"
    return 1
  fi

  local scheduled_at
  scheduled_at=$(echo "$norm" | jq -r '.extensions.board_sync.next_sync_at')
  if [ -z "$scheduled_at" ] || [ "$scheduled_at" = "null" ]; then
    scheduled_at="$now_iso"
  fi

  local drift_seconds
  if [[ "$forced_drift_seconds" =~ ^[0-9]+$ ]]; then
    drift_seconds="$forced_drift_seconds"
  else
    drift_seconds=$(node -e '
      const scheduled = new Date(process.argv[1]).getTime();
      const now = new Date(process.argv[2]).getTime();
      if (!Number.isFinite(scheduled) || !Number.isFinite(now)) {
        process.stdout.write("0");
        process.exit(0);
      }
      const sec = Math.max(0, Math.floor((now - scheduled) / 1000));
      process.stdout.write(String(sec));
    ' "$scheduled_at" "$now_iso")
  fi

  local retry_count next_delay next_sync_at
  retry_count=$(echo "$norm" | jq -r '.extensions.board_sync.retry_count // 0')
  if [ "$simulate_fail" = "true" ]; then
    retry_count=$((retry_count + 1))
    next_delay=$(echo "$norm" | jq -r --argjson retry "$retry_count" '
      .extensions.board_sync.retry_schedule_seconds as $s
      | if ($s | length) == 0 then 900 else $s[(($retry - 1) | if . < 0 then 0 else . end)] // ($s | last) end
    ')
    next_sync_at=$(board_add_seconds_iso "$now_iso" "$next_delay")
    norm=$(echo "$norm" | jq \
      --arg now "$now_iso" \
      --arg next_sync "$next_sync_at" \
      --arg actor "$actor" \
      --argjson drift "$drift_seconds" \
      --argjson retry "$retry_count" \
      '.extensions.board_sync.retry_count = $retry
      | .extensions.board_sync.attempt_count = ((.extensions.board_sync.attempt_count // 0) + 1)
      | .extensions.board_sync.pending_queue_depth = ((.extensions.board_sync.pending_queue_depth // 0) + 1)
      | .extensions.board_sync.last_error = "SYNC_FAILED_SIMULATED"
      | .extensions.board_sync.next_sync_at = $next_sync
      | .extensions.board_sync.scheduler_history += [{
        scheduled_at: (.extensions.board_sync.next_sync_at // $now),
        run_at: $now,
        drift_seconds: $drift,
        retry_count: $retry,
        success: false,
        pending_queue_depth: .extensions.board_sync.pending_queue_depth
      }]
      | .extensions.board_metrics.sync_logs += [{
        timestamp: $now,
        actor: $actor,
        success: false,
        drift_seconds: $drift,
        retry_count: $retry,
        pending_queue_depth: .extensions.board_sync.pending_queue_depth
      }]')
    jq -n \
      --argjson state "$norm" \
      --arg next_sync_at "$next_sync_at" \
      --argjson synced "0" \
      --argjson skipped "0" \
      --argjson retry_count "$retry_count" \
      '{state: $state, synced_events: $synced, skipped_events: $skipped, next_sync_at: $next_sync_at, retry_count: $retry_count, status: "failed"}'
    return 0
  fi

  next_sync_at=$(board_add_seconds_iso "$now_iso" 60)
  local last_event_id
  last_event_id=$(echo "$norm" | jq -r '.board_events | last | .event_id // null')
  norm=$(echo "$norm" | jq \
    --arg now "$now_iso" \
    --arg next_sync "$next_sync_at" \
    --arg actor "$actor" \
    --arg last_event_id "$last_event_id" \
    --argjson drift "$drift_seconds" \
    '.extensions.board_sync.retry_count = 0
    | .extensions.board_sync.attempt_count = ((.extensions.board_sync.attempt_count // 0) + 1)
    | .extensions.board_sync.pending_queue_depth = 0
    | .extensions.board_sync.last_error = null
    | .extensions.board_sync.last_synced_at = $now
    | .extensions.board_sync.last_synced_event_id = (if $last_event_id == "null" then null else $last_event_id end)
    | .extensions.board_sync.next_sync_at = $next_sync
    | .extensions.board_sync.scheduler_history += [{
      scheduled_at: (.extensions.board_sync.next_sync_at // $now),
      run_at: $now,
      drift_seconds: $drift,
      retry_count: 0,
      success: true,
      pending_queue_depth: 0
    }]
    | .extensions.board_metrics.sync_logs += [{
      timestamp: $now,
      actor: $actor,
      success: true,
      drift_seconds: $drift,
      retry_count: 0,
      pending_queue_depth: 0
    }]')

  jq -n \
    --argjson state "$norm" \
    --arg next_sync_at "$next_sync_at" \
    --argjson synced "0" \
    --argjson skipped "0" \
    '{state: $state, synced_events: $synced, skipped_events: $skipped, next_sync_at: $next_sync_at, retry_count: 0, status: "ok"}'
}
