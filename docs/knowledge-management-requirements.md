# Requirements: Knowledge Management System (KMS)

## Problem Description
The current documentation in `docs/` is fragmented and lacks structure, making it difficult for both humans and agents to retrieve relevant historical knowledge and decisions.

## Functional Requirements
1.  **Metadata Contract**: Every document in the repository MUST contain a YAML Frontmatter with:
    - `feature_ids`: List of related feature IDs (e.g., [F041]).
    - `doc_kind`: Type of document (plan|discussion|research|bug-report|decision|note|lesson).
    - `created`: Creation date (YYYY-MM-DD).
2.  **Hierarchical Memory**:
    - **Hot Layer**: Active task index (managed in a central file).
    - **Warm Layer**: Feature Navigators (`docs/features/Fxxx-name.md`) that aggregate links to all related docs.
    - **Cold Layer**: Historical records and raw data (managed via monthly archives).
3.  **Lifecycle Management**:
    - **Archiving**: Automated tool to move "Done" records to `docs/archive/YYYY-MM/`.
    - **Directory Hygiene**: Automated check to ensure no directory exceeds a specific file count (e.g., 15 files).
4.  **Knowledge Encoding**:
    - Templates for "Lessons Learned" (7-slot format).
    - Templates for "Skills".
5.  **Agent Skill (`knowledge-manager`)**:
    - `check-compliance`: Verify Frontmatter in modified files.
    - `find-related`: Search documents by `feature_id`.
    - `create-navigator`: Bootstrap a new feature navigator file.

## Technical Requirements
- Language: Node.js (scripts) or Shell.
- Storage: Markdown + YAML.
- Tooling: Integration with `dev-workflow`.

## Acceptance Criteria
- [ ] All files in `docs/` have valid Frontmatter.
- [ ] No directory has > 20 files without a warning.
- [ ] A new feature can be successfully "graduated" from Inbox to Feature Navigator.
