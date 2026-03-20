#!/usr/bin/env node
'use strict';

const fs = require('fs');
const YAML = require('yaml');

const REQUIRED_SECTIONS = [
  'scope',
  'interaction_states',
  'visual_constraints',
  'assets',
  'acceptance_criteria',
  'non_goals',
  'risk_notes',
];

const REQUIRED_METADATA = ['ucd_version', 'task_id', 'artifact_path', 'baseline_source'];
const REQUIRED_AUDIT_FIELDS = [
  'ucd_required',
  'ucd_reason_codes',
  'ucd_override_reason',
  'ucd_version',
  'ucd_artifact',
  'ucd_baseline_source',
];

const UNSAFE_SCHEME_REGEX = /\b(?:javascript|vbscript|data|file):/i;
const PATH_TRAVERSAL_REGEX = /(^|[\\/])\.\.([\\/]|$)/;
const INJECTION_PATTERN_REGEX = /<script\b|onerror\s*=|onload\s*=|<iframe\b|!\[[^\]]*]\(\s*javascript:/i;

function parseArgs() {
  const raw = JSON.parse(process.argv[2] || '{}');
  return {
    artifactPath: typeof raw.artifact_path === 'string' ? raw.artifact_path.trim() : '',
    audit: raw.audit && typeof raw.audit === 'object' ? raw.audit : {},
    expectedVersion: typeof raw.expected_ucd_version === 'string' ? raw.expected_ucd_version.trim() : '',
  };
}

function block(reason, details) {
  return { result: 'block', block_reason: reason, details };
}

function extractFrontMatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return null;
  return YAML.parse(match[1] || '');
}

function extractSectionMap(content) {
  const map = new Map();
  const matches = content.matchAll(/^##\s+([a-z_]+)\s*$/gim);
  for (const match of matches) {
    map.set((match[1] || '').trim().toLowerCase(), true);
  }
  return map;
}

function validateAuditFields(audit) {
  const missing = REQUIRED_AUDIT_FIELDS.filter((field) => !(field in audit));
  if (missing.length > 0) {
    return block('UCD_AUDIT_FIELDS_INCOMPLETE', [`missing audit fields: ${missing.join(', ')}`]);
  }

  if (!Array.isArray(audit.ucd_reason_codes)) {
    return block('UCD_AUDIT_FIELDS_INCOMPLETE', ['ucd_reason_codes must be an array']);
  }

  if (audit.ucd_reason_codes.includes('MANUAL_OVERRIDE') && typeof audit.ucd_override_reason !== 'string') {
    return block('UCD_OVERRIDE_REASON_MISSING', ['override reason must be provided as string when MANUAL_OVERRIDE is set']);
  }

  if (audit.ucd_reason_codes.includes('MANUAL_OVERRIDE') && audit.ucd_override_reason.trim().length === 0) {
    return block('UCD_OVERRIDE_REASON_MISSING', ['override reason cannot be empty when MANUAL_OVERRIDE is set']);
  }

  if (audit.ucd_required === true) {
    const missingForRequired = [];
    if (typeof audit.ucd_artifact !== 'string' || audit.ucd_artifact.trim().length === 0) missingForRequired.push('ucd_artifact');
    if (typeof audit.ucd_version !== 'string' || audit.ucd_version.trim().length === 0) missingForRequired.push('ucd_version');
    if (typeof audit.ucd_baseline_source !== 'string' || audit.ucd_baseline_source.trim().length === 0) missingForRequired.push('ucd_baseline_source');
    if (missingForRequired.length > 0) {
      return block('UCD_AUDIT_FIELDS_INCOMPLETE', [`ucd_required=true but missing: ${missingForRequired.join(', ')}`]);
    }
  }

  return null;
}

function validateAssets(content) {
  if (UNSAFE_SCHEME_REGEX.test(content)) {
    return block('UCD_ASSET_UNSAFE_SCHEME', ['assets contains disallowed URI scheme']);
  }
  if (PATH_TRAVERSAL_REGEX.test(content)) {
    return block('UCD_ASSET_PATH_TRAVERSAL', ['assets contains path traversal pattern']);
  }
  if (INJECTION_PATTERN_REGEX.test(content)) {
    return block('UCD_CONTENT_INJECTION_PATTERN', ['content contains script/injection pattern']);
  }
  return null;
}

function validateMetadata(metadata) {
  const missing = REQUIRED_METADATA.filter((key) => typeof metadata?.[key] !== 'string' || metadata[key].trim().length === 0);
  if (missing.length > 0) {
    return block('UCD_MISSING_METADATA', [`missing metadata keys: ${missing.join(', ')}`]);
  }
  return null;
}

function validateSections(content) {
  const sectionMap = extractSectionMap(content);
  const missing = REQUIRED_SECTIONS.filter((section) => !sectionMap.has(section));
  if (missing.length > 0) {
    return block('UCD_MISSING_REQUIRED_SECTION', [`missing required sections: ${missing.join(', ')}`]);
  }
  return null;
}

function validate(input) {
  const auditFailure = validateAuditFields(input.audit);
  if (auditFailure) return auditFailure;

  if (input.audit.ucd_required !== true) {
    return { result: 'pass', details: ['ucd_required=false; gate skipped'], metadata: null };
  }

  if (!input.artifactPath) {
    return block('UCD_REQUIRED_BUT_MISSING_ARTIFACT', ['artifact path is empty']);
  }
  if (!fs.existsSync(input.artifactPath)) {
    return block('UCD_REQUIRED_BUT_MISSING_ARTIFACT', [`artifact not found: ${input.artifactPath}`]);
  }

  const content = fs.readFileSync(input.artifactPath, 'utf8');
  const metadata = extractFrontMatter(content);

  const metadataFailure = validateMetadata(metadata);
  if (metadataFailure) return metadataFailure;

  if (metadata.artifact_path !== input.artifactPath) {
    return block('UCD_MISSING_METADATA', ['artifact_path metadata does not match input artifact path']);
  }

  if (typeof metadata.baseline_source !== 'string' || metadata.baseline_source.trim().length === 0) {
    return block('UCD_MISSING_METADATA', ['baseline_source must be non-empty']);
  }

  const sectionFailure = validateSections(content);
  if (sectionFailure) return sectionFailure;

  const assetFailure = validateAssets(content);
  if (assetFailure) return assetFailure;

  const expectedVersion = input.expectedVersion || input.audit.ucd_version;
  if (expectedVersion && metadata.ucd_version !== expectedVersion) {
    return block('UCD_VERSION_MISMATCH', [`expected ${expectedVersion}, got ${metadata.ucd_version}`]);
  }

  return {
    result: 'pass',
    details: ['ucd artifact validated'],
    metadata: {
      ucd_version: metadata.ucd_version,
      baseline_source: metadata.baseline_source,
      artifact_path: metadata.artifact_path,
    },
  };
}

function main() {
  try {
    const input = parseArgs();
    const result = validate(input);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(JSON.stringify({ result: 'block', block_reason: 'UCD_CONTENT_INJECTION_PATTERN', details: [String(error.message || error)] }));
    process.stderr.write('\n');
    process.exit(1);
  }
}

main();
