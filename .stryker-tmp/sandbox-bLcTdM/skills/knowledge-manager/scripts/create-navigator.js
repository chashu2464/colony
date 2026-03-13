#!/usr/bin/env node
// @ts-nocheck

/**
 * create-navigator.js
 * Creates a new Feature Navigator file in docs/features/ with sequential ID.
 * Also updates docs/BACKLOG.md.
 */

const fs = require('fs');
const path = require('path');

function getNextId(featuresDir) {
  if (!fs.existsSync(featuresDir)) {
    fs.mkdirSync(featuresDir, { recursive: true });
    return "F001";
  }

  const files = fs.readdirSync(featuresDir);
  const ids = files
    .map(f => {
      const match = f.match(/^F(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .sort((a, b) => b - a);

  const nextNum = (ids[0] || 0) + 1;
  return `F${nextNum.toString().padStart(3, '0')}`;
}

function updateBacklog(id, name, owner) {
  const backlogPath = path.join(process.cwd(), 'docs', 'BACKLOG.md');
  if (!fs.existsSync(backlogPath)) {
    const initialContent = `# Active Features\n\n| ID | Name | Status | Owner | Updated |\n|----|------|--------|-------|---------|\n`;
    fs.writeFileSync(backlogPath, initialContent);
  }

  let content = fs.readFileSync(backlogPath, 'utf8');
  const today = new Date().toISOString().split('T')[0];
  const newRow = `| ${id} | ${name} | in-progress | ${owner} | ${today} |`;
  
  if (content.includes(`| ${id} |`)) {
    console.log(`Info: ${id} already exists in BACKLOG.md. Skipping append.`);
    return;
  }

  // Find the last row of the table
  const lines = content.split('\n');
  let lastTableRowIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim().startsWith('|')) {
      lastTableRowIndex = i;
      break;
    }
  }

  if (lastTableRowIndex !== -1) {
    lines.splice(lastTableRowIndex + 1, 0, newRow);
    fs.writeFileSync(backlogPath, lines.join('\n'));
  } else {
    fs.appendFileSync(backlogPath, `\n${newRow}\n`);
  }
  console.log(`Updated BACKLOG.md with ${id}`);
}

function createNavigator(name, owner = 'developer') {
  const docsDir = path.join(process.cwd(), 'docs');
  const featuresDir = path.join(docsDir, 'features');
  const templatesDir = path.join(process.cwd(), 'skills', 'knowledge-manager', 'templates');
  
  const id = getNextId(featuresDir);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const fileName = `${id}-${slug}.md`;
  const filePath = path.join(featuresDir, fileName);

  const templatePath = path.join(templatesDir, 'feature-navigator.md');
  let content = '';

  const today = new Date().toISOString().split('T')[0];

  if (fs.existsSync(templatePath)) {
    content = fs.readFileSync(templatePath, 'utf8')
      .replace(/{{ID}}/g, id)
      .replace(/{{NAME}}/g, name)
      .replace(/{{NAME_SLUG}}/g, slug)
      .replace(/{{OWNER}}/g, owner)
      .replace(/{{CREATED}}/g, today);
  } else {
    // Fallback if template missing
    content = `---
feature_ids: [${id}]
doc_kind: decision
created: ${today}
status: active
---

# ${id}: ${name}

## Status: In Progress

## Related Documents
- [Requirements](../${slug}-requirements.md)
- [Design](../${slug}-design.md)

## Key Decisions
- TBD

## Timeline
- ${today}: Task initialized
`;
  }

  fs.writeFileSync(filePath, content);
  console.log(`Created navigator: ${filePath}`);
  
  updateBacklog(id, name, owner);
  
  return filePath;
}

// CLI Entry Point
const args = process.argv.slice(2);
const nameArg = args.find(a => a.startsWith('--name='));
const ownerArg = args.find(a => a.startsWith('--owner='));

if (!nameArg) {
  console.log("Usage: node create-navigator.js --name=\"Feature Name\" [--owner=\"agent-id\"]");
  process.exit(1);
}

const name = nameArg.split('=')[1];
const owner = ownerArg ? ownerArg.split('=')[1] : 'developer';

createNavigator(name, owner);
