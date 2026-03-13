# System Design: Knowledge Management System (KMS)

## 1. Architecture Overview

### 1.1 Three-Layer Memory Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Hot Layer: docs/BACKLOG.md                                  │
│ - Active features only (idea/spec/in-progress/review)      │
│ - ~10 lines, high-frequency updates                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Warm Layer: docs/features/Fxxx-name.md                     │
│ - Feature aggregation files (navigation hubs)              │
│ - Links to all related documents                           │
│ - Single source of truth for feature status                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Cold Layer: Original documents with frontmatter            │
│ - docs/plans/, docs/discussions/, docs/decisions/, etc.    │
│ - YAML frontmatter: feature_ids, doc_kind, created         │
│ - Monthly archival to docs/archive/YYYY-MM/                │
└─────────────────────────────────────────────────────────────┘
```

**Design Rationale**: Separating concerns by access frequency prevents hot-path queries from scanning cold storage, while maintaining complete historical records.

## 2. Data Models

### 2.1 YAML Frontmatter Contract

Every document in `docs/` (except BACKLOG.md and README.md) MUST contain:

```yaml
---
feature_ids: [F001, F042]  # Required: List of related feature IDs
doc_kind: plan             # Required: Enum value (see below)
created: 2026-03-07        # Required: ISO date (YYYY-MM-DD)
status: active             # Optional: active|archived|deprecated
tags: [api, security]      # Optional: Free-form tags
---
```

**doc_kind Enum**:
- `plan`: Implementation plans
- `discussion`: Design discussions and brainstorming
- `research`: Investigation and analysis
- `bug-report`: Bug reports and postmortems
- `decision`: Architecture decision records (ADRs)
- `note`: General notes and observations
- `lesson`: Lessons learned (7-slot template)
- `report`: Test reports and analysis

**Design Decision**: Status lives ONLY in feature aggregation files (Warm Layer), not in individual documents. This prevents cascading updates across hundreds of files when a feature's status changes.

### 2.2 BACKLOG.md Format (Hot Layer)

```markdown
# Active Features

| ID | Name | Status | Owner | Updated |
|----|------|--------|-------|---------|
| F001 | Knowledge Management System | in-progress | architect | 2026-03-07 |
| F002 | API Rate Limiting | spec | developer | 2026-03-05 |

**Status Values**: idea, spec, in-progress, review

**Lifecycle**: When status becomes "completed", the row is REMOVED from BACKLOG.md (but the feature aggregation file persists permanently).
```

**Design Rationale**: Table format enables quick scanning. Removal of completed items keeps the hot layer lean (~10 active features max).

### 2.3 Feature Aggregation File Format (Warm Layer)

Location: `docs/features/Fxxx-name.md`

```markdown
---
feature_id: F001
name: Knowledge Management System
status: in-progress
created: 2026-03-07
completed: null
owner: architect
---

# F001: Knowledge Management System

## Status: In Progress

## Related Documents
- [Requirements](../knowledge-management-requirements.md)
- [Design](../knowledge-management-design.md)
- [Discussion: Metadata Schema](../discussions/2026-03-07-metadata-schema.md)

## Key Decisions
- Use YAML frontmatter for metadata (not JSON)
- Three-layer architecture (Hot/Warm/Cold)

## Timeline
- 2026-03-07: Requirements approved
- 2026-03-07: Design phase started
```

**Design Decision**: Feature aggregation files are the ONLY place where feature status is stored. All queries for "What's the status of F001?" resolve here in one hop.

## 3. Feature ID Generation

**Rule**: Sequential numbering starting from F001.

**Implementation**:
```bash
# Get next available ID
next_id=$(ls docs/features/ | grep -oE 'F[0-9]+' | sort -V | tail -1 | sed 's/F//' | awk '{print $1+1}')
feature_id=$(printf "F%03d" $next_id)
```

**Design Rationale**: Simple, predictable, and human-readable. Avoids timestamp-based IDs which are harder to reference in conversation.

## 4. Archival Strategy

### 4.1 Trigger Conditions

A document is eligible for archival if:
1. Its `status` field is `archived` OR
2. It hasn't been modified in 90 days AND is not referenced by any active feature

### 4.2 Archival Process

```bash
# Monthly archival (run on 1st of each month)
archive-docs --month 2026-02
```

**Destination**: `docs/archive/YYYY-MM/` (mirrors source directory structure)

Example:
```
docs/discussions/2026-02-15-api-design.md
  → docs/archive/2026-02/discussions/2026-02-15-api-design.md
