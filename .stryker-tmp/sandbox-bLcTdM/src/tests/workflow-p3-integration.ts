// @ts-nocheck
import { MarkdownParser } from '../utils/MarkdownParser.js';
import * as path from 'path';
import { execSync } from 'child_process';

async function testIntegration() {
    console.log('=== P3 Integration Test: Direction 1 ===');

    const skillPath = path.join(process.cwd(), 'skills/dev-workflow/SKILL.md');
    const nodeBridgePath = path.join(process.cwd(), 'scripts/parse-workflow-table.js');

    // 1. Verify TypeScript Parser
    console.log('1. Testing TypeScript MarkdownParser...');
    const mapping = MarkdownParser.parseStageRoleMapping(skillPath);
    if (mapping.has(3)) {
        const stage3 = mapping.get(3)!;
        console.log('✓ Stage 3 found: ' + stage3.name + ', Owner: ' + stage3.primaryRole);
        if (stage3.primaryRole === 'developer') {
            console.log('✓ Stage 3 owner matches expectations (developer)');
        } else {
            console.error('✗ Stage 3 owner mismatch: expected developer, got ' + stage3.primaryRole);
        }
    } else {
        console.error('✗ Stage 3 not found in mapping');
    }

    // 2. Verify Node CLI Bridge
    console.log('2. Testing Node CLI Bridge...');
    try {
        const output = execSync('node ' + nodeBridgePath, { encoding: 'utf8' });
        const json = JSON.parse(output);
        if (json["3"] && json["3"].primaryRole === 'developer') {
            console.log('✓ Node CLI output matches expectations for Stage 3');
        } else {
            console.error('✗ Node CLI output mismatch or missing data');
        }
    } catch (error) {
        console.error('✗ Node CLI Bridge execution failed: ' + error);
    }

    // 3. Verify handler.sh interaction (Mocked)
    console.log('3. Verifying Bash role mapping logic...');
    try {
        const bashSim = execSync('node ' + nodeBridgePath + ' | jq -r --arg stage "6" \'.[$stage].primaryRole\'', { encoding: 'utf8' }).trim();
        console.log('Simulated role for Stage 6: ' + bashSim);
        if (bashSim === 'developer') {
            console.log('✓ Bash-equivalent logic returned correct role (developer)');
        } else {
            console.error('✗ Bash-equivalent logic mismatch: expected developer, got ' + bashSim);
        }
    } catch (error) {
        console.error('✗ Bash simulation failed (is jq installed?): ' + error);
    }

    console.log('=== Integration Test Completed ===');
}

testIntegration().catch(console.error);
