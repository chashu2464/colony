import { invoke } from '../src/llm/CLIInvoker.js';
import { Logger } from '../src/utils/Logger.js';

const log = new Logger('ConcurrencyTest');

async function testConcurrency() {
    console.log('=== Concurrency Test: CLIInvoker ===');
    process.env.COLONY_MAX_CLI_CONCURRENCY = '1';
    
    // We'll mock some parts or just call invoke with a dummy prompt
    // Since invoke calls spawn(cliPath, ...), we can check logs for "CLI slot full"
    
    const p1 = invoke('gemini', 'Say p1', { sessionName: 'c1' });
    const p2 = invoke('gemini', 'Say p2', { sessionName: 'c2' });
    
    try {
        await Promise.all([p1, p2]);
        console.log('✓ Both invocations finished');
    } catch (err) {
        console.error('✗ Error during invocations:', err);
    }
}

testConcurrency().catch(console.error);
