"use strict";
// ── Colony: Session Manager ──────────────────────────────
// Persists and restores chat room sessions to disk.
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
exports.SessionManager = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const Logger_js_1 = require("../utils/Logger.js");
const log = new Logger_js_1.Logger('SessionManager');
class SessionManager {
    dataDir;
    constructor(dataDir) {
        this.dataDir = dataDir ?? path.join(process.cwd(), '.data', 'sessions');
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }
    /**
     * Save a session (room state) to disk.
     */
    async saveSession(sessionId, data) {
        const filePath = this.sessionPath(sessionId);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        log.debug(`Session saved: ${sessionId}`);
    }
    /**
     * Load a session from disk.
     */
    async loadSession(sessionId) {
        const filePath = this.sessionPath(sessionId);
        if (!fs.existsSync(filePath))
            return null;
        try {
            const raw = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(raw);
        }
        catch (err) {
            log.error(`Failed to load session ${sessionId}:`, err);
            return null;
        }
    }
    /**
     * List all saved session IDs (excludes agent-specific chain files).
     */
    async listSessions() {
        const files = fs.readdirSync(this.dataDir);
        return files
            .filter(f => f.endsWith('.json') && !f.includes('-'))
            .map(f => path.basename(f, '.json'));
    }
    /**
     * Delete a saved session.
     */
    async deleteSession(sessionId) {
        const filePath = this.sessionPath(sessionId);
        if (!fs.existsSync(filePath))
            return false;
        fs.unlinkSync(filePath);
        log.debug(`Session deleted: ${sessionId}`);
        return true;
    }
    sessionPath(sessionId) {
        return path.join(this.dataDir, `${sessionId}.json`);
    }
}
exports.SessionManager = SessionManager;
//# sourceMappingURL=SessionManager.js.map