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

export COLONY_ROOM_ID="prev-test"
export COLONY_AGENT_ID="tester"

run_action() {
  echo "$1" | bash "$HANDLER"
}

# Init
run_action '{"action": "init", "task_name": "Prev Test"}' > /dev/null

touch evidence.txt

# Move to Stage 1
run_action '{"action": "next", "evidence": "evidence.txt"}' > /dev/null
# Move to Stage 2
run_action '{"action": "next", "evidence": "evidence.txt"}' > /dev/null

echo "Current Stage: $(run_action '{"action": "status"}' | jq -r .current_stage)"

# Test Prev
echo "--- Rollback to Stage 1 ---"
run_action '{"action": "prev", "reason": "Testing rollback"}'

echo "Current Stage: $(run_action '{"action": "status"}' | jq -r .current_stage)"
echo "Warning: $(run_action '{"action": "status"}' | jq -r .warning)"

# Cleanup
rm -rf "$TEST_DIR"
