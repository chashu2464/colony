# Phase 6: dev-workflow Skill Enhancement - Architecture Design

## 1. Executive Summary

This document defines the system architecture for enhancing the `dev-workflow` skill with concurrency control, input validation, and comprehensive testing. The design maintains backward compatibility while adding robust error handling and state management.

**Key Design Principles**:
- **Atomic Operations**: All state changes are atomic using file locking and temp-file patterns
- **Fail-Fast Validation**: Input validation occurs before any state modification
- **Graceful Degradation**: System recovers from errors without manual intervention
- **Zero Breaking Changes**: Existing workflows continue to function without modification

## 2. System Architecture

### 2.1 Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     dev-workflow Skill                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Input      │───▶│   State      │───▶│   Output     │  │
│  │ Validation   │    │  Manager     │    │  Generator   │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                    │                    │          │
│         ▼                    ▼                    ▼          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Schema     │    │    File      │    │     Git      │  │
│  │  Validator   │    │   Locker     │    │   Manager    │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Workflow State  │
                    │  (.data/workflows│
                    │   /*.json)       │
                    └──────────────────┘
```

### 2.2 Data Flow

1. **Request Reception**: Agent invokes skill with JSON parameters
2. **Input Validation**: Schema validator checks all parameters
3. **Lock Acquisition**: File locker acquires exclusive lock on state file
4. **State Read**: Current workflow state is loaded from JSON
5. **Business Logic**: Action is processed (next, prev, backtrack, etc.)
6. **State Write**: Updated state is written atomically
7. **Git Operation**: Changes are committed (if applicable)
8. **Lock Release**: File lock is released
9. **Response**: JSON response is returned to agent

## 3. Detailed Component Design

### 3.1 Input Validation Layer

**Purpose**: Validate all inputs before any state modification

**Implementation**:
```bash
# New function in handler.sh
validate_input() {
  local action="$1"
  local json_input="$2"

  # Schema validation using jq
  # Returns exit code 2 for validation errors
}
```

**Validation Rules**:
- `action`: Must be one of: init, next, prev, backtrack, submit-review, status, update
- `task_name`: Required for init, max 100 chars
- `evidence`: Must be relative path, must exist
- `target_stage`: Must be integer 0-9
- `status`: Must be "approved" or "rejected"
- `assignments`: Must be object with valid role keys

**Error Handling**:
- Exit code 2 for validation errors
- JSON error response with field-specific messages
- Suggestions for correct format

### 3.2 File Locking Mechanism

**Purpose**: Prevent concurrent state corruption

**Implementation Strategy**:
```bash
# Acquire lock with timeout
acquire_lock() {
  local lockfile="$1"
  local timeout=5

  # Use flock with timeout
  # Fallback to shlock on macOS if flock unavailable
}

# Release lock
release_lock() {
  local lockfile="$1"
  # Clean up lock file
}
```

**Lock Scope**:
- One lock file per workflow: `.data/workflows/<task_id>.lock`
- Lock held for entire read-modify-write cycle
- Lock automatically released on script exit (trap)

**Timeout Handling**:
- 5-second timeout for lock acquisition
- Clear error message if timeout occurs
- Suggests checking for stuck processes

**Platform Compatibility**:
- Primary: `flock` (Linux standard, available via Homebrew on macOS)
- Fallback: `shlock` (if flock not available)
- Detection: Check for command availability at runtime

### 3.3 Atomic State Updates

**Purpose**: Ensure state consistency even if process is killed

**Implementation Pattern**:
```bash
update_state() {
  local state_file="$1"
  local new_state="$2"

  # Write to temporary file
  local temp_file="${state_file}.tmp.$$"
  echo "$new_state" > "$temp_file"

  # Atomic rename
  mv "$temp_file" "$state_file"
}
```

**Guarantees**:
- State file is never partially written
- Failed updates don't corrupt existing state
- Readers always see consistent state

**Backup Strategy**:
- Create backup before each modification: `<state_file>.backup`
- Keep only most recent backup (no history)
- Recovery command documented in error messages

### 3.4 Error Recovery System

**Purpose**: Provide clear recovery paths for common failures

**Error Categories**:
1. **Validation Errors** (exit 2): Fix input and retry
2. **Lock Timeout** (exit 3): Wait and retry, or check for stuck processes
3. **State Corruption** (exit 4): Restore from backup
4. **Git Errors** (exit 5): Manual git intervention required

**Recovery Commands**:
```bash
# Restore from backup
cp .data/workflows/<task_id>.json.backup .data/workflows/<task_id>.json

# Clear stuck lock
rm .data/workflows/<task_id>.lock

# Check workflow status
echo '{"action": "status"}' | bash scripts/handler.sh
```

**Error Message Format**:
```json
{
  "error": "Lock acquisition timeout",
  "details": "Could not acquire lock on workflow c74f1f92 after 5 seconds",
  "recovery": "Check for stuck processes: ps aux | grep dev-workflow",
  "exit_code": 3
}
```

## 4. Integration Testing Architecture

### 4.1 Test Suite Structure

```
src/tests/dev-workflow/
├── integration/
│   ├── test-full-workflow.sh      # End-to-end workflow test
│   ├── test-concurrency.sh        # Concurrent operations test
│   ├── test-error-scenarios.sh    # Error handling test
│   └── test-backward-compat.sh    # Compatibility test
├── fixtures/
│   ├── valid-workflow.json        # Sample workflow state
│   ├── corrupted-workflow.json    # Corrupted state for testing
│   └── legacy-workflow.json       # Old format for compat testing
└── helpers/
    ├── setup-test-env.sh          # Test environment setup
    └── cleanup-test-env.sh        # Test cleanup
```

### 4.2 Test Execution Flow

1. **Setup**: Create isolated test environment
   - Temporary git repository
   - Mock workflow state files
   - Test-specific configuration

2. **Execute**: Run test scenarios
   - Full workflow progression (Stage 0-9)
   - Concurrent operations (10 parallel processes)
   - Error scenarios (invalid inputs, missing files)

3. **Validate**: Check results
   - State file integrity
   - Git commit history
   - Lock file cleanup
   - Error messages

4. **Cleanup**: Remove test artifacts
   - Delete temporary repository
   - Clean up lock files
   - Restore original state

### 4.3 Concurrency Test Design

**Objective**: Verify that file locking prevents state corruption

**Test Scenario**:
```bash
# Spawn 10 processes that simultaneously try to advance workflow
for i in {1..10}; do
  (
    echo '{"action": "next", "notes": "Test '$i'"}' | \
    bash scripts/handler.sh
  ) &
done
wait

# Verify: exactly one process succeeded, state is consistent
```

**Success Criteria**:
- Only one process successfully advances stage
- Other processes receive lock timeout or conflict error
- State file is valid JSON
- No data loss or corruption

## 5. Implementation Plan

### 5.1 Phase 1: Core Infrastructure (Priority: High)

**Tasks**:
1. Implement file locking mechanism
   - Add `acquire_lock()` and `release_lock()` functions
   - Add trap handlers for cleanup
   - Test on macOS and Linux

2. Implement atomic state updates
   - Modify all state write operations to use temp files
   - Add backup creation before updates
   - Test crash scenarios

**Deliverables**:
- Updated `handler.sh` with locking functions
- Unit tests for lock acquisition/release
- Documentation of lock behavior

**Estimated Effort**: 4-6 hours

### 5.2 Phase 2: Input Validation (Priority: High)

**Tasks**:
1. Define JSON schema for all actions
2. Implement `validate_input()` function
3. Add validation calls at start of each action handler
4. Implement evidence path validation

**Deliverables**:
- Schema definitions in comments or separate file
- Validation function in `handler.sh`
- Error message templates
- Validation tests

**Estimated Effort**: 3-4 hours

### 5.3 Phase 3: Error Handling (Priority: Medium)

**Tasks**:
1. Define error codes and categories
2. Implement backup/restore functionality
3. Update all error messages with recovery guidance
4. Add error recovery documentation

**Deliverables**:
- Error code constants
- Backup/restore functions
- Updated error messages
- Recovery guide in SKILL.md

**Estimated Effort**: 2-3 hours

### 5.4 Phase 4: Integration Testing (Priority: High)

**Tasks**:
1. Create test suite structure
2. Implement full workflow test
3. Implement concurrency test
4. Implement error scenario tests
5. Add CI integration (if applicable)

**Deliverables**:
- Complete test suite in `src/tests/dev-workflow/`
- Test execution script
- Test documentation
- CI configuration (optional)

**Estimated Effort**: 6-8 hours

### 5.5 Phase 5: Documentation (Priority: Medium)

**Tasks**:
1. Update SKILL.md with new features
2. Document error codes and recovery procedures
3. Add troubleshooting guide
4. Update examples with validation scenarios

**Deliverables**:
- Updated SKILL.md
- Troubleshooting guide
- Example scenarios

**Estimated Effort**: 2-3 hours

**Total Estimated Effort**: 17-24 hours

## 6. Risk Analysis and Mitigation

### 6.1 Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| `flock` unavailable on macOS | High | Medium | Implement fallback to `shlock`, document Homebrew installation |
| Performance degradation from locking | Medium | Low | Benchmark before/after, optimize lock scope if needed |
| Backward compatibility breaks | High | Low | Comprehensive testing with existing workflows, maintain old format support |
| Complex error recovery confuses users | Medium | Medium | Start with simple recovery, iterate based on feedback |
| Test suite is flaky | Medium | Medium | Use isolated environments, avoid timing dependencies |

### 6.2 Operational Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Agents don't understand new error messages | Low | Medium | Clear, actionable error messages with examples |
| Lock files left behind after crashes | Low | High | Implement automatic lock cleanup on startup |
| Backup files accumulate over time | Low | Medium | Keep only most recent backup, document cleanup |

## 7. Success Metrics

### 7.1 Functional Metrics

- ✅ Zero state corruption incidents in concurrent scenarios
- ✅ 100% of invalid inputs caught by validation
- ✅ All integration tests pass on macOS and Linux
- ✅ Existing workflows continue to function without changes

### 7.2 Performance Metrics

- ✅ Lock acquisition < 100ms (95th percentile)
- ✅ State update latency < 500ms (excluding git operations)
- ✅ Test suite completes in < 60 seconds

### 7.3 Quality Metrics

- ✅ All error messages include recovery guidance
- ✅ Code coverage > 80% for new functions
- ✅ Zero regressions in existing functionality

## 8. Dependencies and Prerequisites

### 8.1 External Dependencies

- **flock**: File locking utility (install via Homebrew on macOS)
- **jq**: JSON processor (already required)
- **git**: Version control (already required)

### 8.2 Internal Dependencies

- Existing `dev-workflow` skill implementation
- Colony agent framework
- Git repository structure

### 8.3 Development Environment

- macOS 10.15+ or Linux (Ubuntu 20.04+)
- Bash 4.0+
- Git 2.20+
- jq 1.6+

## 9. Deployment Strategy

### 9.1 Rollout Plan

1. **Development**: Implement changes in feature branch
2. **Testing**: Run full integration test suite
3. **Staging**: Deploy to test environment, validate with real workflows
4. **Production**: Merge to main branch after Stage 8 approval

### 9.2 Rollback Plan

If issues are discovered post-deployment:
1. Revert merge commit
2. Restore previous version of `handler.sh`
3. Existing workflow state files remain compatible (no migration needed)

### 9.3 Monitoring

- Monitor error logs for validation failures
- Track lock timeout incidents
- Measure state update latency
- Collect user feedback on error messages

## 10. Future Enhancements (Out of Scope)

The following enhancements are not part of this phase but may be considered later:
- Web UI for workflow visualization
- Workflow state migration tools
- Multi-repository workflow support
- Workflow templates and presets
- Advanced analytics and reporting
- Session message isolation (Direction B - separate task)

## 11. Conclusion

This architecture provides a robust foundation for enhancing the `dev-workflow` skill with concurrency control, input validation, and comprehensive testing. The design maintains backward compatibility while significantly improving reliability and error handling.

**Next Steps**:
1. Review and approve this architecture (Stage 2)
2. Conduct Forward Briefing with developer (Stage 3)
3. Conduct Reverse Briefing with QA (Stage 4)
4. Design test cases (Stage 5)
5. Begin implementation (Stage 6)
