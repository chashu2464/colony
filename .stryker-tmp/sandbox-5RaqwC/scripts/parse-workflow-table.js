// @ts-nocheck
const fs = require('fs');
const path = require('path');

// Basic regex-based parser for Node CLI (minimal dependencies)
function parseTable(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const rowRegex = /^\|\s*(\d+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/gm;
    
    const mapping = {};
    let match;
    while ((match = rowRegex.exec(content)) !== null) {
        const stage = parseInt(match[1], 10);
        mapping[stage] = {
            stage,
            name: match[2].trim(),
            primaryRole: match[3].trim(),
            collaborators: match[4].trim() === '-' ? [] : match[4].split(',').map(s => s.trim()),
            guidance: match[5].trim()
        };
    }
    return mapping;
}

const skillPath = path.join(__dirname, '../skills/dev-workflow/SKILL.md');
const data = parseTable(skillPath);

if (!data || Object.keys(data).length === 0) {
    process.exit(1);
}

console.log(JSON.stringify(data, null, 2));
