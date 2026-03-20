---
name: ucd
description: Produce and validate UCD artifacts for UI-related workflow tasks.
---

# ucd

Generate and validate UCD artifacts for UI-related tasks.

## Usage

Evaluate whether the task requires UCD:

```bash
node scripts/evaluate-trigger.js '{"task_description":"Add dashboard UI","changed_paths":["web/src/pages/dashboard.tsx"],"user_intent_flags":["ui"],"override_requested":false}'
```

Validate UCD artifact against audit contract:

```bash
node scripts/validate-ucd.js '{"artifact_path":"docs/workflow/task-xxxx/artifacts/xxxx-ucd.md","audit":{"ucd_required":true,"ucd_reason_codes":["UI_NEW_SURFACE"],"ucd_override_reason":null,"ucd_version":"1.0.0","ucd_artifact":"docs/workflow/task-xxxx/artifacts/xxxx-ucd.md","ucd_baseline_source":"figma:v12"}}'
```

## Artifact Template

Use `templates/ucd-template.md` and fill all metadata + required sections.

Required metadata:
- `ucd_version`
- `task_id`
- `artifact_path`
- `baseline_source`

Required sections:
- `scope`
- `interaction_states`
- `visual_constraints`
- `assets`
- `acceptance_criteria`
- `non_goals`
- `risk_notes`

## Fail-Closed Rules

Validation blocks when:
- UCD is required but artifact is missing
- metadata or required sections are missing
- audit field group is incomplete
- override reason is missing when `MANUAL_OVERRIDE` is used
- asset content includes unsafe scheme/path traversal/injection patterns
- artifact version mismatches expected/audited version
