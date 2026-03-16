#!/usr/bin/env bash
# remember skill handler - Store information to long-term memory

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Read JSON input from stdin
INPUT=$(cat)

# Extract parameters using jq
CONTENT=$(echo "$INPUT" | jq -r '.content // empty')
IMPORTANCE=$(echo "$INPUT" | jq -r '.importance // 4')
TYPE=$(echo "$INPUT" | jq -r '.type // "knowledge"')
TAGS=$(echo "$INPUT" | jq -r '.tags // []')
CONTEXT=$(echo "$INPUT" | jq -r '.context // empty')

# Validate required parameters
if [ -z "$CONTENT" ]; then
    echo '{"success": false, "error": "content is required"}' | jq -c
    exit 1
fi

# Validate content length
CONTENT_LENGTH=${#CONTENT}
if [ "$CONTENT_LENGTH" -lt 20 ]; then
    echo '{"success": false, "error": "content too short (minimum 20 characters). Please provide a more detailed description."}' | jq -c
    exit 1
fi

# Validate importance range
if [ "$IMPORTANCE" -lt 1 ] || [ "$IMPORTANCE" -gt 5 ]; then
    echo '{"success": false, "error": "importance must be between 1 and 5"}' | jq -c
    exit 1
fi

# Warn if importance is low
if [ "$IMPORTANCE" -lt 3 ]; then
    echo '{"success": false, "warning": "importance < 3 will be filtered out during retrieval. Consider using importance >= 3 for memories you want to recall."}' | jq -c
    exit 1
fi

# Get environment variables from Colony
COLONY_API="${COLONY_API:-http://localhost:3001}"
COLONY_AGENT_ID="${COLONY_AGENT_ID:-}"
COLONY_ROOM_ID="${COLONY_ROOM_ID:-}"

if [ -z "$COLONY_AGENT_ID" ] || [ -z "$COLONY_ROOM_ID" ]; then
    echo '{"success": false, "error": "COLONY_AGENT_ID and COLONY_ROOM_ID must be set"}' | jq -c
    exit 1
fi

# Build metadata
METADATA=$(jq -n \
    --arg type "$TYPE" \
    --argjson importance "$IMPORTANCE" \
    --arg agentId "$COLONY_AGENT_ID" \
    --arg roomId "$COLONY_ROOM_ID" \
    --argjson tags "$TAGS" \
    --arg context "$CONTEXT" \
    '{
        type: $type,
        importance: $importance,
        agentId: $agentId,
        roomId: $roomId,
        tags: $tags
    } + (if $context != "" then {context: $context} else {} end)'
)

# Build request payload
PAYLOAD=$(jq -n \
    --arg content "$CONTENT" \
    --argjson metadata "$METADATA" \
    '{
        content: $content,
        metadata: $metadata
    }'
)

# Call Colony API
RESPONSE=$(curl -s -X POST "$COLONY_API/api/memory/retain" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")

# Check if request was successful
if echo "$RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
    MEMORY_ID=$(echo "$RESPONSE" | jq -r '.memoryId // "unknown"')
    echo "{\"success\": true, \"message\": \"Memory stored successfully\", \"memoryId\": \"$MEMORY_ID\", \"importance\": $IMPORTANCE, \"type\": \"$TYPE\"}" | jq -c
else
    ERROR=$(echo "$RESPONSE" | jq -r '.error // "Unknown error"')
    echo "{\"success\": false, \"error\": \"Failed to store memory: $ERROR\"}" | jq -c
    exit 1
fi
