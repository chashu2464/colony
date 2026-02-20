"use strict";
// ── Colony: Main Entry Script ────────────────────────────
// Start the Colony system with the web server.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
// Load environment variables from .env file
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const Colony_js_1 = require("./Colony.js");
const index_js_1 = require("./server/index.js");
const Logger_js_1 = require("./utils/Logger.js");
const log = new Logger_js_1.Logger('Main');
// Set log level from environment variable
const logLevel = (process.env.LOG_LEVEL || 'info');
(0, Logger_js_1.setLogLevel)(logLevel);
async function main() {
    const port = parseInt(process.env.PORT ?? '3001', 10);
    log.info('Starting Colony...');
    const colony = new Colony_js_1.Colony({
        agentConfigDir: process.env.AGENT_CONFIG_DIR,
        dataDir: process.env.DATA_DIR,
    });
    // Restore saved sessions
    await colony.initialize();
    const { start } = (0, index_js_1.createColonyServer)({ colony, port });
    await start();
    log.info('Colony is ready.');
    log.info(`Dashboard: http://localhost:${port}`);
    log.info(`API:       http://localhost:${port}/api`);
}
main().catch(err => {
    log.error('Fatal error:', err);
    process.exit(1);
});
//# sourceMappingURL=main.js.map