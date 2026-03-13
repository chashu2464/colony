#!/bin/bash
# ── Colony: dev-workflow Skill Integration Test ───────────
# This script executes the test cases defined in docs/test_cases.md.

echo "=== Starting dev-workflow Integration Test ==="

# Setup environment
export COLONY_ROOM_ID="test-room-$(date +%s)"
export COLONY_AGENT_ID="qa-lead"
HANDLER="./skills/dev-workflow/scripts/handler.sh"

# Ensure handler is executable
chmod +x "$HANDLER"

# 🧪 TC-01: Initialization
echo "🧪 [TC-01] Testing 'init' action..."
INIT_RESULT=$(echo '{"action": "init", "task_name": "QA Test Task"}' | bash "$HANDLER")
if echo "$INIT_RESULT" | grep -q "QA Test Task"; then
    echo "✅ PASS: Workflow initialized."
else
    echo "❌ FAIL: Workflow initialization failed."
    echo "$INIT_RESULT"
    exit 1
fi

# 🧪 TC-02: Next Stage (Stage 0 -> 1)
echo "🧪 [TC-02] Testing 'next' (0 -> 1)..."
NEXT_RESULT=$(echo '{"action": "next", "notes": "Initial Requirements"}' | bash "$HANDLER")
if echo "$NEXT_RESULT" | grep -q '"current_stage": 1'; then
    echo "✅ PASS: Moved to Stage 1."
else
    echo "❌ FAIL: Failed to move to Stage 1."
    echo "$NEXT_RESULT"
    exit 1
fi

# 🧪 TC-03: Evidence Validation (Negative Test)
echo "🧪 [TC-03] Testing 'next' without mandatory evidence (1 -> 2)..."
FAIL_RESULT=$(echo '{"action": "next", "notes": "Should fail"}' | bash "$HANDLER")
if echo "$FAIL_RESULT" | grep -q "error.*Evidence"; then
    echo "✅ PASS: Correctly blocked move without evidence."
else
    echo "❌ FAIL: Allowed move without evidence or returned wrong error."
    echo "$FAIL_RESULT"
    exit 1
fi

# 🧪 TC-04: Evidence Validation (Positive Test)
echo "🧪 [TC-04] Testing 'next' with valid evidence (1 -> 2)..."
# Create a dummy evidence file
touch test_evidence.md
OK_RESULT=$(echo '{"action": "next", "notes": "Design Doc", "evidence": "test_evidence.md"}' | bash "$HANDLER")
if echo "$OK_RESULT" | grep -q '"current_stage": 2'; then
    echo "✅ PASS: Moved to Stage 2 with evidence."
else
    echo "❌ FAIL: Failed to move to Stage 2 with evidence."
    echo "$OK_RESULT"
    exit 1
fi

# 🧪 TC-05: Rollback (Backtrack Action)
echo "🧪 [TC-05] Testing 'backtrack' (2 -> 1)..."
BACK_RESULT=$(echo '{"action": "backtrack", "target_stage": 1, "reason": "Redo requirements"}' | bash "$HANDLER")
if echo "$BACK_RESULT" | grep -q '"current_stage": 1'; then
    echo "✅ PASS: Backtracked to Stage 1."
else
    echo "❌ FAIL: Backtrack failed."
    echo "$BACK_RESULT"
    exit 1
fi

# Cleanup
rm test_evidence.md
# Note: Branch cleanup is handled by Git if needed, but we keep the branch for history in this test.

echo "=== dev-workflow Integration Test Completed successfully ==="
