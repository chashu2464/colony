#!/bin/bash
# Colony skill: get-session-history
# Retrieves session history records for this agent via the Colony API.
# Environment variables:
#   COLONY_API      - Colony server URL (default: http://localhost:3001)
#   COLONY_AGENT_ID - Agent ID making the request
#   COLONY_ROOM_ID  - Current room ID

set -euo pipefail

COLONY_API="${COLONY_API:-http://localhost:3001}"
ROOM_ID="${COLONY_ROOM_ID:?COLONY_ROOM_ID is required}"
AGENT_ID="${COLONY_AGENT_ID:?COLONY_AGENT_ID is required}"

# Read JSON params from stdin
PARAMS=$(cat)
COMMAND=$(echo "$PARAMS" | jq -r '.command // "list"')

case "$COMMAND" in
  list)
    RESPONSE=$(curl -s -w "\n%{http_code}" \
      "$COLONY_API/api/sessions/$ROOM_ID/agents/$AGENT_ID/history")
    ;;
  search)
    QUERY=$(echo "$PARAMS" | jq -r '.query // empty')
    if [ -z "$QUERY" ]; then
      echo '{"error": "query is required for search command"}' >&2
      exit 1
    fi
    ENCODED_QUERY=$(jq -rn --arg q "$QUERY" '$q | @uri')
    RESPONSE=$(curl -s -w "\n%{http_code}" \
      "$COLONY_API/api/sessions/$ROOM_ID/agents/$AGENT_ID/history/search?q=$ENCODED_QUERY")
    ;;
  read)
    SESSION_ID=$(echo "$PARAMS" | jq -r '.sessionId // empty')
    if [ -z "$SESSION_ID" ]; then
      echo '{"error": "sessionId is required for read command"}' >&2
      exit 1
    fi
    PAGE=$(echo "$PARAMS" | jq -r '.page // 0')
    RESPONSE=$(curl -s -w "\n%{http_code}" \
      "$COLONY_API/api/sessions/$ROOM_ID/agents/$AGENT_ID/history/$SESSION_ID?page=$PAGE")
    ;;
  *)
    echo "{\"error\": \"unknown command: $COMMAND. Valid: list, search, read\"}" >&2
    exit 1
    ;;
esac

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY_RESPONSE=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
    echo "$BODY_RESPONSE"
else
    echo "get-session-history failed (HTTP $HTTP_CODE): $BODY_RESPONSE" >&2
    exit 1
fi
