# Phase 6: dev-workflow Skill Enhancement - Requirements Document

## 1. Overview

**Objective**: Enhance the robustness and reliability of the `dev-workflow` skill by implementing concurrency control, input validation, and comprehensive testing.

**Scope**: This phase focuses on improving the `dev-workflow` skill itself (Direction A), not the Session message isolation issue (Direction B).

**Success Criteria**:
- Multiple agents can safely interact with workflow state without conflicts
- Invalid inputs are caught early with clear error messages
- Complete integration test coverage validates the 9-stage workflow
- Documentation is updated to reflect new capabilities

## 2. Functional Requirements

### 2.1 Concurrency Control (FR-CC)

**FR-CC-01: File Locking Mechanism**
- **Description**: Implement atomic file operations using `flock` to prevent race conditions when multiple agents update workflow state simultaneously.
- **Rationale**: Current file-based state management is vulnerable to concurrent writes, which could corrupt workflow state.
- **Implementation**: Use `flock` in `handler.sh` to acquire exclusive locks before reading/modifying `.data/workflows/*.json` files.
- **Acceptance Criteria**:
  - Lock is acquired before any read-modify-write operation
  - Lock is released after operation completes (including error paths)
  - Timeout mechanism prevents indefinite blocking (max 5 seconds)
  - Clear error message if lock cannot be acquired

**FR-CC-02: Atomic State Updates**
- **Description**: Ensure workflow state transitions are atomic (all-or-nothing).
- **Rationale**: Partial updates could leave workflow in inconsistent state.
- **Implementation**: Write to temporary file, then atomically rename to target file.
- **Acceptance Criteria**:
  - State file is never left in partially-written state
  - Failed updates do not corrupt existing state
  - Git commits only occur after successful state update

### 2.2 Input Validation (FR-IV)

**FR-IV-01: JSON Schema Validation**
- **Description**: Validate all JSON inputs against a defined schema before processing.
- **Rationale**: Invalid inputs currently cause cryptic errors or silent failures.
- **Implementation**: Add JSON schema validation at the start of `handler.sh` using `jq` or a lightweight validator.
- **Acceptance Criteria**:
  - All required fields are validated
  - Type checking for all parameters (string, number, object)
  - Clear error messages indicate which field failed validation
  - Exit code 2 for validation errors (distinct from other errors)

**FR-IV-02: Evidence Path Validation**
- **Description**: Verify that evidence paths exist and are relative to repository root before accepting them.
- **Rationale**: Invalid evidence paths cause workflow advancement to fail.
- **Implementation**: Check file/directory existence before recording artifact.
- **Acceptance Criteria**:
  - Absolute paths are rejected with clear error
  - Non-existent paths are rejected with clear error
  - Symlinks are resolved and validated
  - Error message suggests correct path format

**FR-IV-03: Role Assignment Validation**
- **Description**: Validate that assigned roles match expected agent IDs.
- **Rationale**: Typos in role assignments could break workflow notifications.
- **Implementation**: Check that role values are non-empty strings.
- **Acceptance Criteria**:
  - Empty or null role assignments are rejected
  - Warning if role assignment doesn't match known agent IDs (non-blocking)

### 2.3 Error Handling (FR-EH)

**FR-EH-01: Graceful Degradation**
- **Description**: Handle missing or corrupted state files gracefully.
- **Rationale**: System should recover from unexpected states without manual intervention.
- **Implementation**: Detect corrupted JSON and provide recovery options.
- **Acceptance Criteria**:
  - Corrupted state file triggers clear error with recovery instructions
  - Backup state files are created before each modification
  - Recovery command is provided in error message

**FR-EH-02: Error Recovery Strategy**
- **Description**: Define clear recovery paths for common error scenarios.
- **Rationale**: Agents need guidance on how to recover from failures.
- **Implementation**: Document recovery procedures and implement helper commands.
- **Acceptance Criteria**:
  - Error messages include recovery suggestions
  - `status` command shows recovery options when in error state
  - Backup/restore functionality is documented

### 2.4 Integration Testing (FR-IT)

