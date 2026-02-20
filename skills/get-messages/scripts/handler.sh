#!/bin/bash
# Colony skill: get-messages
# Retrieves chat messages from a Colony room via the HTTP API.
# Environment variables:
#   COLONY_API      - Colony server URL (default: http://localhost:3001)
#   COLONY_ROOM_ID  - Target room/session ID

set -euo pipefail

COLONY_API="${COLONY_API:-http://localhost:3001}"
ROOM_ID="${COLONY_ROOM_ID:?COLONY_ROOM_ID is required}"

# Read JSON params from stdin: {"limit": 20}
PARAMS=$(cat)

LIMIT=$(echo "$PARAMS" | jq -r '.limit // 20')

RESPONSE=$(curl -s -w "\n%{http_code}" \
    "$COLONY_API/api/sessions/$ROOM_ID/messages?limit=$LIMIT")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY_RESPONSE=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
    echo "$BODY_RESPONSE"
else
    echo "Error ($HTTP_CODE): $BODY_RESPONSE" >&2
    exit 1
fi
