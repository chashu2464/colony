# Test Cases: Knowledge Management System (KMS)

**Task ID**: 51d01e2c
**Version**: 1.0
**Status**: Draft

## 1. Metadata Contract (Frontmatter)

### TC-01: Valid Frontmatter Compliance
- **Given**: A markdown file with all mandatory frontmatter fields: `feature_ids`, `doc_kind`, and `created`.
- **When**: `knowledge-manager check-compliance` is executed on this file.
- **Then**: The tool returns a success status (0) and no errors are logged.

### TC-02: Missing Mandatory Fields
- **Given**: A markdown file missing the `doc_kind` field in its frontmatter.
- **When**: `knowledge-manager check-compliance` is executed.
- **Then**: The tool returns a failure status (non-zero) and logs a specific error about the missing `doc_kind`.

### TC-03: Invalid Enum Value for doc_kind
- **Given**: A markdown file with `doc_kind: invalid-type`.
- **When**: `knowledge-manager check-compliance` is executed.
- **Then**: The tool fails and lists the allowed enum values (plan, discussion, research, etc.).

### TC-04: Auto-Fixing Metadata (Incremental)
- **Given**: A new markdown file created without frontmatter.
- **When**: `knowledge-manager check-compliance --fix` is executed.
- **Then**: The tool successfully injects a skeleton frontmatter with default values or prompts for missing info.

## 2. Feature Management

### TC-05: Sequential Feature ID Generation
- **Given**: Existing feature navigators `F001-base.md` and `F002-api.md` in `docs/features/`.
- **When**: `knowledge-manager create-navigator --name "New Feature"` is invoked.
- **Then**: A new file `F003-new-feature.md` is created with the correct sequential ID.

### TC-06: Feature Navigator Bootstrap
- **Given**: A command to create a navigator for ID `F042`.
- **When**: The navigator is created using the `feature-navigator.md` template.
- **Then**: The resulting file contains the standard sections (Status, Related Documents, Key Decisions, Timeline) and correct initial status `in-progress`.

### TC-07: Single Source of Truth (Status)
- **Given**: A feature navigator with `status: completed`.
- **When**: The `BACKLOG.md` is updated.
- **Then**: The corresponding row for this feature ID is removed from `BACKLOG.md`, while the navigator file remains in `docs/features/`.

## 3. Archival Logic

### TC-08: Time-Based Archival Trigger
- **Given**: A document in `docs/plans/` created 100 days ago with no modifications since, and not linked by any active feature navigator.
- **When**: `knowledge-manager archive --month 2026-03` is executed.
- **Then**: The file is moved to `docs/archive/2026-03/plans/`.

### TC-09: Retention of Active References
- **Given**: A document created 100 days ago but still linked in an active feature navigator (Warm Layer).
- **When**: `knowledge-manager archive` is executed.
- **Then**: The file is NOT moved to the archive, preserving the warm-path link.

### TC-10: Monthly Archival Coherence
- **Given**: Multiple documents created in February 2026.
- **When**: Archival is triggered for February.
- **Then**: All documents are moved to a subdirectory specifically named `docs/archive/2026-02/`, maintaining their original relative folder structure.

## 4. Directory Hygiene

### TC-11: Warning Threshold (15 Files)
- **Given**: A directory `docs/discussions/` containing 16 files.
- **When**: `knowledge-manager check-hygiene` is executed.
- **Then**: A warning is issued but the check does not fail the build.

### TC-12: Error Threshold (25 Files)
- **Given**: A directory `docs/notes/` containing 26 files.
- **When**: `knowledge-manager check-hygiene` is executed.
- **Then**: The tool returns a failure status and the CI build is blocked.

### TC-13: Directory Exemption
- **Given**: A directory with 30 files and a valid `.directory-exemption.json` file that hasn't expired.
- **When**: `knowledge-manager check-hygiene` is executed.
- **Then**: No error is raised for that specific directory.

## 5. Retrieval & Performance

### TC-14: Finding Related Docs by Feature ID
- **Given**: Three documents across different folders all sharing `feature_ids: [F001]` in their frontmatter.
- **When**: `knowledge-manager find-related --feature F001` is executed.
- **Then**: All three documents are correctly listed in the output.

### TC-15: Incremental Checking Performance
- **Given**: A repository with 1000 markdown files, but only 2 files modified in the last commit.
- **When**: `knowledge-manager check-compliance` is run in incremental mode (using git diff).
- **Then**: The execution completes in less than 2 seconds.

## 6. Integration & CI/CD

### TC-16: Pre-commit Hook Enforcement
- **Given**: A user tries to commit an .md file with invalid frontmatter.
- **When**: `git commit` is executed.
- **Then**: The pre-commit hook runs `check-compliance` and blocks the commit.
