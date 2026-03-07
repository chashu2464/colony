#!/usr/bin/env node

/**
 * check-hygiene.js
 * Monitors directory file counts and enforces limits (15 warning / 25 error).
 */

const fs = require('fs');
const path = require('path');

const WARN_THRESHOLD = 15;
const ERR_THRESHOLD = 25;
const DOCS_DIR = path.join(process.cwd(), 'docs');
const EXEMPTION_FILE = '.directory-exemption.json';

function checkDirectory(dirPath) {
  const relativePath = path.relative(process.cwd(), dirPath);
  
  // Skip archive and features (features can grow large as hubs)
  if (relativePath.includes('docs/archive') || relativePath === 'docs/features') {
    return { success: true, warnings: 0, errors: 0 };
  }

  const items = fs.readdirSync(dirPath);
  const files = items.filter(item => {
    const fullPath = path.join(dirPath, item);
    return fs.statSync(fullPath).isFile() && item !== '.DS_Store' && item !== EXEMPTION_FILE;
  });

  const count = files.length;
  
  // Check exemptions
  const exemptionPath = path.join(dirPath, EXEMPTION_FILE);
  if (fs.existsSync(exemptionPath)) {
    try {
      const exemption = JSON.parse(fs.readFileSync(exemptionPath, 'utf8'));
      const expiry = new Date(exemption.expires);
      if (expiry > new Date()) {
        console.log(`Info: ${relativePath} is exempt from hygiene checks until ${exemption.expires}. (Reason: ${exemption.reason})`);
        return { success: true, warnings: 0, errors: 0 };
      }
    } catch (e) {
      console.warn(`Warning: Failed to parse exemption file in ${relativePath}`);
    }
  }

  if (count > ERR_THRESHOLD) {
    console.error(`Error: Directory ${relativePath} is over the limit: ${count} files (Limit: ${ERR_THRESHOLD})`);
    return { success: false, warnings: 0, errors: 1 };
  } else if (count > WARN_THRESHOLD) {
    console.warn(`Warning: Directory ${relativePath} is approaching the limit: ${count} files (Warn: ${WARN_THRESHOLD})`);
    return { success: true, warnings: 1, errors: 0 };
  }

  return { success: true, warnings: 0, errors: 0 };
}

function walk(dir, results) {
  const stats = checkDirectory(dir);
  results.warnings += stats.warnings;
  results.errors += stats.errors;
  if (stats.errors > 0) results.success = false;

  const items = fs.readdirSync(dir);
  items.forEach(item => {
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory() && item !== 'node_modules' && !item.startsWith('.')) {
      walk(fullPath, results);
    }
  });
}

const finalResults = { success: true, warnings: 0, errors: 0 };
if (fs.existsSync(DOCS_DIR)) {
  walk(DOCS_DIR, finalResults);
}

console.log(`\nHygiene summary: ${finalResults.errors} errors, ${finalResults.warnings} warnings.`);

if (!finalResults.success) {
  console.error("Hygiene check failed. Please archive some documents.");
  process.exit(1);
}
console.log("Hygiene check passed.");
