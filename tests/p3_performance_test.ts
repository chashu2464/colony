import { MarkdownParser } from '../src/utils/MarkdownParser.js';
import * as path from 'path';

const skillPath = path.join(process.cwd(), 'skills/dev-workflow/SKILL.md');

console.log('=== Performance Test: MarkdownParser ===');
const start = performance.now();
for (let i = 0; i < 100; i++) {
    MarkdownParser.parseStageRoleMapping(skillPath);
}
const end = performance.now();
const average = (end - start) / 100;
console.log(`Average parsing time over 100 iterations: ${average.toFixed(4)}ms`);

if (average < 5) {
    console.log('✓ PASS: Parsing time is below 5ms');
} else {
    console.error('✗ FAIL: Parsing time exceeds 5ms');
    process.exit(1);
}

console.log('=== Test Completed ===');
