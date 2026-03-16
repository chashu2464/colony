#!/bin/bash

# scripts/check-quality-gates.sh - Verify TDD quality gates

# Configuration
UNIT_THRESHOLD=90
INT_THRESHOLD=80
MUTATION_THRESHOLD_PRE_JUNE=70
MUTATION_THRESHOLD_POST_JUNE=80
TIME_GATE="2026-06-11"

REPORT_FILE="docs/QUALITY_REPORT.md"
TDD_LOG="docs/TDD_LOG.md"

# 0. Physical Path Integrity Check [P1-QA-002]
CURRENT_PWD=$(pwd)
if [[ "$CURRENT_PWD" == *"/.worktrees/"* ]]; then
    # We are in a worktree path, we MUST have a valid matching TASK_ID
    if [ -z "$TASK_ID" ] || [[ "$TASK_ID" == "N/A" ]]; then
        echo "ERROR: Quality Gate execution within .worktrees/ requires a valid TASK_ID context."
        exit 1
    fi
    EXPECTED_SUBPATH=".worktrees/task-$TASK_ID"
    if [[ "$CURRENT_PWD" != *"$EXPECTED_SUBPATH"* ]]; then
        echo "ERROR: Quality Gate must be executed within the CORRECT worktree sandbox ($EXPECTED_SUBPATH)."
        echo "Current Path: $CURRENT_PWD"
        exit 1
    fi
else
    # We are NOT in a worktree. 
    # Per project policy (Stage 7/8 isolation), execution must happen in a sandbox.
    echo "ERROR: Quality Gate must be executed within a worktree sandbox per project isolation policy."
    echo "Host execution is blocked to prevent environment pollution."
    exit 1
fi

# Emergency Skip check
if [ "$SKIP_QUALITY_GATES" = "true" ]; then
    echo "WARNING: SKIP_QUALITY_GATES is set to true. Bypassing gates."
    # Log skip to report
    CONTENT="# Quality Report (Emergency Skip)
- **Status**: SKIPPED
- **Timestamp**: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
- **Skipped By**: $COLONY_AGENT_ID
- **Reason**: SKIP_QUALITY_GATES=true
- **Task ID**: $TASK_ID
- **Commit**: $(git rev-parse HEAD 2>/dev/null || echo "N/A")"
    
    SIGNATURE=$(echo -n "$CONTENT" | shasum -a 256 | cut -d' ' -f1)
    echo "$CONTENT" > "$REPORT_FILE"
    echo -e "\n<!-- SIGNATURE: $SIGNATURE -->" >> "$REPORT_FILE"
    exit 0
fi

echo "Running Quality Gates Check..."

# 1. Determine Effective Mutation Threshold
CURRENT_DATE=$(date +%Y-%m-%d)
EFFECTIVE_MUTATION_THRESHOLD=$MUTATION_THRESHOLD_PRE_JUNE
if [[ "$CURRENT_DATE" > "$TIME_GATE" || "$CURRENT_DATE" == "$TIME_GATE" ]]; then
    EFFECTIVE_MUTATION_THRESHOLD=$MUTATION_THRESHOLD_POST_JUNE
fi

# 2. Check TDD Log (Pre-verify)
if [ ! -f "$TDD_LOG" ]; then
    echo "Error: TDD log ($TDD_LOG) is missing. TDD evidence is required."
    exit 1
fi

# 3. Unit Test Coverage
echo "Checking Unit Test Coverage..."
rm -rf coverage/unit
# We use --coverage.reportsDirectory to avoid overwriting
npm run test:unit -- --coverage.reportsDirectory=coverage/unit > /dev/null 2>&1

if [ ! -f "coverage/unit/coverage-summary.json" ]; then
    echo "FAILED: Unit coverage report not generated."
    exit 1
fi

UNIT_COV=$(jq -r '.total.statements.pct' coverage/unit/coverage-summary.json)
if [ "$UNIT_COV" == "null" ] || [ -z "$UNIT_COV" ]; then UNIT_COV=0; fi

if (( $(echo "$UNIT_COV < $UNIT_THRESHOLD" | bc -l) )); then
    echo "FAILED: Unit coverage ($UNIT_COV%) is below threshold ($UNIT_THRESHOLD%)"
    exit 1
fi
echo "Unit Coverage: $UNIT_COV% [OK]"

# 4. Integration Test Coverage
echo "Checking Integration Test Coverage..."
rm -rf coverage/int
# Explicitly run integration tests and ensure summary is generated
npm run test:int -- --coverage.reportsDirectory=coverage/int > /dev/null 2>&1

