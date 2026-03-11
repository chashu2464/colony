const { execSync } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');

const OUTPUT_FILE = 'docs/TDD_LOG.md';

function getGitLog() {
    try {
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
        const fullHash = execSync(`git rev-parse ${hash}`).toString().trim();
        if (!currentBranchCommits.includes(fullHash)) {
            invalidCommits.push(hash);
        }
    });

    return invalidCommits;
}

function calculateSignature(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
}

function generateTddLog(verifyOnly = false) {
    const log = getGitLog();
    
    if (!log) {
        console.warn('No TDD commits found.');
        if (verifyOnly) process.exit(1);
        return;
    }

    const lines = log.split('\n');

    if (verifyOnly) {
        console.log('Verifying TDD Log integrity...');
        if (!fs.existsSync(OUTPUT_FILE)) {
            console.error('Error: TDD_LOG.md missing.');
            process.exit(1);
        }
        
        const content = fs.readFileSync(OUTPUT_FILE, 'utf8');
        const signatureMatch = content.match(/<!-- SIGNATURE: ([a-f0-9]+) -->/);
        if (!signatureMatch) {
            console.error('Error: TDD_LOG.md missing signature.');
            process.exit(1);
        }

        const originalSignature = signatureMatch[1];
        const contentWithoutSignature = content.split('<!-- SIGNATURE:')[0];
        const currentSignature = calculateSignature(contentWithoutSignature);

        if (originalSignature !== currentSignature) {
            console.error('Error: TDD_LOG.md signature mismatch. Possible manual tampering.');
            process.exit(1);
        }

        const invalid = verifyCommits(lines);
        if (invalid.length > 0) {
            console.error('Error: The following commits in TDD log are not in current branch history:', invalid.join(', '));
            process.exit(1);
        }
        console.log('TDD Log verification successful.');
        return;
    }

    console.log('Generating TDD Log...');
    let tableContent = '# TDD Log\n\n| Commit | Date | Status | Description |\n|---|---|---|---|\n';
    
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
        
        tableContent += `| \`${hash}\` | ${date} | ${status} | ${description} |\n`;
    });

    const signature = calculateSignature(tableContent);
    const finalContent = `${tableContent}\n\n<!-- SIGNATURE: ${signature} -->\n`;

    fs.writeFileSync(OUTPUT_FILE, finalContent);
    console.log(`TDD log generated at ${OUTPUT_FILE}`);
}

const args = process.argv.slice(2);
const verifyOnly = args.includes('--verify');

generateTddLog(verifyOnly);
