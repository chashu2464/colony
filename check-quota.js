// 临时诊断脚本
import { RateLimitManager } from './src/llm/RateLimitManager.js';

const manager = new RateLimitManager();

console.log('=== Rate Limit Status ===');
const allStatus = manager.getAllStatus();
for (const quota of allStatus) {
    console.log(`\n${quota.model}:`);
    console.log(`  Requests: ${quota.currentUsage.requests}/${quota.requestsPerMinute}`);
    console.log(`  Tokens (min): ${quota.currentUsage.tokens}/${quota.tokensPerMinute}`);
    console.log(`  Tokens (day): ${quota.currentUsage.dailyTokens}/${quota.tokensPerDay}`);
    console.log(`  Can use: ${manager.canUse(quota.model)}`);
    console.log(`  Window started: ${quota.windowStartedAt}`);
}
