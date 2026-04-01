#!/bin/bash

# Board helpers for dev-workflow M2.

BOARD_COLUMNS=("todo" "in_progress" "blocked" "done")

board_now_iso() {
  date -u +"%Y-%m-%dT%H:%M:%S.%3NZ"
}

board_error_json() {
  local code="$1"
  local message="$2"
  jq -n --arg code "$code" --arg msg "$message" '{error: $code, message: $msg}'
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
  echo "$state_json" | jq --arg now "$now_iso" '
    .board_events = (.board_events // [])
    | .extensions.board = (.extensions.board // {})
    | .extensions.board.todo = (.extensions.board.todo // [])
    | .extensions.board.in_progress = (.extensions.board.in_progress // [])
    | .extensions.board.blocked = (.extensions.board.blocked // [])
    | .extensions.board.done = (.extensions.board.done // [])
    | .extensions.board.last_updated_at = (.extensions.board.last_updated_at // $now)
  '
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
  local supports_incremental="false"
  local filtered
  filtered=$(echo "$norm" | jq '.board_events')

  if [ -n "$since_event_id" ] && [ "$since_event_id" != "null" ]; then
    local since_seq
    since_seq=$(echo "$filtered" | jq -r --arg eid "$since_event_id" 'map(select(.event_id == $eid) | .seq) | max // empty')
    if [ -z "$since_seq" ]; then
      board_error_json "BOARD_VALIDATION_ERROR" "since_event_id was not found"
      return 1
    fi
    filtered=$(echo "$filtered" | jq --argjson seq "$since_seq" '[.[] | select(.seq > $seq)]')
    supports_incremental="true"
  fi

  echo "$filtered" | jq \
    --argjson limit "$limit" \
    --argjson offset "$offset" \
    --arg supports_incremental "$supports_incremental" \
    '{
      events: (.[ $offset : ($offset + $limit) ]),
      meta: {
        total: length,
        limit: $limit,
        offset: $offset,
        has_more: ((length - ($offset + $limit)) > 0),
        supports_incremental: ($supports_incremental == "true")
      }
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

  echo "$norm" | jq --argjson board "$board" --argjson events "$events" --argjson updated "$updated_events" \
    '.extensions.board = $board | .board_events = $events | {state: ., updated_events: $updated}'
}
