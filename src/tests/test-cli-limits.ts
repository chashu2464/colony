import { getContextLimit } from '../session/SessionRecord.js';

async function verifyCliLimits() {
    console.log('--- CLI Context Limits Verification ---\n');

    const clis: ('claude' | 'gemini' | 'codex')[] = ['claude', 'gemini', 'codex'];

    const expectedLimits = {
        'claude': 200000,
        'gemini': 1000000,
        'codex': 200000
    };

    let allPassed = true;

    for (const cli of clis) {
        const limit = getContextLimit(cli);
        const expected = expectedLimits[cli];

        console.log(`Checking limit for CLI: ${cli}`);
        if (limit === expected) {
            console.log(`✅ Passed: Limit is correctly set to ${limit}`);
        } else {
            console.log(`❌ Failed: Expected ${expected}, but got ${limit}`);
            allPassed = false;
        }
    }

    if (allPassed) {
        console.log('\n✅ All CLI limits are correctly configured according to specifications.');
        process.exit(0);
    } else {
        console.log('\n❌ Some CLI limits did not match expected values.');
        process.exit(1);
    }
}

verifyCliLimits().catch(console.error);
