"use strict";
// ── Colony: Agent Config Loader ──────────────────────────
// Loads agent configurations from YAML files.
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadAgentConfig = loadAgentConfig;
exports.loadAllAgentConfigs = loadAllAgentConfigs;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml_1 = __importDefault(require("yaml"));
const Logger_js_1 = require("../utils/Logger.js");
const log = new Logger_js_1.Logger('AgentConfig');
const VALID_CLIS = ['claude', 'gemini', 'codex'];
/**
 * Load a single agent config from a YAML file.
 */
function loadAgentConfig(filePath) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = yaml_1.default.parse(raw);
    // Validate required fields
    if (!parsed.id || typeof parsed.id !== 'string') {
        throw new Error(`Agent config "${filePath}": missing or invalid "id"`);
    }
    if (!parsed.name || typeof parsed.name !== 'string') {
        throw new Error(`Agent config "${filePath}": missing or invalid "name"`);
    }
    if (!parsed.personality || typeof parsed.personality !== 'string') {
        throw new Error(`Agent config "${filePath}": missing or invalid "personality"`);
    }
    const model = parsed.model;
    if (!model || !model.primary) {
        throw new Error(`Agent config "${filePath}": missing "model.primary"`);
    }
    const primary = model.primary;
    if (!VALID_CLIS.includes(primary)) {
        throw new Error(`Agent config "${filePath}": invalid primary model "${primary}"`);
    }
    const fallback = model.fallback?.filter((f) => VALID_CLIS.includes(f));
    const config = {
        id: parsed.id,
        name: parsed.name,
        model: { primary, fallback },
        personality: parsed.personality.trim(),
        skills: parsed.skills ?? ['send_message'],
        rules: parsed.rules,
        isDefault: parsed.is_default ?? false,
    };
    log.info(`Loaded agent config: ${config.id} (${config.name})`);
    return config;
}
/**
 * Load all agent configs from a directory.
 */
function loadAllAgentConfigs(dirPath) {
    if (!fs.existsSync(dirPath)) {
        log.warn(`Agent config directory not found: ${dirPath}`);
        return [];
    }
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    return files.map(f => loadAgentConfig(path.join(dirPath, f)));
}
//# sourceMappingURL=AgentConfig.js.map