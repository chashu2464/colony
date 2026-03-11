#!/bin/bash

# 1. Reproduce Bug QG-P0-006 (Signature bypass)
echo "Testing Bug QG-P0-006 fix (Signature bypass)..."
node scripts/generate-tdd-log.js
cp docs/TDD_LOG.md docs/TDD_LOG.md.bak

# Test trailing tamper
echo "<!-- tamper -->" >> docs/TDD_LOG.md
node scripts/generate-tdd-log.js --verify
EXIT_CODE=$?
if [ $EXIT_CODE -eq 0 ]; then
    echo "FAILED: Signature bypass still allowed for trailing tamper!"
else
    echo "SUCCESS: Trailing tamper caught (Exit code: $EXIT_CODE)."
fi

# Test inline tamper
mv docs/TDD_LOG.md.bak docs/TDD_LOG.md
cp docs/TDD_LOG.md docs/TDD_LOG.md.bak
sed -i '' 's/<!-- SIGNATURE: /<!-- tamper --><!-- SIGNATURE: /' docs/TDD_LOG.md
node scripts/generate-tdd-log.js --verify
EXIT_CODE=$?
if [ $EXIT_CODE -eq 0 ]; then
    echo "FAILED: Signature bypass still allowed for inline tamper!"
else
    echo "SUCCESS: Inline tamper caught (Exit code: $EXIT_CODE)."
fi
mv docs/TDD_LOG.md.bak docs/TDD_LOG.md

# 2. Reproduce Bug QG-P2-003 (TDD tri-state integrity)
echo -e "\nTesting Bug QG-P2-003 fix (TDD tri-state integrity)..."
# Create a dummy git log without RED
# We'll use a temporary script that mocks getGitLog
cp scripts/generate-tdd-log.js scripts/generate-tdd-log.js.bak
sed -i '' "s/execSync('git log --pretty=format:\"%B\" --grep=\"tdd:\"')/('tdd:green: implementation\\\\ntdd:refactor: cleanup')/" scripts/generate-tdd-log.js

node scripts/generate-tdd-log.js --verify
EXIT_CODE=$?
if [ $EXIT_CODE -eq 0 ]; then
    echo "FAILED: TDD cycle integrity check bypassed (RED missing)!"
else
    echo "SUCCESS: TDD cycle integrity check caught missing RED (Exit code: $EXIT_CODE)."
fi
mv scripts/generate-tdd-log.js.bak scripts/generate-tdd-log.js

# 3. Verify Bug QG-P1-004 (Audit fields)
echo -e "\nTesting Bug QG-P1-004 fix (Audit fields)..."
export SKIP_QUALITY_GATES=true
export TASK_ID=""
bash scripts/check-quality-gates.sh
echo "Skip report content (first 10 lines):"
head -n 10 docs/QUALITY_REPORT.md
grep -q "task_id: N/A" docs/QUALITY_REPORT.md && echo "SUCCESS: task_id is N/A when empty." || echo "FAILED: task_id is not N/A when empty."
grep -q "branch:" docs/QUALITY_REPORT.md && echo "SUCCESS: branch field exists." || echo "FAILED: branch field missing."
grep -q "quality_gates_skipped: true" docs/QUALITY_REPORT.md && echo "SUCCESS: quality_gates_skipped field exists." || echo "FAILED: quality_gates_skipped field missing."

unset SKIP_QUALITY_GATES
unset TASK_ID
