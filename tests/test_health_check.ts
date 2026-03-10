
import { verifyCLI } from '../src/llm/CLIInvoker';

async function testHealth() {
    console.log('--- CLI Health Check Test ---');
    
    const clis: any[] = ['codex', 'gemini'];
    
    for (const cli of clis) {
        const healthy = await verifyCLI(cli);
        console.log(`${cli} is healthy: ${healthy}`);
    }
}

testHealth();
