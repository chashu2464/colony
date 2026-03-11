const { execSync } = require('child_process');
const fs = require('fs');

const OUTPUT_FILE = 'docs/TDD_LOG.md';

function generateTddLog() {
    console.log('Generating TDD Log...');
    try {
        // Extract commits with tdd:red, tdd:green, tdd:refactor
        const log = execSync('git log --pretty=format:"%h|%ad|%s" --date=short --grep="tdd:"').toString();
        
        if (!log) {
            console.warn('No TDD commits found.');
            return;
        }

        const lines = log.split('\n');
        let content = '# TDD Log\n\n| Commit | Date | Status | Description |\n|---|---|---|---|\n';
        
        lines.forEach(line => {
            const [hash, date, subject] = line.split('|');
            let status = 'Unknown';
            let description = subject;
            
            if (subject.startsWith('tdd:red')) {
                status = '🔴 RED';
                description = subject.replace('tdd:red', '').trim();
            } else if (subject.startsWith('tdd:green')) {
                status = '🟢 GREEN';
                description = subject.replace('tdd:green', '').trim();
            } else if (subject.startsWith('tdd:refactor')) {
                status = '🔵 REFACTOR';
                description = subject.replace('tdd:refactor', '').trim();
            }
            
            content += `| \`${hash}\` | ${date} | ${status} | ${description} |\n`;
        });

        fs.writeFileSync(OUTPUT_FILE, content);
        console.log(`TDD log generated at ${OUTPUT_FILE}`);
    } catch (error) {
        console.error('Error generating TDD log:', error.message);
    }
}

generateTddLog();
