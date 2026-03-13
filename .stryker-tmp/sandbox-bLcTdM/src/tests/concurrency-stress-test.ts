// @ts-nocheck

import { invoke } from '../llm/CLIInvoker.js';
import { Logger } from '../utils/Logger.js';

const log = new Logger('ConcurrencyStress');

async function runTest() {
  log.info('Starting concurrency stress test: 5 simultaneous invocations...');
  
  const tasks = Array.from({ length: 5 }).map((_, i) => {
    log.info(`Launching Task ${i}...`);
    return invoke('gemini', `echo "Task ${i} is running"`, {
      sessionName: `stress-test-${i}`
    }).then((res: any) => {
      log.info(`Task ${i} finished: ${res.text.trim()}`);
      return res;
    }).catch((err: any) => {
      log.error(`Task ${i} failed: ${err.message}`);
      throw err;
    });
  });

  const results = await Promise.allSettled(tasks);
  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  log.info(`Test complete. Succeeded: ${succeeded}, Failed: ${failed}`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
