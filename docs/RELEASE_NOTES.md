# Release Notes: dev-workflow v2

## Overview
Upgraded the development workflow management skill to version 2, introducing robust state management, evidence tracking, and review guardrails.

## Features
- **Structured JSON State**: Centralized tracking of task metadata, assignments, artifacts, and reviews.
- **Mandatory Evidence**: Prevents stage progression without accompanying proof of work (file paths).
- **Review Guardrails**: Stages 3, 4, and 8 now require explicit approval before advancing.
- **Backtrack Support**: Allows rolling back to previous stages with reason logging.
- **Role-Based assignments**: Supports Architect, Tech Lead, QA Lead, and Developer roles.

## Artifacts
- Skill Handler: `skills/dev-workflow/scripts/handler.sh`
- Design Doc: `docs/SKILL_DESIGN.md`
- QA Criteria: `skills/dev-workflow/QA_CRITERIA.md`
- Test Report: `docs/test_report.md`
