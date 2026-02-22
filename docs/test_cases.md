# Test Cases: Phase 6 Workflow Skill

## Overview
Test cases to validate the enhanced `dev-workflow` skill, covering evidence validation, rollback, and role management.

## Tests

### TC-01: Evidence Validation (Negative Test)
- **Pre-condition**: Workflow at Stage > 0.
- **Action**: Run `dev-workflow next` without `evidence`.
- **Expected Result**: Error "Evidence (file path) is mandatory...". Stage remains unchanged.

### TC-02: Evidence Validation (Positive Test)
- **Pre-condition**: Workflow at Stage > 0.
- **Action**: Run `dev-workflow next` with valid `evidence`.
- **Expected Result**: Success. Stage increments.

### TC-03: Rollback (Prev Action)
- **Pre-condition**: Workflow at Stage X (e.g., 5).
- **Action**: Run `dev-workflow prev`.
- **Expected Result**: Workflow moves to Stage X-1. History logs "prev" action.

### TC-04: Role Updates
- **Action**: Run `dev-workflow update` with new roles.
- **Expected Result**: JSON file reflects updated roles without changing stage.

### TC-05: Full Lifecycle
- **Action**: Run `init` -> `next` (x8) -> `status`.
- **Expected Result**: Workflow reaches Stage 8 "Go-Live Review".
