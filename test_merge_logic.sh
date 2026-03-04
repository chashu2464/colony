#!/bin/bash
set -e

# Setup temporary test directory
TEST_DIR=$(mktemp -d)
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

export COLONY_ROOM_ID="merge-test"
export COLONY_AGENT_ID="boss"

run_action() {
  echo "$1" | bash "$HANDLER"
}

# Init
run_action '{"action": "init", "task_name": "Merge Test", "assignments": {"tech_lead": "boss"}}' > /dev/null

touch evidence.txt

# Fast forward to Stage 7
# Stage 0 -> 1
run_action '{"action": "next", "evidence": "evidence.txt"}' > /dev/null
# Stage 1 -> 2
run_action '{"action": "next", "evidence": "evidence.txt"}' > /dev/null
# Approve Stage 2
run_action '{"action": "submit-review", "status": "approved"}' > /dev/null
# Stage 2 -> 3
run_action '{"action": "next", "evidence": "evidence.txt"}' > /dev/null
# Approve Stage 3
run_action '{"action": "submit-review", "status": "approved"}' > /dev/null
# Stage 3 -> 4
run_action '{"action": "next", "evidence": "evidence.txt"}' > /dev/null
# Approve Stage 4
run_action '{"action": "submit-review", "status": "approved"}' > /dev/null
# Stage 4 -> 5
run_action '{"action": "next", "evidence": "evidence.txt"}' > /dev/null
# Approve Stage 5
run_action '{"action": "submit-review", "status": "approved"}' > /dev/null
# Stage 5 -> 6
run_action '{"action": "next", "evidence": "evidence.txt"}' > /dev/null
# Stage 6 -> 7
run_action '{"action": "next", "evidence": "evidence.txt"}' > /dev/null

echo "Current Stage: $(run_action '{"action": "status"}' | jq -r .current_stage)"
echo "Current Branch: $(git branch --show-current)"

# Approve Stage 7
run_action '{"action": "submit-review", "status": "approved"}' > /dev/null

echo "--- Moving to Stage 8 ---"
run_action '{"action": "next", "evidence": "evidence.txt"}' > /dev/null

echo "Current Stage: $(run_action '{"action": "status"}' | jq -r .current_stage)"
echo "Current Branch: $(git branch --show-current)"

# Approve Stage 8 (Go-Live Review)
run_action '{"action": "submit-review", "status": "approved"}' > /dev/null

echo "--- Attempting to complete Stage 8 (Go to Stage 9) ---"
run_action '{"action": "next", "evidence": "evidence.txt"}'

echo "Current Stage: $(run_action '{"action": "status"}' | jq -r .current_stage)"
echo "Current Status: $(run_action '{"action": "status"}' | jq -r .status)"
echo "Current Branch: $(git branch --show-current)"

echo "--- Attempting to go further than Stage 9 ---"
run_action '{"action": "next", "evidence": "evidence.txt"}'

echo "--- Attempting to rollback from completed ---"
run_action '{"action": "prev", "reason": "Should fail"}'

# Cleanup
rm -rf "$TEST_DIR"
