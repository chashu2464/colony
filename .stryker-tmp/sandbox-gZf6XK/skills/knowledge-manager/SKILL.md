# knowledge-manager

Manage the project's Knowledge Management System (KMS). This skill enforces metadata contracts, helps navigate feature documentation, and maintains directory hygiene.

## Commands

### check-compliance
Validates that Markdown files in `docs/` follow the metadata contract (YAML frontmatter).

**Parameters:**
- `fix` (boolean, optional): If true, injects a skeleton frontmatter into non-compliant files.
- `files` (string[], optional): Specific files to check. If omitted, checks all active docs.

**Example:**
```json
{
  "command": "check-compliance",
  "fix": true
}
```

### create-navigator
Bootstraps a new Feature Navigator file in `docs/features/` with a sequential `Fxxx` ID and updates `docs/BACKLOG.md`.

**Parameters:**
- `name` (string, required): The name of the feature.
- `owner` (string, optional): The agent ID owning this feature (default: "developer").

**Example:**
```json
{
  "command": "create-navigator",
  "name": "Knowledge Management System",
  "owner": "architect"
}
```

### find-related
Searches for all documents associated with a specific feature ID.

**Parameters:**
- `feature_id` (string, required): The ID to search for (e.g., "F001").

**Example:**
```json
{
  "command": "find-related",
  "feature_id": "F001"
}
```

### archive
Moves completed or stale documents (>90 days old and unreferenced) to `docs/archive/YYYY-MM/`.

**Example:**
```json
{
  "command": "archive"
}
```

### check-hygiene
Monitors directory file counts. Warns at 15 files, errors at 25 files per directory.

**Example:**
```json
{
  "command": "check-hygiene"
}
```

## Metadata Contract
Every document must have:
- `feature_ids`: Array of feature IDs.
- `doc_kind`: One of `plan|discussion|research|bug-report|decision|note|lesson|report`.
- `created`: YYYY-MM-DD.
