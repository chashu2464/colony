"use strict";
// ── Colony: Skill Manager ────────────────────────────────
// Loads skills from SKILL.md files (Claude Agent Skills standard),
// wires built-in TypeScript handlers, and supports custom script-based skills.
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
exports.SkillManager = void 0;
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const Logger_js_1 = require("../../utils/Logger.js");
const Skill_js_1 = require("./Skill.js");
const SkillLoader_js_1 = require("./SkillLoader.js");
// Built-in skill handlers (execute logic only, no metadata)
const SendMessage_js_1 = require("./builtins/SendMessage.js");
const ReadFile_js_1 = require("./builtins/ReadFile.js");
const WriteFile_js_1 = require("./builtins/WriteFile.js");
const RunCommand_js_1 = require("./builtins/RunCommand.js");
const GetMessages_js_1 = require("./builtins/GetMessages.js");
const log = new Logger_js_1.Logger('SkillManager');
/**
 * Map from SKILL.md kebab-case names to built-in TypeScript handler classes.
 * When a skill has a built-in handler, the handler is used for execution.
 * Otherwise, the skill is treated as a custom script-based skill.
 */
const BUILTIN_HANDLERS = {
    'send-message': SendMessage_js_1.SendMessageSkill,
    'get-messages': GetMessages_js_1.GetMessagesSkill,
    'read-file': ReadFile_js_1.ReadFileSkill,
    'write-file': WriteFile_js_1.WriteFileSkill,
    'run-command': RunCommand_js_1.RunCommandSkill,
};
/**
 * A wrapper skill for custom (non-built-in) skills that executes scripts.
 */
class ScriptSkill extends Skill_js_1.Skill {
    async execute(params, _context) {
        if (!this.metadata.hasScripts) {
            // No scripts — this is an instructions-only skill
            return {
                success: true,
                output: `Skill "${this.metadata.name}" provides instructions only (see SKILL.md).`,
            };
        }
        // Look for a handler script in the scripts/ directory
        const scriptsDir = path.join(this.metadata.directory, 'scripts');
        const handlerCandidates = ['handler.ts', 'handler.js', 'handler.py', 'handler.sh'];
        let handler = null;
        for (const candidate of handlerCandidates) {
            const fullPath = path.join(scriptsDir, candidate);
            try {
                const fs = await import('fs');
                if (fs.existsSync(fullPath)) {
                    handler = fullPath;
                    break;
                }
            }
            catch {
                continue;
            }
        }
        if (!handler) {
            return {
                success: false,
                error: `No handler script found in ${scriptsDir}. Expected one of: ${handlerCandidates.join(', ')}`,
            };
        }
        // Execute the script with params as JSON via stdin
        const paramsJson = JSON.stringify(params);
        try {
            let command;
            if (handler.endsWith('.py')) {
                command = `echo '${paramsJson.replace(/'/g, "'\\''")}' | python3 "${handler}"`;
            }
            else if (handler.endsWith('.sh')) {
                command = `echo '${paramsJson.replace(/'/g, "'\\''")}' | bash "${handler}"`;
            }
            else if (handler.endsWith('.ts')) {
                command = `echo '${paramsJson.replace(/'/g, "'\\''")}' | npx tsx "${handler}"`;
            }
            else {
                command = `echo '${paramsJson.replace(/'/g, "'\\''")}' | node "${handler}"`;
            }
            const output = (0, child_process_1.execSync)(command, {
                encoding: 'utf-8',
                timeout: 30000,
                maxBuffer: 1024 * 1024,
                cwd: this.metadata.directory,
            });
            return { success: true, output: output.trim() };
        }
        catch (err) {
            const execErr = err;
            const output = [execErr.stdout, execErr.stderr].filter(Boolean).join('\n').trim();
            return {
                success: false,
                error: output || execErr.message,
            };
        }
    }
}
class SkillManager {
    skills = new Map();
    allMetadata = [];
    /**
     * Discover all skills from the filesystem (SKILL.md-based).
     * This should be called once during initialization.
     */
    discoverFromDirectory(skillsDir) {
        this.allMetadata = (0, SkillLoader_js_1.discoverSkills)(skillsDir);
        log.info(`Discovered ${this.allMetadata.length} skill(s) from ${skillsDir}`);
    }
    /**
     * Load skills by name (from agent config).
     * Names should be kebab-case matching SKILL.md names.
     */
    loadSkills(skillNames) {
        for (const name of skillNames) {
            if (this.skills.has(name))
                continue;
            // Find metadata for this skill
            const metadata = this.allMetadata.find(m => m.name === name);
            if (!metadata) {
                log.warn(`Skill "${name}" not found in discovered skills — skipping`);
                continue;
            }
            // Check if we have a built-in TypeScript handler
            const Handler = BUILTIN_HANDLERS[name];
            let skill;
            if (Handler) {
                skill = new Handler();
                log.debug(`Loaded built-in skill: ${name}`);
            }
            else {
                skill = new ScriptSkill();
                log.debug(`Loaded custom skill: ${name} (script-based)`);
            }
            // Inject metadata from SKILL.md
            skill.metadata = metadata;
            this.skills.set(name, skill);
        }
    }
    /**
     * Register a custom skill instance (programmatic registration).
     */
    register(skill) {
        this.skills.set(skill.name, skill);
        log.debug(`Registered custom skill: ${skill.name}`);
    }
    /**
     * Get a skill by name.
     */
    get(name) {
        return this.skills.get(name);
    }
    /**
     * Get all loaded skills.
     */
    getAll() {
        return Array.from(this.skills.values());
    }
    /**
     * Get all discovered skill metadata (for prompt-level awareness).
     */
    getAllMetadata() {
        return this.allMetadata;
    }
    /**
     * Generate the full skill descriptions block for the LLM prompt.
     * Uses the SKILL.md instructions (markdown body) for each loaded skill.
     */
    toPromptBlock() {
        const skills = this.getAll();
        if (skills.length === 0)
            return '';
        const header = `## 可用技能 (Available Skills)\n\n` +
            `你可以通过输出 JSON 代码块来调用技能：\n` +
            '```json\n{"skill": "<skill-name>", "params": {<parameters>}}\n```\n';
        const descriptions = skills.map(s => s.toPromptDescription()).join('\n\n---\n\n');
        return header + '\n' + descriptions;
    }
}
exports.SkillManager = SkillManager;
//# sourceMappingURL=SkillManager.js.map