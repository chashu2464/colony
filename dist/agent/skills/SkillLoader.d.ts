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
 * Load a single skill from a directory containing SKILL.md.
 */
export declare function loadSkillFromDir(skillDir: string): SkillMetadata | null;
/**
 * Discover all skills from a root directory.
 * Each subdirectory containing a SKILL.md is treated as a skill.
 */
export declare function discoverSkills(rootDir: string): SkillMetadata[];
