"use strict";
// ── Colony: Logger Utility ────────────────────────────────
// Structured console logger with component tagging.
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
exports.Logger = void 0;
exports.setLogLevel = setLogLevel;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const util_1 = require("util");
const LEVEL_ORDER = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
const LEVEL_COLORS = {
    debug: '\x1b[90m', // gray
    info: '\x1b[36m', // cyan
    warn: '\x1b[33m', // yellow
    error: '\x1b[31m', // red
};
const RESET = '\x1b[0m';
let globalLevel = 'info';
function setLogLevel(level) {
    globalLevel = level;
}
class Logger {
    component;
    constructor(component) {
        this.component = component;
    }
    debug(msg, ...args) {
        this.log('debug', msg, ...args);
    }
    info(msg, ...args) {
        this.log('info', msg, ...args);
    }
    warn(msg, ...args) {
        this.log('warn', msg, ...args);
    }
    error(msg, ...args) {
        this.log('error', msg, ...args);
    }
    log(level, msg, ...args) {
        if (LEVEL_ORDER[level] < LEVEL_ORDER[globalLevel])
            return;
        const ts = new Date().toISOString();
        const color = LEVEL_COLORS[level];
        const prefix = `${color}[${ts}] [${level.toUpperCase()}] [${this.component}]${RESET}`;
        // Console output
        console.log(prefix, msg, ...args);
        // File output (persistence)
        if (process.env.LOG_TO_FILE !== 'false') {
            this.logToFile(level, ts, msg, ...args);
        }
    }
    /**
     * Persist log to a file, rotated by date.
     */
    logToFile(level, ts, msg, ...args) {
        try {
            const logDir = process.env.LOG_DIR || 'logs';
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
            const dateStr = ts.split('T')[0];
            const logFile = path.join(logDir, `colony-${dateStr}.log`);
            const content = (0, util_1.format)(msg, ...args);
            const logEntry = `[${ts}] [${level.toUpperCase()}] [${this.component}] ${content}\n`;
            fs.appendFileSync(logFile, logEntry);
        }
        catch (err) {
            // Fail silently to avoid interrupting the main flow
        }
    }
}
exports.Logger = Logger;
//# sourceMappingURL=Logger.js.map