if [ ! -f "coverage/int/coverage-summary.json" ]; then
    echo "FAILED: Integration coverage report (coverage/int/coverage-summary.json) not generated."
    # List directory to help diagnose
    ls -R coverage/int 2>/dev/null
    exit 1
fi

INT_COV=$(jq -r '.total.statements.pct' coverage/int/coverage-summary.json)
if [ "$INT_COV" == "null" ] || [ -z "$INT_COV" ]; then INT_COV=0; fi

# QA reported INT_COV was hardcoded to 85. We ensure it's from jq.
echo "Debug: Extracted Integration Coverage: $INT_COV%"

if (( $(echo "$INT_COV < $INT_THRESHOLD" | bc -l) )); then
    echo "FAILED: Integration coverage ($INT_COV%) is below threshold ($INT_THRESHOLD%)"
    exit 1
fi
echo "Integration Coverage: $INT_COV% [OK]"

# 5. Mutation Score
echo "Checking Mutation Score..."
# If reports/mutation/mutation.json exists but is old, we might want to rerun.
# For simplicity, we rerun if it's missing.
if [ ! -f "reports/mutation/mutation.json" ]; then
    echo "Running mutation tests (this may take a while)..."
    npm run test:mutation > /dev/null 2>&1
fi

if [ ! -f "reports/mutation/mutation.json" ]; then
    echo "FAILED: Mutation report (reports/mutation/mutation.json) not generated."
    exit 1
fi

# Correct extraction of mutation score for Stryker JSON report
MUTATION_STATS=$(jq '{files: (.files | keys | length), killed: ([.files[].mutants[] | select(.status=="Killed")] | length), timeout: ([.files[].mutants[] | select(.status=="Timeout")] | length), total: ([.files[].mutants[] | select(.status=="Killed" or .status=="Survived" or .status=="Timeout" or .status=="NoCoverage")] | length)}' reports/mutation/mutation.json)
KILLED=$(echo "$MUTATION_STATS" | jq -r '.killed')
TIMEOUT=$(echo "$MUTATION_STATS" | jq -r '.timeout')
TOTAL=$(echo "$MUTATION_STATS" | jq -r '.total')
FILES_COUNT=$(echo "$MUTATION_STATS" | jq -r '.files')

if [ "$TOTAL" -gt 0 ]; then
    # Calculate score with 2 decimal places
    MUTATION_SCORE=$(echo "scale=2; ($KILLED + $TIMEOUT) / $TOTAL * 100" | bc -l)
else
    MUTATION_SCORE=0
fi

echo "Debug: Mutation Score: $MUTATION_SCORE% (Files: $FILES_COUNT)"

if (( $(echo "$MUTATION_SCORE < $EFFECTIVE_MUTATION_THRESHOLD" | bc -l) )); then
    echo "FAILED: Mutation score ($MUTATION_SCORE%) is below threshold ($EFFECTIVE_MUTATION_THRESHOLD%)"
    exit 1
fi
echo "Mutation Score: $MUTATION_SCORE% [OK]"

# 6. Generate Report with Signature
echo "Generating Signed Quality Report..."
# Ensure TASK_ID and BRANCH are correctly identified
BRANCH=$(git branch --show-current 2>/dev/null)
COMMIT=$(git rev-parse HEAD 2>/dev/null)
TASK_ID_VAL=${TASK_ID:-"N/A"}

CONTENT="# Quality Report
- **Status**: PASS
- **Timestamp**: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
- **Unit Coverage**: $UNIT_COV% (Threshold: $UNIT_THRESHOLD%)
- **Integration Coverage**: $INT_COV% (Threshold: $INT_THRESHOLD%)
- **Mutation Score**: $MUTATION_SCORE% (Threshold: $EFFECTIVE_MUTATION_THRESHOLD%)
- **Mutation Files Count**: $FILES_COUNT
- **Task ID**: $TASK_ID_VAL
- **Branch**: $BRANCH
- **Commit**: $COMMIT
- **Workspace Path**: $CURRENT_PWD"

SIGNATURE=$(echo -n "$CONTENT" | shasum -a 256 | cut -d' ' -f1)

echo "$CONTENT" > "$REPORT_FILE"
echo -e "\n<!-- SIGNATURE: $SIGNATURE -->" >> "$REPORT_FILE"

echo "All Quality Gates PASSED. Report signed."
exit 0
