#!/bin/bash
# Phase 6 Verification Script

ROOM_ID="phase6-test-room"
export COLONY_ROOM_ID=$ROOM_ID
export COLONY_AGENT_ID="qa-lead"
export PORT=3001
HANDLER="bash skills/dev-workflow/scripts/handler.sh"
WORKFLOW_FILE=".data/workflows/$ROOM_ID.json"

rm -f "$WORKFLOW_FILE"

echo "Running TC-1: Malformed JSON..."
OUT=$(echo '{"action": "status", ' | $HANDLER 2>&1)
if echo "$OUT" | grep -q "Invalid JSON input"; then
  echo "PASS: TC-1"
else
  echo "FAIL: TC-1. Output: $OUT"
fi

echo "Running TC-4: Evidence Validation - Missing File..."
# Init first
echo '{"action": "init", "task_name": "Test TC4", "assignments": {"developer": "dev"}}' | $HANDLER > /dev/null
OUT=$(echo '{"action": "next", "notes": "Test", "evidence": "missing.txt"}' | $HANDLER 2>&1)
if echo "$OUT" | grep -q "Evidence path not found"; then
  echo "PASS: TC-4"
else
  echo "FAIL: TC-4. Output: $OUT"
fi

echo "Running TC-2: Action 'prev'..."
# Advance to Stage 1 (needs real evidence)
touch evidence.txt
echo '{"action": "next", "notes": "Move to 1", "evidence": "evidence.txt"}' | $HANDLER > /dev/null
# Check stage is 1
STAGE=$(jq -r '.current_stage' "$WORKFLOW_FILE")
if [ "$STAGE" -eq 1 ]; then
  echo "At Stage 1. Running prev..."
  echo '{"action": "prev", "reason": "test rollback"}' | $HANDLER > /dev/null
  STAGE=$(jq -r '.current_stage' "$WORKFLOW_FILE")
  if [ "$STAGE" -eq 0 ]; then
    echo "PASS: TC-2"
  else
    echo "FAIL: TC-2. Stage is $STAGE, expected 0"
  fi
else
  echo "FAIL: Could not advance to Stage 1. Stage is $STAGE"
fi

echo "Running TC-5 & TC-6: Stage 8 Guardrails..."
# Reset workflow for Stage 8 test
rm -f "$WORKFLOW_FILE"
echo '{"action": "init", "task_name": "Test Stage 8", "assignments": {"tech_lead": "tl_agent", "developer": "dev_agent"}}' | $HANDLER > /dev/null
# Manually jump to Stage 8 to save time
jq '.current_stage = 8 | .stage_name = "8. Go-Live Review"' "$WORKFLOW_FILE" > "${WORKFLOW_FILE}.tmp" && mv "${WORKFLOW_FILE}.tmp" "$WORKFLOW_FILE"

echo "Attempting completion without TL approval..."
touch evidence.txt
OUT=$(echo '{"action": "next", "notes": "Completing", "evidence": "evidence.txt"}' | $HANDLER 2>&1)
if echo "$OUT" | grep -q "requires an approved review from the assigned tech_lead"; then
  echo "PASS: TC-5"
else
  echo "FAIL: TC-5. Output: $OUT"
fi

echo "Submitting approval from TL..."
echo '{"action": "submit-review", "status": "approved", "comments": "LGTM"}' | COLONY_AGENT_ID="tl_agent" $HANDLER > /dev/null
echo "Attempting completion WITH TL approval..."
OUT=$(echo '{"action": "next", "notes": "Completing", "evidence": "evidence.txt"}' | $HANDLER 2>&1)
if echo "$OUT" | grep -q "\"status\": \"completed\""; then
  echo "PASS: TC-6"
else
  echo "FAIL: TC-6. Output: $OUT"
fi

# Cleanup
rm -f "$WORKFLOW_FILE"
rm -f evidence.txt
echo "Verification complete."