```

**Design Decision**: Archive by creation month (not modification month) to maintain chronological coherence. Feature aggregation files are NEVER archived (they serve as permanent navigation hubs).

## 5. Directory Hygiene

### 5.1 File Count Limits

- **Warning threshold**: 15 files in a single directory
- **Error threshold**: 25 files (CI build fails)

**Exemptions**: Directories can declare exemptions in `.directory-exemption.json`:
```json
{
  "owner": "architect",
  "reason": "Active development sprint",
  "expires": "2026-04-01"
}
```

**Design Rationale**: Forces regular archival and prevents documentation sprawl. Exemptions provide escape hatch for legitimate high-activity periods.

## 6. Migration Strategy

### 6.1 Phased Rollout

**Phase 1 (Week 1)**: Tooling setup
- Implement `check-frontmatter` script
- Implement `create-navigator` script
- Add pre-commit hook

**Phase 2 (Week 2)**: Pilot migration
- Migrate 5 recent documents manually
- Create feature aggregation files for active features
- Validate tooling with real data

**Phase 3 (Week 3)**: Bulk migration
- Run automated frontmatter injection for remaining docs
- Manual review of auto-generated metadata
- Create BACKLOG.md

**Phase 4 (Week 4)**: Enforcement
- Enable CI checks for frontmatter compliance
- Enable directory hygiene checks

**Design Rationale**: Gradual rollout reduces risk and allows iteration on tooling based on real-world feedback.

### 6.2 Backward Compatibility

**Existing documents without frontmatter**: Tolerated during migration period (4 weeks). After enforcement date, CI will fail on non-compliant files.

**Fallback behavior**: If a document lacks frontmatter, search tools will skip it (not error out).

## 7. Performance Optimization

### 7.1 Incremental Checking

**Problem**: Checking frontmatter on 700+ files is slow.

**Solution**: Only check files modified in current git diff:
```bash
git diff --name-only HEAD | grep '\.md$' | xargs check-frontmatter
```

**Design Rationale**: Reduces CI time from ~30s to ~2s for typical PRs.

### 7.2 Caching Strategy

Feature aggregation files are cached in memory during agent sessions. Cache invalidation on file modification (via file watcher).

## 8. Agent Skill Interface

### 8.1 `knowledge-manager` Skill Commands

```bash
# Check frontmatter compliance
knowledge-manager check-compliance [--fix]

# Find documents by feature ID
knowledge-manager find-related --feature F001

# Create new feature navigator
knowledge-manager create-navigator --id F042 --name "API Rate Limiting"

# Archive completed features
knowledge-manager archive --month 2026-02

# Check directory hygiene
knowledge-manager check-hygiene
```

### 8.2 Skill Implementation

**Language**: Node.js (TypeScript)

**Location**: `.claude/skills/knowledge-manager/`

**Structure**:
```
.claude/skills/knowledge-manager/
├── SKILL.md              # Skill documentation
├── scripts/
│   ├── handler.sh        # Main entry point
│   ├── check-compliance.ts
│   ├── find-related.ts
│   ├── create-navigator.ts
│   ├── archive.ts
│   └── check-hygiene.ts
└── templates/
    ├── feature-navigator.md
    └── lesson-learned.md
```

## 9. Integration Points

### 9.1 Git Hooks

**Pre-commit**: Run `check-compliance` on staged .md files

**Pre-push**: Run `check-hygiene` on all directories

### 9.2 CI/CD Pipeline

**GitHub Actions** (or equivalent):
```yaml
- name: Check Documentation Compliance
  run: |
    npm run check-docs
```

## 10. Success Metrics

- **Frontmatter coverage**: 95%+ of docs have valid frontmatter
- **Query time**: "Find all docs for F042" resolves in <1s
- **Directory health**: No directory exceeds 25 files
- **Archival rate**: 80%+ of completed features archived within 30 days

## 11. Open Questions

1. **Hot Layer Update Frequency**: Should BACKLOG.md be auto-updated by CI, or manually maintained?
   - **Recommendation**: Manual updates (prevents noise from automated commits)

2. **Feature ID Namespace**: Should we use prefixes for different project areas (e.g., API-F001, UI-F001)?
   - **Recommendation**: No prefixes initially (adds complexity without clear benefit)

3. **Archival Restoration**: How should archived documents be restored if needed?
   - **Recommendation**: Manual `git mv` from archive back to active directory

## 12. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Migration breaks existing links | Medium | High | Phased rollout with link validation |
| Performance degradation on large repos | Low | Medium | Incremental checking + caching |
| Team adoption resistance | Medium | High | Clear documentation + training session |
| Frontmatter schema evolution | High | Low | Version field in frontmatter for future changes |

## 13. Next Steps

1. **Stage 3 (Forward Briefing)**: Developer explains this design to QA Lead
2. **Stage 4 (Reverse Briefing)**: QA Lead confirms understanding
3. **Stage 5 (Test Case Design)**: QA Lead writes test cases for each script
4. **Stage 6 (Implementation)**: Developer implements scripts and skill
