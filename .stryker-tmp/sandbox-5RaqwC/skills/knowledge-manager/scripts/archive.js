#!/usr/bin/env node
// @ts-nocheck

/**
 * archive.js
 * Moves completed or stale documents to docs/archive/YYYY-MM/
 * Logic:
 * 1. Must have valid frontmatter with 'created' date.
 * 2. Must not be a Feature Navigator (those are permanent).
 * 3. Not modified in 90 days AND not referenced by any file in docs/features/.
 */

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const ARCHIVE_ROOT = path.join(process.cwd(), 'docs', 'archive');
const FEATURES_DIR = path.join(process.cwd(), 'docs', 'features');
const DOCS_DIR = path.join(process.cwd(), 'docs');

function getActiveReferences() {
  const refs = new Set();
  if (!fs.existsSync(FEATURES_DIR)) return refs;

  const files = fs.readdirSync(FEATURES_DIR).filter(f => f.endsWith('.md'));
  files.forEach(f => {
    const content = fs.readFileSync(path.join(FEATURES_DIR, f), 'utf8');
    // Extract local links like [Text](../plans/doc.md)
    const linkRegex = /\[.*?\]\(\.\.\/([^)]+)\)/g;
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      refs.add(match[1]);
    }
  });
  return refs;
}

function shouldArchive(filePath, relativePath, activeRefs) {
  // Never archive navigators or root files
  if (filePath.startsWith(FEATURES_DIR) || path.dirname(relativePath) === '.') return false;
  if (activeRefs.has(relativePath)) return false;

  const content = fs.readFileSync(filePath, 'utf8');
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!fmMatch) return false; // Skip files without metadata for now (too risky to auto-archive)

  try {
    const data = YAML.parse(fmMatch[1]);
    if (!data.created) return false;

    // Check modification time (90 days)
    const stats = fs.statSync(filePath);
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    
    if (stats.mtime > ninetyDaysAgo) return false;

    return data.created; // Return creation date for month folder
  } catch (e) {
    return false;
  }
}

function archiveFile(filePath, relativePath, createdDate) {
  const month = createdDate.substring(0, 7); // YYYY-MM
  const destDir = path.join(ARCHIVE_ROOT, month, path.dirname(relativePath).replace('docs/', ''));
  const destPath = path.join(destDir, path.basename(filePath));

  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  
  fs.renameSync(filePath, destPath);
  console.log(`Archived: ${relativePath} -> docs/archive/${month}/${path.relative(path.join(ARCHIVE_ROOT, month), destPath)}`);
}

function walk(dir, activeRefs) {
  const items = fs.readdirSync(dir);
  items.forEach(item => {
    const fullPath = path.join(dir, item);
    const relPath = path.relative(DOCS_DIR, fullPath);

    if (fs.statSync(fullPath).isDirectory()) {
      if (item !== 'archive' && item !== 'features' && item !== 'node_modules' && !item.startsWith('.')) {
        walk(fullPath, activeRefs);
      }
    } else if (item.endsWith('.md') && item !== 'README.md' && item !== 'BACKLOG.md') {
      const created = shouldArchive(fullPath, relPath, activeRefs);
      if (created) {
        archiveFile(fullPath, relPath, created);
      }
    }
  });
}

// CLI Entry Point
const activeRefs = getActiveReferences();
console.log(`Scanning for stale documents (Active references: ${activeRefs.size})...`);
walk(DOCS_DIR, activeRefs);
console.log("Archival process complete.");
