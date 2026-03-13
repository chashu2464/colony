# QA Gates: Development Workflow Quality Standards

This document formalizes the quality gates and evidence requirements for the 8-stage development workflow.

## Overview
Every stage transition (except Stage 0) requires mandatory evidence in the form of a file path. Critical stages also require explicit reviewer sign-off.

---

## Gate 1: Initial Requirements (Stage 1)
- **Responsible**: Architect
- **Artifact**: `docs/IR.md`
- **Criteria**:
    - Must define core features and user stories.
    - Must include a "Definition of Done".
- **Sign-off**: Tech Lead review required.

## Gate 2: System/Architectural Design (Stage 2)
- **Responsible**: Architect
- **Artifact**: `docs/AR.md` or `docs/DESIGN.md`
- **Criteria**:
    - Must describe the technical architecture.
    - Must list impacted files and new components.
    - Must include a data model if applicable.
- **Sign-off**: Tech Lead review required.

## Gate 3: Forward Briefing (Stage 3)
- **Responsible**: Developer
- **Artifact**: `docs/TECH_PLAN.md`
- **Criteria**:
    - Developer explains implementation plan to QA Lead.
    - QA Lead must understand risk areas.
- **Sign-off**: QA Lead approval required.

## Gate 4: Reverse Briefing (Stage 4)
- **Responsible**: QA Lead
- **Artifact**: `docs/TEST_OUTLINE.md`
- **Criteria**:
    - QA Lead recaps the requirements and design to the Developer.
    - Ensures test coverage alignment.
- **Sign-off**: Developer approval required.

## Gate 5: Test Case Design (Stage 5)
- **Responsible**: QA Lead
- **Artifact**: `docs/TEST_CASES.md`
- **Criteria**:
    - Must use Given-When-Then format.
    - Must cover positive, negative, and edge cases.
- **Sign-off**: Tech Lead (Architect) approval required.

## Gate 6: Development Implementation (Stage 6)
- **Responsible**: Developer
- **Artifact**: Source Code (linked via git commit)
- **Criteria**:
    - Implementation must match `TECH_PLAN.md`.
    - Code must pass local linting and type checks.
- **Sign-off**: No explicit workflow sign-off, but `next` requires code evidence.

## Gate 7: Integration Testing (Stage 7)
- **Responsible**: QA Lead
- **Artifact**: `docs/TEST_REPORT.md`
- **Criteria**:
    - Must list results for all cases in `TEST_CASES.md`.
    - Must include logs or screenshots for failures.
    - Must have a final "PASS" or "FAIL" status.
- **Sign-off**: Developer or Tech Lead approval required.

## Gate 8: Go-Live Review (Stage 8)
- **Responsible**: Tech Lead
- **Artifact**: Release Tag / Final Delivery
- **Criteria**:
    - Final confirmation from all roles.
    - Verification of documentation completeness.
- **Sign-off**: All roles (Architect, Tech Lead, Developer, QA Lead) must concur.

---

## Enforcement Logic
The `dev-workflow` skill enforces these gates:
1. **Evidence Check**: `handler.sh` fails `next` if the `evidence` file path does not exist.
2. **Review Check**: `handler.sh` fails `next` if a required `submit-review` (approved) is missing for the current stage.
3. **Sequence Check**: Implementation (Stage 6) cannot begin until Test Case Design (Stage 5) is completed.
