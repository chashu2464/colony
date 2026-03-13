#!/usr/bin/env node
// @ts-nocheck

/**
 * check-compliance.js
 * Validates YAML frontmatter in Markdown files according to KMS Metadata Contract.
 */

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const DOC_KINDS = [
  'plan', 'discussion', 'research', 'bug-report', 'decision', 'note', 'lesson', 'report'
];

function validateFile(filePath, fix = false) {
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    return false;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    if (fix) {
      const skeleton = `---\nfeature_ids: []\ndoc_kind: note\ncreated: ${new Date().toISOString().split('T')[0]}\n---\n\n`;
      fs.writeFileSync(filePath, skeleton + content);
      console.log(`Fixed: Injected skeleton frontmatter into ${filePath}`);
      return true;
    }
    console.error(`Error: No frontmatter found in ${filePath}`);
    return false;
  }

  try {
    const data = YAML.parse(match[1]);
    const errors = [];

    if (!data.feature_ids || !Array.isArray(data.feature_ids)) {
      errors.push("Missing or invalid 'feature_ids' (must be an array)");
    }
    if (!data.doc_kind || !DOC_KINDS.includes(data.doc_kind)) {
      errors.push(`Invalid 'doc_kind'. Must be one of: ${DOC_KINDS.join(', ')}`);
    }
    if (!data.created || !/^\d{4}-\d{2}-\d{2}$/.test(data.created)) {
      errors.push("Missing or invalid 'created' date (must be YYYY-MM-DD)");
    }

    if (errors.length > 0) {
      console.error(`Error: Compliance check failed for ${filePath}:`);
      errors.forEach(err => console.error(`  - ${err}`));
      return false;
    }

    return true;
  } catch (e) {
    console.error(`Error: Failed to parse YAML in ${filePath}: ${e.message}`);
    return false;
  }
}

// CLI Entry Point
const args = process.argv.slice(2);
const fixIndex = args.indexOf('--fix');
const fix = fixIndex !== -1;
if (fix) args.splice(fixIndex, 1);

if (args.length === 0) {
  console.log("Usage: node check-compliance.js [--fix] <file1> <file2> ...");
  process.exit(0);
}

let allPassed = true;
args.forEach(file => {
  if (!validateFile(file, fix)) {
    allPassed = false;
  }
});

if (!allPassed) {
  process.exit(1);
}
console.log("Compliance check passed.");
