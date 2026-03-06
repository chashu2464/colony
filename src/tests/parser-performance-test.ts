import { MarkdownParser } from '../utils/MarkdownParser.js';
import * as path from 'path';

async function testPerformance() {
    const skillPath = path.join(process.cwd(), 'skills/dev-workflow/SKILL.md');
    
    console.log('--- Markdown Parsing Performance Test ---');
    
    const iterations = 100;
    const start = Date.now();
    
    for (let i = 0; i < iterations; i++) {
        MarkdownParser.parseStageRoleMapping(skillPath);
    }
    
    const end = Date.now();
    const total = end - start;
    const average = total / iterations;
    
    console.log(`Iterations: ${iterations}`);
    console.log(`Total Time: ${total}ms`);
    console.log(`Average Time: ${average}ms`);
    
    if (average < 5) {
        console.log('✅ Performance target met (< 5ms)');
    } else {
        console.log('❌ Performance target NOT met (> 5ms)');
    }
}

testPerformance().catch(console.error);
