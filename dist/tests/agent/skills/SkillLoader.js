"use strict";
// ── Colony: Skill Loader ─────────────────────────────────
// Filesystem-based skill discovery following the Claude Agent Skills standard.
// Scans directories for SKILL.md files, parses YAML frontmatter,
// and returns SkillMetadata objects.
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
exports.loadSkillFromDir = loadSkillFromDir;
exports.discoverSkills = discoverSkills;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml_1 = require("yaml");
const Logger_js_1 = require("../../utils/Logger.js");
const log = new Logger_js_1.Logger('SkillLoader');
/**
 * Validates that a skill name conforms to the Claude standard:
 * lowercase letters, numbers, and hyphens only, max 64 chars.
 */
function isValidSkillName(name) {
    return /^[a-z0-9-]+$/.test(name) && name.length <= 64;
}
/**
 * Parse the YAML frontmatter and markdown body from a SKILL.md file.
 * Frontmatter is delimited by `---` at the top of the file.
 */
function parseFrontmatter(content) {
    const trimmed = content.trimStart();
    if (!trimmed.startsWith('---')) {
        return { frontmatter: {}, body: content };
    }
    const endIdx = trimmed.indexOf('---', 3);
    if (endIdx === -1) {
        return { frontmatter: {}, body: content };
    }
    const yamlStr = trimmed.substring(3, endIdx).trim();
    const body = trimmed.substring(endIdx + 3).trim();
    try {
        const frontmatter = (0, yaml_1.parse)(yamlStr);
        return { frontmatter, body };
    }
    catch (err) {
        log.warn(`Failed to parse YAML frontmatter: ${err.message}`);
        return { frontmatter: {}, body: content };
    }
}
/**
 * Load a single skill from a directory containing SKILL.md.
 */
function loadSkillFromDir(skillDir) {
    const skillFile = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(skillFile)) {
        log.debug(`No SKILL.md found in ${skillDir}, skipping`);
        return null;
    }
    const content = fs.readFileSync(skillFile, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);
    const name = frontmatter.name;
    const description = frontmatter.description;
    if (!name) {
        log.warn(`SKILL.md in ${skillDir} is missing required 'name' field`);
        return null;
    }
    if (!description) {
        log.warn(`SKILL.md for "${name}" is missing required 'description' field`);
        return null;
    }
    if (!isValidSkillName(name)) {
        log.warn(`Invalid skill name "${name}" — must be lowercase letters, numbers, hyphens, max 64 chars`);
        return null;
    }
    if (description.length > 1024) {
        log.warn(`Skill "${name}" description exceeds 1024 chars (${description.length})`);
    }
    const scriptsDir = path.join(skillDir, 'scripts');
    const hasScripts = fs.existsSync(scriptsDir) && fs.statSync(scriptsDir).isDirectory();
    return {
        name,
        description,
        instructions: body,
        directory: skillDir,
        hasScripts,
    };
}
/**
 * Discover all skills from a root directory.
 * Each subdirectory containing a SKILL.md is treated as a skill.
 */
function discoverSkills(rootDir) {
    if (!fs.existsSync(rootDir)) {
        log.warn(`Skills directory not found: ${rootDir}`);
        return [];
    }
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    const skills = [];
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        const skillDir = path.join(rootDir, entry.name);
        const metadata = loadSkillFromDir(skillDir);
        if (metadata) {
            skills.push(metadata);
            log.info(`Discovered skill: ${metadata.name} (${skillDir})`);
        }
    }
    log.info(`Discovered ${skills.length} skill(s) from ${rootDir}`);
    return skills;
}
