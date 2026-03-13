// @ts-nocheck
// ── Colony: Skill Manager ────────────────────────────────
// Loads skills from SKILL.md files (Claude Agent Skills standard),
// wires built-in TypeScript handlers, and supports custom script-based skills.

import * as path from 'path';
import { execSync } from 'child_process';
import { Logger } from '../../utils/Logger.js';
import { Skill } from './Skill.js';
import { discoverSkills, type SkillMetadata } from './SkillLoader.js';
import type { SkillExecutionContext, SkillResult } from '../../types.js';

// Built-in skill handlers (execute logic only, no metadata)
import { SendMessageSkill } from './builtins/SendMessage.js';
import { ReadFileSkill } from './builtins/ReadFile.js';
import { WriteFileSkill } from './builtins/WriteFile.js';
import { RunCommandSkill } from './builtins/RunCommand.js';
import { GetMessagesSkill } from './builtins/GetMessages.js';

const log = new Logger('SkillManager');

/**
 * Map from SKILL.md kebab-case names to built-in TypeScript handler classes.
 * When a skill has a built-in handler, the handler is used for execution.
 * Otherwise, the skill is treated as a custom script-based skill.
 */
const BUILTIN_HANDLERS: Record<string, new () => Skill> = {
    'send-message': SendMessageSkill,
    'get-messages': GetMessagesSkill,
    'read-file': ReadFileSkill,
    'write-file': WriteFileSkill,
    'run-command': RunCommandSkill,
};

/**
 * A wrapper skill for custom (non-built-in) skills that executes scripts.
 */
class ScriptSkill extends Skill {
    async execute(
        params: Record<string, unknown>,
        _context: SkillExecutionContext
    ): Promise<SkillResult> {
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
        let handler: string | null = null;

        for (const candidate of handlerCandidates) {
            const fullPath = path.join(scriptsDir, candidate);
            try {
                const fs = await import('fs');
                if (fs.existsSync(fullPath)) {
                    handler = fullPath;
                    break;
                }
            } catch {
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
            let command: string;
            if (handler.endsWith('.py')) {
                command = `echo '${paramsJson.replace(/'/g, "'\\''")}' | python3 "${handler}"`;
            } else if (handler.endsWith('.sh')) {
                command = `echo '${paramsJson.replace(/'/g, "'\\''")}' | bash "${handler}"`;
            } else if (handler.endsWith('.ts')) {
                command = `echo '${paramsJson.replace(/'/g, "'\\''")}' | npx tsx "${handler}"`;
            } else {
                command = `echo '${paramsJson.replace(/'/g, "'\\''")}' | node "${handler}"`;
            }

            const output = execSync(command, {
                encoding: 'utf-8',
                timeout: 30000,
                maxBuffer: 1024 * 1024,
                cwd: this.metadata.directory,
            });

            return { success: true, output: output.trim() };
        } catch (err) {
            const execErr = err as { stdout?: string; stderr?: string; message: string };
            const output = [execErr.stdout, execErr.stderr].filter(Boolean).join('\n').trim();
            return {
                success: false,
                error: output || execErr.message,
            };
        }
    }
}

export class SkillManager {
    private skills = new Map<string, Skill>();
    private allMetadata: SkillMetadata[] = [];

    /**
     * Discover all skills from the filesystem (SKILL.md-based).
     * This should be called once during initialization.
     */
    discoverFromDirectory(skillsDir: string): void {
        this.allMetadata = discoverSkills(skillsDir);
        log.info(`Discovered ${this.allMetadata.length} skill(s) from ${skillsDir}`);
    }

    /**
     * Load skills by name (from agent config).
     * Names should be kebab-case matching SKILL.md names.
     */
    loadSkills(skillNames: string[]): void {
        for (const name of skillNames) {
            if (this.skills.has(name)) continue;

            // Find metadata for this skill
            const metadata = this.allMetadata.find(m => m.name === name);
            if (!metadata) {
                log.warn(`Skill "${name}" not found in discovered skills — skipping`);
                continue;
            }

            // Check if we have a built-in TypeScript handler
            const Handler = BUILTIN_HANDLERS[name];
            let skill: Skill;

            if (Handler) {
                skill = new Handler();
                log.debug(`Loaded built-in skill: ${name}`);
            } else {
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
    register(skill: Skill): void {
        this.skills.set(skill.name, skill);
        log.debug(`Registered custom skill: ${skill.name}`);
    }

    /**
     * Get a skill by name.
     */
    get(name: string): Skill | undefined {
        return this.skills.get(name);
    }

    /**
     * Get all loaded skills.
     */
    getAll(): Skill[] {
        return Array.from(this.skills.values());
    }

    /**
     * Get all discovered skill metadata (for prompt-level awareness).
     */
    getAllMetadata(): SkillMetadata[] {
        return this.allMetadata;
    }

    /**
     * Generate the full skill descriptions block for the LLM prompt.
     * Uses the SKILL.md instructions (markdown body) for each loaded skill.
     */
    toPromptBlock(): string {
        const skills = this.getAll();
        if (skills.length === 0) return '';

        const header = `## 可用技能 (Available Skills)\n\n` +
            `你可以通过调用对应的工具或执行命令来使用这些技能。每个技能的具体用法如下：\n`;

        const descriptions = skills.map(s => s.toPromptDescription()).join('\n\n---\n\n');

        return header + '\n' + descriptions;
    }
}
