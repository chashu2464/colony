// ── Colony: Logger Utility ────────────────────────────────
// Structured console logger with component tagging.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
    debug: '\x1b[90m',  // gray
    info: '\x1b[36m',   // cyan
    warn: '\x1b[33m',   // yellow
    error: '\x1b[31m',  // red
};

const RESET = '\x1b[0m';

let globalLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
    globalLevel = level;
}

export class Logger {
    constructor(private component: string) { }

    debug(msg: string, ...args: unknown[]): void {
        this.log('debug', msg, ...args);
    }

    info(msg: string, ...args: unknown[]): void {
        this.log('info', msg, ...args);
    }

    warn(msg: string, ...args: unknown[]): void {
        this.log('warn', msg, ...args);
    }

    error(msg: string, ...args: unknown[]): void {
        this.log('error', msg, ...args);
    }

    private log(level: LogLevel, msg: string, ...args: unknown[]): void {
        if (LEVEL_ORDER[level] < LEVEL_ORDER[globalLevel]) return;
        const ts = new Date().toISOString();
        const color = LEVEL_COLORS[level];
        const prefix = `${color}[${ts}] [${level.toUpperCase()}] [${this.component}]${RESET}`;
        console.log(prefix, msg, ...args);
    }
}
