#!/bin/bash
# Test script for send-message handler.sh response parsing fix
# Verifies that handler.sh correctly handles various response scenarios
# without false-negative failures (which previously caused duplicate messages)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
HANDLER="$PROJECT_DIR/skills/send-message/scripts/handler.sh"

PASS=0
FAIL=0

pass() { echo "  ✅ PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== Testing send-message handler.sh ==="
echo ""

# ─── Test 1: handler.sh syntax check ────────────────────────
echo "Test 1: Shell syntax check"
if bash -n "$HANDLER" 2>/dev/null; then
    pass "handler.sh has valid bash syntax"
else
    fail "handler.sh has syntax errors"
fi

# ─── Test 2: handler.sh uses curl -o (not echo | tail) ──────
echo "Test 2: Uses curl -o pattern (no echo | tail)"
if grep -q 'curl.*-o.*TMPFILE' "$HANDLER" 2>/dev/null; then
    if ! grep -q 'echo.*RESPONSE.*tail' "$HANDLER" 2>/dev/null; then
        pass "Uses curl -o tmpfile pattern instead of echo | tail"
    else
        fail "Still has old echo | tail pattern alongside new code"
    fi
else
    fail "Does not use curl -o tmpfile pattern"
fi

# ─── Test 3: handler.sh has trap for temp file cleanup ──────
echo "Test 3: Temp file cleanup trap exists"
if grep -q "trap.*rm.*TMPFILE" "$HANDLER" 2>/dev/null; then
    pass "Has trap for temp file cleanup"
else
    fail "Missing trap for temp file cleanup"
fi

# ─── Test 4: handler.sh validates HTTP_CODE is numeric ──────
echo "Test 4: HTTP_CODE numeric validation"
if grep -q 'HTTP_CODE.*[0-9]' "$HANDLER" 2>/dev/null; then
    pass "Has numeric validation for HTTP_CODE"
else
    fail "Missing numeric validation for HTTP_CODE"
fi

# ─── Test 5: handler.sh uses printf instead of echo for response body ──
echo "Test 5: Uses printf for response output (avoids -n/-e interpretation)"
if grep -q "printf.*BODY_RESPONSE" "$HANDLER" 2>/dev/null; then
    pass "Uses printf for response output"
else
    fail "Still uses echo for response output"
fi

# ─── Test 6: curl failure doesn't kill script (|| true) ─────
echo "Test 6: curl failure is non-fatal"
if grep -q '||.*true' "$HANDLER" 2>/dev/null; then
    pass "curl has || true fallback"
else
    fail "curl can kill script on network error"
fi

# ─── Test 7: Fallback check for message.id in body ──────────
echo "Test 7: Has fallback check for message.id in response body"
if grep -q 'message\.id' "$HANDLER" 2>/dev/null; then
    pass "Has fallback check for message.id"
else
    fail "Missing fallback check for message.id"
fi

# ─── Test 8: Invalid JSON is rejected before curl ───────────
echo "Test 8: Invalid JSON rejected before API call"
export COLONY_API="http://localhost:3001"
export COLONY_AGENT_ID="test-agent"
export COLONY_ROOM_ID="test-room-id"

OUTPUT=$(echo 'not valid json' | bash "$HANDLER" 2>&1) && EXIT_CODE=$? || EXIT_CODE=$?
if [ "$EXIT_CODE" -ne 0 ]; then
    pass "Invalid JSON rejected with exit code $EXIT_CODE"
else
    fail "Invalid JSON was not rejected"
fi

# ─── Test 9: Empty content is rejected before curl ──────────
echo "Test 9: Empty content rejected before API call"
OUTPUT=$(echo '{"content": ""}' | bash "$HANDLER" 2>&1) && EXIT_CODE=$? || EXIT_CODE=$?
if [ "$EXIT_CODE" -ne 0 ]; then
    pass "Empty content rejected with exit code $EXIT_CODE"
else
    fail "Empty content was not rejected"
fi

# ─── Test 10: Mentions array type is rejected ────────────────
echo "Test 10: Array mentions type rejected"
OUTPUT=$(echo '{"content": "test", "mentions": ["agent1"]}' | bash "$HANDLER" 2>&1) && EXIT_CODE=$? || EXIT_CODE=$?
if [ "$EXIT_CODE" -ne 0 ]; then
    pass "Array mentions rejected with exit code $EXIT_CODE"
else
    fail "Array mentions was not rejected"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
