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

# Read JSON params from stdin: {"content": "...", "mentions": "..."}
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
MENTIONS_PRESENT=$(echo "$PARAMS" | jq -r 'has("mentions")')
MENTIONS_VALUE=""
if [ "$MENTIONS_PRESENT" = "true" ]; then
    MENTIONS_TYPE=$(echo "$PARAMS" | jq -r '.mentions | type')
    if [ "$MENTIONS_TYPE" != "string" ]; then
        log_debug "Error: mentions must be a string, got $MENTIONS_TYPE"
        echo "{\"error\": \"mentions must be a string (e.g., \\\"name\\\"), not a $MENTIONS_TYPE (e.g., [\\\"name\\\"])\"}" >&2
        exit 1
    fi

    MENTIONS_VALUE=$(echo "$PARAMS" | jq -r '.mentions')
fi

# Build request body - convert string mention to array for API
MENTIONS_ARRAY="[]"
if [ -n "${MENTIONS_VALUE//[[:space:]]/}" ]; then
    MENTIONS_ARRAY=$(jq -cn --arg mention "$MENTIONS_VALUE" '[$mention]')
fi

BODY=$(jq -n \
    --arg agentId "$AGENT_ID" \
    --arg content "$CONTENT" \
    --argjson mentions "$MENTIONS_ARRAY" \
    '{agentId: $agentId, content: $content, mentions: $mentions}')

log_debug "Sending POST request to $COLONY_API/api/sessions/$ROOM_ID/agent-messages"

# Use temp file to separate response body from HTTP status code.
# This avoids SIGPIPE / pipefail issues with echo | tail/sed on large bodies,
# which previously caused false "send failed" reports even though the message
# had already been delivered (the API processes & broadcasts the message before
# returning the HTTP response).
TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT

HTTP_CODE=$(curl -s -o "$TMPFILE" -w "%{http_code}" -X POST \
    "$COLONY_API/api/sessions/$ROOM_ID/agent-messages" \
    -H "Content-Type: application/json" \
    -d "$BODY") || true

BODY_RESPONSE=$(cat "$TMPFILE" 2>/dev/null || echo "")

log_debug "API Response (HTTP $HTTP_CODE): $BODY_RESPONSE"

# Validate HTTP_CODE is numeric before comparison
if ! [[ "$HTTP_CODE" =~ ^[0-9]+$ ]]; then
    log_debug "Warning: Non-numeric HTTP code '$HTTP_CODE', treating as success if body looks valid"
    # If we got a response body that looks like valid JSON with a message id,
    # the send likely succeeded despite the status code parsing issue
    if printf '%s' "$BODY_RESPONSE" | jq -e '.message.id' >/dev/null 2>&1; then
        printf '%s' "$BODY_RESPONSE"
        exit 0
    fi
    echo "send-message failed: could not determine HTTP status" >&2
    exit 1
fi

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
    printf '%s' "$BODY_RESPONSE"
else
    log_debug "send-message failed with HTTP $HTTP_CODE"
    ERROR_MSG="send-message failed (HTTP $HTTP_CODE)"

    # Try to extract error details from response
    if printf '%s' "$BODY_RESPONSE" | jq empty 2>/dev/null; then
        ERROR_DETAIL=$(printf '%s' "$BODY_RESPONSE" | jq -r '.error // .message // empty')
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
