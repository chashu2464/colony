import type { SkillMetadata } from './SkillLoader.js';
import type { SkillExecutionContext, SkillResult } from '../../types.js';
export declare abstract class Skill {
    /** Metadata loaded from SKILL.md (name, description, instructions). */
    metadata: SkillMetadata;
    /** The skill name (from SKILL.md frontmatter). */
    get name(): string;
    abstract execute(params: Record<string, unknown>, context: SkillExecutionContext): Promise<SkillResult>;
    /**
     * Render this skill's instructions for the LLM prompt.
     * Returns the full SKILL.md body (instructions, parameters, examples).
     */
    toPromptDescription(): string;
}
