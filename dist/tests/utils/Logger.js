"use strict";
// ── Colony: Logger Utility ────────────────────────────────
// Structured console logger with component tagging.
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
exports.setLogLevel = setLogLevel;
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
        console.log(prefix, msg, ...args);
    }
}
exports.Logger = Logger;
