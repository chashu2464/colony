# dev-workflow v2: QA Acceptance Criteria

## Stage 3: Forward Briefing (Developer -> QA Lead)

**Goal**: Ensure the QA Lead fully understands the technical implementation, logic paths, and potential risk areas.

**Acceptance Criteria**:
1. **Technical Plan (`docs/TECH_PLAN.md`)**:
   - Must be provided by the Developer.
   - Must describe core logic changes and function signature updates.
   - Must list impacted files and dependencies.
2. **Interactive Review**:
   - QA Lead must record at least 2 questions/risks regarding error handling or edge cases in the workflow `notes`.
3. **Evidence**:
   - `docs/TECH_PLAN.md` must exist and be linked.

## Stage 4: Reverse Briefing (QA Lead -> Developer)

**Goal**: Confirm the QA Lead's test strategy covers all critical logic identified by the Developer.

**Acceptance Criteria**:
1. **Test Outline (`docs/TEST_OUTLINE.md`)**:
   - Must be provided by the QA Lead.
   - Must list all core test scenarios, including boundary and negative cases.
2. **Dual Sign-off**:
   - Developer must reply with "LGTM" or "Coverage complete" in the chat.
   - QA Lead must submit an `approved` review for Stage 4.
3. **Evidence**:
   - `docs/TEST_OUTLINE.md` must exist and be linked.

## Stage 5: Test Case Design (QA Lead)

**Goal**: Produce detailed, executable test cases.

**Acceptance Criteria**:
1. **Detailed Test Cases (`docs/TEST_CASES.md`)**:
   - Must use **Given-When-Then** format.
   - Must cover normal, exceptional, and boundary conditions.
2. **Review**:
   - Must be `approved` by Tech Lead (Architect).
3. **Evidence**:
   - `docs/TEST_CASES.md` must exist.

## Stage 7: Integration Testing (QA Lead)

**Goal**: Verify the implementation against the test cases.

**Acceptance Criteria**:
1. **Test Report (`docs/TEST_REPORT.md`)**:
   - Must list all test results (Pass/Fail).
   - Must include reproduction steps for any discovered bugs.
   - Must state a clear "Go/No-Go" conclusion.
2. **Evidence**:
   - `docs/TEST_REPORT.md` must exist.
