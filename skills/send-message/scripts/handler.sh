#!/bin/bash
# Colony skill: send-message
# Sends a message to a Colony chat room via the HTTP API.
# Environment variables:
#   COLONY_API      - Colony server URL (default: http://localhost:3001)
#   COLONY_AGENT_ID - Agent ID making the request
#   COLONY_ROOM_ID  - Target room/session ID

set -euo pipefail

COLONY_API="${COLONY_API:-http://localhost:3001}"
ROOM_ID="${COLONY_ROOM_ID:?COLONY_ROOM_ID is required}"
AGENT_ID="${COLONY_AGENT_ID:?COLONY_AGENT_ID is required}"

# Create skill log file for debugging
LOG_FILE="/Users/casu/Documents/Colony/logs/skill-send-message.log"
mkdir -p "$(dirname "$LOG_FILE")"

log_debug() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEBUG] $1" >> "$LOG_FILE"
}

log_debug "Starting send-message skill (Room: $ROOM_ID, Agent: $AGENT_ID)"

# Read JSON params from stdin: {"content": "...", "mentions": [...]}
PARAMS=$(cat)

# Validate JSON format
if ! echo "$PARAMS" | jq empty 2>/dev/null; then
    log_debug "Error: Invalid JSON format"
    echo '{"error": "Invalid JSON format. Check for unescaped newlines, missing quotes, or syntax errors."}' >&2
    exit 1
fi

CONTENT=$(echo "$PARAMS" | jq -r '.content // empty')
if [ -z "$CONTENT" ]; then
    log_debug "Error: content is required"
    echo '{"error": "content is required and must be a non-empty string"}' >&2
    exit 1
fi

# Validate mentions parameter type
MENTIONS_RAW=$(echo "$PARAMS" | jq -r '.mentions // "null"')
if [ "$MENTIONS_RAW" != "null" ]; then
    MENTIONS_TYPE=$(echo "$PARAMS" | jq -r '.mentions | type')
    if [ "$MENTIONS_TYPE" != "array" ]; then
        log_debug "Error: mentions must be an array, got $MENTIONS_TYPE"
        echo "{\"error\": \"mentions must be an array (e.g., [\\\"name\\\"]), not a $MENTIONS_TYPE (e.g., \\\"name\\\")\"}" >&2
        exit 1
    fi
fi

# Build request body
BODY=$(jq -n \
    --arg agentId "$AGENT_ID" \
    --arg content "$CONTENT" \
    --argjson mentions "$(echo "$PARAMS" | jq '.mentions // []')" \
    '{agentId: $agentId, content: $content, mentions: $mentions}')

log_debug "Sending POST request to $COLONY_API/api/sessions/$ROOM_ID/agent-messages"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "$COLONY_API/api/sessions/$ROOM_ID/agent-messages" \
    -H "Content-Type: application/json" \
    -d "$BODY")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY_RESPONSE=$(echo "$RESPONSE" | sed '$d')

log_debug "API Response (HTTP $HTTP_CODE): $BODY_RESPONSE"

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
    echo "$BODY_RESPONSE"
else
    log_debug "send-message failed with HTTP $HTTP_CODE"
    ERROR_MSG="send-message failed (HTTP $HTTP_CODE)"

    # Try to extract error details from response
    if echo "$BODY_RESPONSE" | jq empty 2>/dev/null; then
        ERROR_DETAIL=$(echo "$BODY_RESPONSE" | jq -r '.error // .message // empty')
        if [ -n "$ERROR_DETAIL" ]; then
            ERROR_MSG="$ERROR_MSG: $ERROR_DETAIL"
        fi
    else
        ERROR_MSG="$ERROR_MSG: $BODY_RESPONSE"
    fi

    echo "$ERROR_MSG" >&2
    echo "{\"error\": \"$ERROR_MSG\", \"httpCode\": $HTTP_CODE}" >&2
    exit 1
fi
