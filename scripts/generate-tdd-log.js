const { execSync } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');

const OUTPUT_FILE = 'docs/TDD_LOG.md';

function getGitLog() {
    try {
        // Only look at commits in the current branch that have tdd: prefix
        return execSync('git log --pretty=format:"%h|%ad|%s" --date=short --grep="tdd:"').toString();
    } catch (error) {
        return '';
    }
}

function verifyCommits(lines) {
    const currentBranchCommits = execSync('git rev-list HEAD').toString().split('\n');
    const invalidCommits = [];

    lines.forEach(line => {
        const [hash] = line.split('|');
        if (!hash) return;
        try {
            const fullHash = execSync(`git rev-parse ${hash}`).toString().trim();
            if (!currentBranchCommits.includes(fullHash)) {
                invalidCommits.push(hash);
            }
        } catch (e) {
            invalidCommits.push(hash);
        }
    });

    return invalidCommits;
}

function calculateSignature(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
}

function generateTableContent(log) {
    if (!log) return '';
    const lines = log.split('\n');
    let tableContent = '# TDD Log\n\n| Commit | Date | Status | Description |\n|---|---|---|---|\n';
    
    lines.forEach(line => {
        const parts = line.split('|');
        if (parts.length < 3) return;
        const [hash, date, subject] = parts;
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
        
        tableContent += `| \`${hash}\` | ${date} | ${status} | ${description} |\n`;
    });
    return tableContent;
}

function generateTddLog(verifyOnly = false) {
    const log = getGitLog();
    
    if (verifyOnly) {
        console.log('Verifying TDD Log integrity...');
        if (!fs.existsSync(OUTPUT_FILE)) {
            console.error('Error: TDD_LOG.md missing.');
            process.exit(1);
        }
        
        const content = fs.readFileSync(OUTPUT_FILE, 'utf8');
        
        // 1. Signature Check
        const signatureMatch = content.match(/<!-- SIGNATURE: ([a-f0-9]+) -->/);
        if (!signatureMatch) {
            console.error('Error: TDD_LOG.md missing signature.');
            process.exit(1);
        }

        const originalSignature = signatureMatch[1];
        const contentWithoutSignature = content.split('<!-- SIGNATURE:')[0].trim();
        const currentSignature = calculateSignature(contentWithoutSignature);

        if (originalSignature !== currentSignature) {
            console.error('Error: TDD_LOG.md signature mismatch. Original:', originalSignature, 'Calculated:', currentSignature);
            process.exit(1);
        }

        // 2. Content Consistency Check (Match current git log)
        const expectedTable = generateTableContent(log).trim();
        if (contentWithoutSignature !== expectedTable) {
            console.error('Error: TDD_LOG.md is not up-to-date with current git history. Please run generate-tdd-log.js to update.');
            process.exit(1);
        }

        // 3. Commit existence check (Security)
        if (log) {
            const invalid = verifyCommits(log.split('\n'));
            if (invalid.length > 0) {
                console.error('Error: The following commits in TDD log are not in current branch history:', invalid.join(', '));
                process.exit(1);
            }
        }
        
        console.log('TDD Log verification successful.');
        return;
    }

    if (!log) {
        console.warn('No TDD commits found.');
        return;
    }

    console.log('Generating TDD Log...');
    const tableContent = generateTableContent(log).trim();
    const signature = calculateSignature(tableContent);
    const finalContent = `${tableContent}\n\n<!-- SIGNATURE: ${signature} -->\n`;

    fs.writeFileSync(OUTPUT_FILE, finalContent);
    console.log(`TDD log generated at ${OUTPUT_FILE}`);
}

const args = process.argv.slice(2);
const verifyOnly = args.includes('--verify');

generateTddLog(verifyOnly);
