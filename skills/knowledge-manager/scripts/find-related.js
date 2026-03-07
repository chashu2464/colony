#!/usr/bin/env node

/**
 * find-related.js
 * Searches for all documents associated with a specific feature ID.
 */

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const DOCS_DIR = path.join(process.cwd(), 'docs');

function findRelated(featureId) {
  const results = [];

  function walk(dir) {
    const items = fs.readdirSync(dir);
    items.forEach(item => {
      const fullPath = path.join(dir, item);
      if (fs.statSync(fullPath).isDirectory()) {
        if (item !== 'node_modules' && !item.startsWith('.')) {
          walk(fullPath);
        }
      } else if (item.endsWith('.md')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
        if (fmMatch) {
          try {
            const data = YAML.parse(fmMatch[1]);
            if (data.feature_ids && Array.isArray(data.feature_ids) && data.feature_ids.includes(featureId)) {
              results.push({
                path: path.relative(process.cwd(), fullPath),
                kind: data.doc_kind,
                created: data.created
              });
            }
          } catch (e) {
            // Skip unparseable files
          }
        }
      }
    });
  }

  if (fs.existsSync(DOCS_DIR)) {
    walk(DOCS_DIR);
  }
  return results;
}

// CLI Entry Point
const args = process.argv.slice(2);
const featureArg = args.find(a => a.startsWith('--feature='));

if (!featureArg) {
  console.log("Usage: node find-related.js --feature=F001");
  process.exit(1);
}

const featureId = featureArg.split('=')[1];
const related = findRelated(featureId);

if (related.length === 0) {
  console.log(`No documents found for feature ${featureId}.`);
} else {
  console.log(`Related documents for ${featureId}:`);
  related.forEach(r => {
    console.log(`- [${r.kind}] ${r.path} (Created: ${r.created})`);
  });
}
