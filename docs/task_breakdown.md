# Task Breakdown: Phase 6 Workflow Skill Upgrade

## Overview
This document breaks down the implementation of the Phase 6 `dev-workflow` skill upgrade into atomic tasks.

## Tasks

### 1. Handler Script Enhancement (1 day)
- [ ] Implement `prev` action logic in `skills/dev-workflow/scripts/handler.sh`.
- [ ] Add evidence file existence validation in `next` action.
- [ ] Integrate `tech_lead` role into JSON structure and update logic.
- [ ] Add JSON input validation using `jq` to prevent syntax errors.

### 2. Documentation Update (0.5 day)
- [ ] Update `skills/dev-workflow/SKILL.md` with new 8-stage definitions.
- [ ] Document new `prev` action and `roles` parameter in `SKILL.md`.
- [ ] Create `docs/phase6/QA_GATES.md` (formalizing the criteria).

### 3. Verification & Testing (0.5 day)
- [ ] Perform a dry run of the workflow from Stage 0 to Stage 8.
- [ ] Verify rollback (`prev`) functionality.
- [ ] Verify evidence validation (fail case).

## Dependencies
- None. All tasks are self-contained within the `skills/dev-workflow` directory.
