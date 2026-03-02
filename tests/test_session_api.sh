#!/bin/bash
# Test script for Session Management API endpoints (Phase 3)
# To run this script, ensure the Colony server is running on http://localhost:3001
# Usage: ./tests/test_session_api.sh

set -e

API_URL="http://localhost:3001/api/sessions"
# Mock a room and agent ID for testing
ROOM_ID="test-room-123"
AGENT_ID="developer"

echo "=== Session Management API Tests ==="

echo "1. Testing List Sessions Endpoint..."
LIST_RESPONSE=$(curl -s "$API_URL/$ROOM_ID/agents/$AGENT_ID/history")
if echo "$LIST_RESPONSE" | grep -q "\"agentId\":\"$AGENT_ID\""; then
    echo "✅ List Sessions: Passed"
else
    echo "❌ List Sessions: Failed"
    echo "Response: $LIST_RESPONSE"
    exit 1
fi

echo "2. Testing Search Endpoint..."
SEARCH_RESPONSE=$(curl -s "$API_URL/$ROOM_ID/agents/$AGENT_ID/history/search?q=test")
if echo "$SEARCH_RESPONSE" | grep -q "\"query\":\"test\""; then
    echo "✅ Search Sessions: Passed"
else
    echo "❌ Search Sessions: Failed"
    echo "Response: $SEARCH_RESPONSE"
    exit 1
fi

# Try to get the first session ID from the list response to test read
# Uses jq if available, otherwise simple grep/awk fallback
if command -v jq &> /dev/null; then
    SESSION_ID=$(echo "$LIST_RESPONSE" | jq -r '.sessions[0]?.id // empty')
else
    SESSION_ID=$(echo "$LIST_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
fi

if [ -n "$SESSION_ID" ]; then
    echo "3. Testing Read Transcript Endpoint for Session $SESSION_ID..."
    READ_RESPONSE=$(curl -s "$API_URL/$ROOM_ID/agents/$AGENT_ID/history/$SESSION_ID?page=0")
    if echo "$READ_RESPONSE" | grep -q "\"sessionId\":\"$SESSION_ID\""; then
        echo "✅ Read Transcript: Passed"
    else
        echo "❌ Read Transcript: Failed"
        echo "Response: $READ_RESPONSE"
        exit 1
    fi
else
    echo "⏭️ Read Transcript: Skipped (No sessions found in list response)"
fi

echo "All tests passed successfully!"
