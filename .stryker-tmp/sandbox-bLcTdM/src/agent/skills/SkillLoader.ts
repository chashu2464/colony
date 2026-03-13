// @ts-nocheck
// ── Colony: Skill Loader ─────────────────────────────────
// Filesystem-based skill discovery following the Claude Agent Skills standard.
// Scans directories for SKILL.md files, parses YAML frontmatter,
// and returns SkillMetadata objects.

import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYAML } from 'yaml';
import { Logger } from '../../utils/Logger.js';

const log = new Logger('SkillLoader');

/**
 * Metadata extracted from a SKILL.md file.
 * Follows the Claude Agent Skills standard.
 */
export interface SkillMetadata {
    /** Skill name in kebab-case, e.g. "send-message" */
    name: string;
    /** Brief description of what the skill does and when to use it */
    description: string;
    /** The markdown body of SKILL.md (instructions, examples, etc.) */
    instructions: string;
    /** Absolute path to the skill directory */
    directory: string;
    /** Whether this skill has a scripts/ subdirectory */
    hasScripts: boolean;
}

/**
 * Validates that a skill name conforms to the Claude standard:
 * lowercase letters, numbers, and hyphens only, max 64 chars.
 */
function isValidSkillName(name: string): boolean {
    return /^[a-z0-9-]+$/.test(name) && name.length <= 64;
}

/**
 * Parse the YAML frontmatter and markdown body from a SKILL.md file.
 * Frontmatter is delimited by `---` at the top of the file.
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
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
        const frontmatter = parseYAML(yamlStr) as Record<string, unknown>;
        return { frontmatter, body };
    } catch (err) {
        log.warn(`Failed to parse YAML frontmatter: ${(err as Error).message}`);
        return { frontmatter: {}, body: content };
    }
}

/**
 * Load a single skill from a directory containing SKILL.md.
 */
export function loadSkillFromDir(skillDir: string): SkillMetadata | null {
    const skillFile = path.join(skillDir, 'SKILL.md');

    if (!fs.existsSync(skillFile)) {
        log.debug(`No SKILL.md found in ${skillDir}, skipping`);
        return null;
    }

    const content = fs.readFileSync(skillFile, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);

    const name = frontmatter.name as string | undefined;
    const description = frontmatter.description as string | undefined;

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
export function discoverSkills(rootDir: string): SkillMetadata[] {
    if (!fs.existsSync(rootDir)) {
        log.warn(`Skills directory not found: ${rootDir}`);
        return [];
    }

    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    const skills: SkillMetadata[] = [];

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;

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
