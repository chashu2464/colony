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

# Read JSON params from stdin: {"content": "...", "mentions": [...]}
PARAMS=$(cat)

CONTENT=$(echo "$PARAMS" | jq -r '.content // empty')
if [ -z "$CONTENT" ]; then
    echo '{"error": "content is required"}' >&2
    exit 1
fi

# Build request body
BODY=$(jq -n \
    --arg agentId "$AGENT_ID" \
    --arg content "$CONTENT" \
    --argjson mentions "$(echo "$PARAMS" | jq '.mentions // []')" \
    '{agentId: $agentId, content: $content, mentions: $mentions}')

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "$COLONY_API/api/sessions/$ROOM_ID/agent-messages" \
    -H "Content-Type: application/json" \
    -d "$BODY")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY_RESPONSE=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
    echo "$BODY_RESPONSE"
else
    echo "send-message failed (HTTP $HTTP_CODE): $BODY_RESPONSE" >&2
    exit 1
fi
