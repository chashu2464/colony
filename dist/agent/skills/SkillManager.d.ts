import { Skill } from './Skill.js';
import { type SkillMetadata } from './SkillLoader.js';
export declare class SkillManager {
    private skills;
    private allMetadata;
    /**
     * Discover all skills from the filesystem (SKILL.md-based).
     * This should be called once during initialization.
     */
    discoverFromDirectory(skillsDir: string): void;
    /**
     * Load skills by name (from agent config).
     * Names should be kebab-case matching SKILL.md names.
     */
    loadSkills(skillNames: string[]): void;
    /**
     * Register a custom skill instance (programmatic registration).
     */
    register(skill: Skill): void;
    /**
     * Get a skill by name.
     */
    get(name: string): Skill | undefined;
    /**
     * Get all loaded skills.
     */
    getAll(): Skill[];
    /**
     * Get all discovered skill metadata (for prompt-level awareness).
     */
    getAllMetadata(): SkillMetadata[];
    /**
     * Generate the full skill descriptions block for the LLM prompt.
     * Uses the SKILL.md instructions (markdown body) for each loaded skill.
     */
    toPromptBlock(): string;
}
