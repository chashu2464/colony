#!/usr/bin/env bash
# ── delayed-exec skill handler ──────────────────────────────
# Schedule delayed or repeated task execution

set -euo pipefail

# Read JSON input from stdin
INPUT=$(cat)

# Parse parameters
MODE=$(echo "$INPUT" | jq -r '.mode')
DELAY_MS=$(echo "$INPUT" | jq -r '.delayMs')
PROMPT=$(echo "$INPUT" | jq -r '.prompt')
REPEAT_INTERVAL_MS=$(echo "$INPUT" | jq -r '.repeatIntervalMs // empty')
MAX_EXECUTIONS=$(echo "$INPUT" | jq -r '.maxExecutions // empty')

# Validate required parameters
if [ "$MODE" = "null" ] || [ "$DELAY_MS" = "null" ] || [ "$PROMPT" = "null" ]; then
    echo '{"error": "mode, delayMs, and prompt are required"}' >&2
    exit 1
fi

if [ "$MODE" != "once" ] && [ "$MODE" != "repeat" ]; then
    echo '{"error": "mode must be \"once\" or \"repeat\""}' >&2
    exit 1
fi

if [ "$MODE" = "repeat" ] && [ -z "$REPEAT_INTERVAL_MS" ]; then
    echo '{"error": "repeatIntervalMs is required for repeat mode"}' >&2
    exit 1
fi

# Build request payload
PAYLOAD=$(jq -n \
    --arg agentId "$COLONY_AGENT_ID" \
    --arg roomId "$COLONY_ROOM_ID" \
    --arg prompt "$PROMPT" \
    --arg mode "$MODE" \
    --argjson delayMs "$DELAY_MS" \
    --argjson repeatIntervalMs "${REPEAT_INTERVAL_MS:-null}" \
    --argjson maxExecutions "${MAX_EXECUTIONS:-null}" \
    '{
        agentId: $agentId,
        roomId: $roomId,
        prompt: $prompt,
        mode: $mode,
        delayMs: $delayMs,
        repeatIntervalMs: $repeatIntervalMs,
        maxExecutions: $maxExecutions
    }')

# Send request to Colony API
RESPONSE=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "${COLONY_API}/api/scheduler/tasks")

# Check for errors
if echo "$RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
    echo "$RESPONSE" >&2
    exit 1
fi

# Output response
echo "$RESPONSE"
