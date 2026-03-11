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

# Context variables
BRANCH=$(git branch --show-current 2>/dev/null)
COMMIT=$(git rev-parse HEAD 2>/dev/null)
TASK_ID_VAL=${TASK_ID:-"N/A"}

# Emergency Skip check
if [ "$SKIP_QUALITY_GATES" = "true" ]; then
    echo "WARNING: SKIP_QUALITY_GATES is set to true. Bypassing gates."
    # Log skip to report
    CONTENT="# Quality Report
- **gate_status**: SKIPPED
- **timestamp**: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
- **skipped_by**: $COLONY_AGENT_ID
- **reason**: SKIP_QUALITY_GATES=true
- **task_id**: $TASK_ID_VAL
- **branch**: $BRANCH
- **commit_hash**: $COMMIT
- **quality_gates_skipped**: true"
    
    # Calculate signature on the content itself (no trailing newline for consistency)
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
npm run test:int -- --coverage.reportsDirectory=coverage/int > /dev/null 2>&1

if [ ! -f "coverage/int/coverage-summary.json" ]; then
    echo "FAILED: Integration coverage report not generated."
    exit 1
fi

INT_COV=$(jq -r '.total.statements.pct' coverage/int/coverage-summary.json)
if [ "$INT_COV" == "null" ] || [ -z "$INT_COV" ]; then INT_COV=0; fi

echo "Debug: Extracted Integration Coverage: $INT_COV%"

if (( $(echo "$INT_COV < $INT_THRESHOLD" | bc -l) )); then
    echo "FAILED: Integration coverage ($INT_COV%) is below threshold ($INT_THRESHOLD%)"
    exit 1
fi
echo "Integration Coverage: $INT_COV% [OK]"

# 5. Mutation Score
echo "Checking Mutation Score..."
if [ ! -f "reports/mutation/mutation.json" ]; then
    echo "Running mutation tests (this may take a while)..."
    npm run test:mutation > /dev/null 2>&1
fi

if [ ! -f "reports/mutation/mutation.json" ]; then
    echo "FAILED: Mutation report not generated."
    exit 1
fi

MUTATION_STATS=$(jq '{files: (.files | keys | length), killed: ([.files[].mutants[] | select(.status=="Killed")] | length), timeout: ([.files[].mutants[] | select(.status=="Timeout")] | length), total: ([.files[].mutants[] | select(.status=="Killed" or .status=="Survived" or .status=="Timeout" or .status=="NoCoverage")] | length)}' reports/mutation/mutation.json)
KILLED=$(echo "$MUTATION_STATS" | jq -r '.killed')
TIMEOUT=$(echo "$MUTATION_STATS" | jq -r '.timeout')
TOTAL=$(echo "$MUTATION_STATS" | jq -r '.total')
FILES_COUNT=$(echo "$MUTATION_STATS" | jq -r '.files')

if [ "$TOTAL" -gt 0 ]; then
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

CONTENT="# Quality Report
- **gate_status**: PASS
- **timestamp**: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
- **unit_coverage**: $UNIT_COV%
- **integration_coverage**: $INT_COV%
- **mutation_score**: $MUTATION_SCORE%
- **mutation_files_count**: $FILES_COUNT
- **task_id**: $TASK_ID_VAL
- **branch**: $BRANCH
- **commit_hash**: $COMMIT
- **quality_gates_skipped**: false"

# Calculate signature on the content itself
SIGNATURE=$(echo -n "$CONTENT" | shasum -a 256 | cut -d' ' -f1)

echo "$CONTENT" > "$REPORT_FILE"
echo -e "\n<!-- SIGNATURE: $SIGNATURE -->" >> "$REPORT_FILE"

echo "All Quality Gates PASSED. Report signed."
exit 0
