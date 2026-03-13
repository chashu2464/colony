import { getHealthStatus } from '../session/ContextHealthBar.js';
import type { SessionRecord } from '../session/SessionRecord.js';
import { clearLine, cursorTo } from 'readline';

async function runTest() {
    console.log('--- Context Health Calculation Verification ---\n');

    // Mock a session record with various token usage scenarios
    const mockSession: Partial<SessionRecord> = {
        id: 'test-session',
        status: 'active',
        contextLimit: 200000,
        invocationCount: 2,
        tokenUsage: {
            input: 120000,
            output: 1000,
            cacheRead: 20000,
            cacheCreation: 5000,
            cumulative: 290000, // E.g., from multiple past invocations
            currentContextLength: 145000, // 120000 + 20000 + 5000
        }
    };

    const health = getHealthStatus(mockSession as SessionRecord);

    const expectedTokens = 145000;
    const expectedRatio = 145000 / 200000;

    let passed = true;

    console.log(`Test 1: Check tokensUsed equals currentContextLength (not cumulative)`);
    if (health.tokensUsed === expectedTokens) {
        console.log(`✅ Passed: Health tokensUsed is ${health.tokensUsed} (correctly ignored cumulative ${mockSession.tokenUsage!.cumulative})`);
    } else {
        console.log(`❌ Failed: Health tokensUsed is ${health.tokensUsed}, expected ${expectedTokens}`);
        passed = false;
    }

    console.log(`\nTest 2: Check fillRatio uses currentContextLength`);
    if (health.fillRatio === expectedRatio) {
        console.log(`✅ Passed: Health fillRatio is ${health.fillRatio}`);
    } else {
        console.log(`❌ Failed: Health fillRatio is ${health.fillRatio}, expected ${expectedRatio}`);
        passed = false;
    }

    if (passed) {
        console.log('\n✅ All context health calculation tests passed!');
        process.exit(0);
    } else {
        console.log('\n❌ Some tests failed.');
        process.exit(1);
    }
}

runTest().catch(console.error);
