// ── Colony: Main Entry Script ────────────────────────────
// Start the Colony system with the web server.

// Load environment variables from .env file
import * as dotenv from 'dotenv';
dotenv.config();

import { Colony } from './Colony.js';
import { createColonyServer } from './server/index.js';
import { Logger, setLogLevel } from './utils/Logger.js';

const log = new Logger('Main');

// Set log level from environment variable
const logLevel = (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error';
setLogLevel(logLevel);

async function main() {
    const port = parseInt(process.env.PORT ?? '3001', 10);

    log.info('Starting Colony...');

    const colony = new Colony({
        agentConfigDir: process.env.AGENT_CONFIG_DIR,
        dataDir: process.env.DATA_DIR,
    });

    // Restore saved sessions
    await colony.initialize();

    const { start } = createColonyServer({ colony, port });
    await start();

    log.info('Colony is ready.');
    log.info(`Dashboard: http://localhost:${port}`);
    log.info(`API:       http://localhost:${port}/api`);
}

main().catch(err => {
    log.error('Fatal error:', err);
    process.exit(1);
});
