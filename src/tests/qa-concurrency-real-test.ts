// ── Colony: QA Concurrency Real-World Pressure Test ────────
// Verifies CLIInvoker.ts actually limits concurrency using real spawns.

import { invoke } from '../llm/CLIInvoker.js';
import * as path from 'path';

async function runPressureTest() {
    console.log('=== QA CLI Concurrency Real-World Pressure Test ===\n');

    // 1. Setup PATH to pick up our mock CLI
    const mockDir = path.resolve('.tmp');
    process.env.PATH = `${mockDir}:${process.env.PATH}`;
    console.log('Using mock CLI from: ' + mockDir);

    const NUM_TASKS = 5;
    const MAX_CONCURRENT = 2; // Hardcoded in CLIInvoker.ts

    console.log('Simulating ' + NUM_TASKS + ' concurrent CLI calls (expected limit: ' + MAX_CONCURRENT + ')...\n');

    const startTime = Date.now();
    let completed = 0;

    const tasks = Array.from({ length: NUM_TASKS }, (_, i) => {
        return (async () => {
            const taskId = i + 1;
            console.log('[Task ' + taskId + '] Queuing...');

            try {
                // The invoke call will block at acquireCLISlot
                const resultPromise = invoke('gemini', 'test prompt', {});

                const result = await resultPromise;
                const elapsed = (Date.now() - startTime) / 1000;
                console.log('[Task ' + taskId + '] COMPLETED at ' + elapsed.toFixed(2) + 's');
                completed++;
            } catch (err: any) {
                console.error('[Task ' + taskId + '] FAILED:', err.message);
            }
        })();
    });

    await Promise.all(tasks);

    const totalElapsed = (Date.now() - startTime) / 1000;
    console.log('\nAll tasks finished in ' + totalElapsed.toFixed(2) + 's.');

    // Expected behavior:
    // Task 1 & 2 start at 0s, finish at 2s.
    // Task 3 & 4 start at 2s, finish at 4s.
    // Task 5 starts at 4s, finish at 6s.
    // Total time should be around 6s.

    if (totalElapsed >= 5.5 && totalElapsed <= 7.5) {
        console.log('\n✓ PASS: Concurrency limit (2) respected (Time took ~6s)');
    } else if (totalElapsed < 4) {
        console.log('\n✗ FAIL: Tasks finished too fast, concurrency limit ignored?');
    } else {
        console.log('\n? WARNING: Unusual timing: ' + totalElapsed.toFixed(2) + 's');
    }
}

runPressureTest().catch(console.error);