**FR-IT-01: End-to-End Workflow Tests**
- **Description**: Create automated tests that simulate complete workflow progression through all 9 stages.
- **Rationale**: Manual testing is insufficient to catch edge cases and regressions.
- **Implementation**: Write shell scripts that exercise all workflow actions.
- **Acceptance Criteria**:
  - Test covers init → stage 0 → ... → stage 9 → completion
  - Test validates state transitions, git commits, and artifacts
  - Test runs in isolated environment (no side effects on real workflows)
  - Test completes in under 30 seconds

**FR-IT-02: Concurrency Tests**
- **Description**: Test that concurrent workflow operations don't corrupt state.
- **Rationale**: Validate that file locking mechanism works correctly.
- **Implementation**: Spawn multiple processes that attempt simultaneous updates.
- **Acceptance Criteria**:
  - 10 concurrent operations complete without errors
  - Final state is consistent (no lost updates)
  - No corrupted JSON files
  - Test is repeatable and deterministic

**FR-IT-03: Error Scenario Tests**
- **Description**: Test error handling for invalid inputs and edge cases.
- **Rationale**: Ensure error paths are well-tested.
- **Implementation**: Test suite includes negative test cases.
- **Acceptance Criteria**:
  - Invalid JSON inputs are rejected with clear errors
  - Missing evidence paths are caught
  - Invalid stage transitions are prevented
  - All error codes are tested

## 3. Non-Functional Requirements

### 3.1 Performance (NFR-P)

**NFR-P-01: Lock Acquisition Time**
- Lock acquisition should complete within 100ms under normal conditions
- Timeout after 5 seconds if lock cannot be acquired

**NFR-P-02: State Update Latency**
- Workflow state updates should complete within 500ms
- Git commit operations excluded from this requirement

### 3.2 Reliability (NFR-R)

**NFR-R-01: State Consistency**
- Workflow state must remain consistent even if process is killed mid-operation
- Atomic file operations ensure no partial writes

**NFR-R-02: Backward Compatibility**
- Existing workflow state files must continue to work without migration
- New fields are optional and have sensible defaults

### 3.3 Maintainability (NFR-M)

**NFR-M-01: Code Documentation**
- All new functions in `handler.sh` must have header comments
- Complex logic must include inline comments

**NFR-M-02: Error Messages**
- All error messages must be actionable (tell user what to do)
- Error messages must include context (what operation failed, why)

## 4. Technical Constraints

- **Language**: Bash (existing implementation)
- **Dependencies**: Only standard Unix tools (`flock`, `jq`, `git`)
- **Platform**: macOS and Linux (must work on both)
- **State Storage**: File-based JSON (no database)

## 5. Out of Scope

The following are explicitly NOT part of this phase:
- Session message isolation (Direction B) - separate task
- Web UI for workflow visualization
- Workflow state migration tools
- Multi-repository workflow support
- Workflow templates or presets

## 6. Dependencies

- Git must be installed and repository must be initialized
- `jq` must be available for JSON processing
- `flock` must be available (standard on Linux, may need installation on macOS)

## 7. Risks and Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| `flock` not available on macOS | High | Medium | Provide fallback using `shlock` or document installation |
| Existing workflows break | High | Low | Comprehensive testing with existing state files |
| Performance degradation | Medium | Low | Benchmark before/after, optimize if needed |
| Complex error recovery | Medium | Medium | Start with simple recovery, iterate based on usage |

## 8. Acceptance Criteria Summary

This phase is complete when:
1. ✅ File locking prevents concurrent state corruption
2. ✅ All inputs are validated with clear error messages
3. ✅ Integration test suite covers all workflow stages
4. ✅ Error handling provides recovery guidance
5. ✅ Documentation is updated (SKILL.md, README)
6. ✅ All tests pass on both macOS and Linux
7. ✅ Existing workflows continue to function

## 9. Next Steps

After requirements approval (Stage 1), proceed to:
- **Stage 2**: System/Architectural Design - detailed implementation plan
- **Stage 3-4**: Forward/Reverse Briefing - developer and QA alignment
- **Stage 5**: Test Case Design - QA writes test specifications
- **Stage 6**: Implementation - code the enhancements
- **Stage 7**: Integration Testing - QA validates
- **Stage 8**: Go-Live Review - final approval and merge

