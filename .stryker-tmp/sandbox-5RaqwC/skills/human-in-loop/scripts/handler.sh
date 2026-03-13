#!/bin/bash
# Colony skill: human-in-loop
# Sends a request for human input and waits for a response.

set -euo pipefail

COLONY_API="${COLONY_API:-http://localhost:3001}"
ROOM_ID="${COLONY_ROOM_ID:?COLONY_ROOM_ID is required}"
AGENT_ID="${COLONY_AGENT_ID:?COLONY_AGENT_ID is required}"

# Read input JSON: {"prompt": "...", "timeout": 300}
INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty')
TIMEOUT=$(echo "$INPUT" | jq -r '.timeout // 300')

if [ -z "$PROMPT" ]; then
    echo '{"error": "prompt is required"}' >&2
    exit 1
fi

REQUEST_ID=$(date +%s%N | shasum | head -c 8)

# 1. Send the request message
# Note: Metadata field is 'humanInputRequest'
BODY=$(jq -n \
    --arg agentId "$AGENT_ID" \
    --arg content "需要人工干预: $PROMPT" \
    --arg requestId "$REQUEST_ID" \
    --arg prompt "$PROMPT" \
    '{
        agentId: $agentId, 
        content: $content, 
        mentions: [],
        metadata: {
            humanInputRequest: {
                requestId: $requestId,
                prompt: $prompt
            }
        }
    }')

curl -s -X POST \
    "$COLONY_API/api/sessions/$ROOM_ID/agent-messages" \
    -H "Content-Type: application/json" \
    -d "$BODY" > /dev/null

# 2. Wait for response
START_TIME=$(date +%s)
while true; do
    CURRENT_TIME=$(date +%s)
    ELAPSED=$((CURRENT_TIME - START_TIME))
    
    if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
        echo "{\"error\": \"Timeout waiting for human input ($TIMEOUT s)\"}"
        exit 1
    fi

    # Fetch latest 10 messages
    MESSAGES=$(curl -s "$COLONY_API/api/sessions/$ROOM_ID/messages?limit=10")
    
    # Look for a message with metadata.humanInputResponse.requestId == REQUEST_ID
    RESPONSE=$(echo "$MESSAGES" | jq -r --arg rid "$REQUEST_ID" '
        .messages[] | 
        select(.metadata.humanInputResponse.requestId == $rid) | 
        .content
    ' | head -n 1)

    if [ ! -z "$RESPONSE" ]; then
        echo "{\"response\": \"$RESPONSE\"}"
        exit 0
    fi

    sleep 2
done
