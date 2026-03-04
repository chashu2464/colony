#!/bin/bash
set -e

# Setup temporary test directory
TEST_DIR=$(mktemp -d)
echo "Testing in $TEST_DIR"
cd "$TEST_DIR"

# Initialize a dummy git repo
git init -q
git config user.email "test@example.com"
git config user.name "Test User"
touch README.md
git add README.md
git commit -m "initial commit" -q

# Path to the handler script
HANDLER="/Users/casu/Documents/Colony/skills/dev-workflow/scripts/handler.sh"

export COLONY_ROOM_ID="dry-run-$(date +%s)"
export COLONY_AGENT_ID="tester"

# Helper function to run action
run_action() {
  echo "$1" | bash "$HANDLER"
}

echo "--- Stage 0: Init ---"
run_action '{"action": "init", "task_name": "Dry Run Task", "description": "Testing workflow", "assignments": {"architect": "tester", "tech_lead": "boss", "qa_lead": "qa", "developer": "dev"}}'

# Create a dummy evidence file
touch evidence.txt

echo "--- Stage 1: Next (to IR) ---"
run_action '{"action": "next", "notes": "Drafting requirements", "evidence": "evidence.txt"}'

echo "--- Stage 2: Next (to Design) ---"
run_action '{"action": "next", "notes": "System design", "evidence": "evidence.txt"}'

echo "--- Stage 3: Next (Should fail - Stage 2 needs approval) ---"
run_action '{"action": "next", "notes": "Forward briefing", "evidence": "evidence.txt"}' || echo "Caught expected error"

echo "--- Stage 2: Approve ---"
run_action '{"action": "submit-review", "status": "approved", "comments": "Design looks good"}'

echo "--- Stage 3: Next (to Forward Briefing) ---"
run_action '{"action": "next", "notes": "Explaining to QA", "evidence": "evidence.txt"}'

echo "--- Stage 4: Next (Should fail - Stage 3 needs approval) ---"
run_action '{"action": "next", "notes": "Reverse briefing", "evidence": "evidence.txt"}' || echo "Caught expected error"

echo "--- Stage 3: Approve ---"
run_action '{"action": "submit-review", "status": "approved", "comments": "QA understands"}'

echo "--- Stage 4: Next (to Reverse Briefing) ---"
run_action '{"action": "next", "notes": "QA explaining back", "evidence": "evidence.txt"}'

echo "--- Stage 4: Approve ---"
run_action '{"action": "submit-review", "status": "approved", "comments": "Dev confirms QA understands"}'

echo "--- Stage 5: Next (to Test Case Design) ---"
run_action '{"action": "next", "notes": "Writing test cases", "evidence": "evidence.txt"}'

echo "--- Stage 5: Approve ---"
run_action '{"action": "submit-review", "status": "approved", "comments": "Test cases covered"}'

echo "--- Stage 6: Next (to Implementation) ---"
run_action '{"action": "next", "notes": "Starting coding", "evidence": "evidence.txt"}'

echo "--- Stage 7: Next (to Integration Testing) ---"
run_action '{"action": "next", "notes": "Testing integration", "evidence": "evidence.txt"}'

echo "--- Stage 7: Approve ---"
run_action '{"action": "submit-review", "status": "approved", "comments": "Tests passed"}'

echo "--- Stage 8: Next (to Go-Live Review) ---"
run_action '{"action": "next", "notes": "Final review", "evidence": "evidence.txt"}'

echo "--- Stage 8: Approve (Should fail if NOT tech_lead) ---"
# COLONY_AGENT_ID is 'tester', but tech_lead is 'boss'
run_action '{"action": "submit-review", "status": "approved", "comments": "Final check by non-TL"}'
# Try to finish
echo "--- Finish (Should fail - no TL approval) ---"
run_action '{"action": "next", "notes": "Completing task", "evidence": "evidence.txt"}' || echo "Caught expected error"

echo "--- Stage 8: Approve (As tech_lead) ---"
export COLONY_AGENT_ID="boss"
run_action '{"action": "submit-review", "status": "approved", "comments": "Final check by TL"}'

echo "--- Finish (Success) ---"
run_action '{"action": "next", "notes": "Completing task", "evidence": "evidence.txt"}'

echo "--- Status ---"
run_action '{"action": "status"}'

# Cleanup
rm -rf "$TEST_DIR"
