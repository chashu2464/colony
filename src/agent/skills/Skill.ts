// ── Colony: Skill Base Class ─────────────────────────────
// All agent skills extend this abstract class.
// Metadata is loaded from SKILL.md files (Claude Agent Skills standard).

import type { SkillMetadata } from './SkillLoader.js';
import type { SkillExecutionContext, SkillResult } from '../../types.js';

export abstract class Skill {
    /** Metadata loaded from SKILL.md (name, description, instructions). */
    metadata!: SkillMetadata;

    /** The skill name (from SKILL.md frontmatter). */
    get name(): string {
        return this.metadata.name;
    }

    abstract execute(
        params: Record<string, unknown>,
        context: SkillExecutionContext
    ): Promise<SkillResult>;

    /**
     * Render this skill's instructions for the LLM prompt.
     * Returns the full SKILL.md body (instructions, parameters, examples),
     * but with relative script paths (like "scripts/handler.sh") resolved to absolute paths.
     */
    toPromptDescription(): string {
        let instructions = this.metadata.instructions;
        const skillDir = this.metadata.directory;

        // Replace "scripts/handler.sh" or similar with absolute path
        // Matches: "scripts/handler.sh", "./scripts/handler.sh"
        const scriptRegex = /([\s"'])(\.?\/)?scripts\/handler\.(sh|js|py|ts)([\s"'])/g;
        
        instructions = instructions.replace(scriptRegex, (match, p1, p2, p3, p4) => {
            const absolutePath = `${skillDir}/scripts/handler.${p3}`;
            return `${p1}${absolutePath}${p4}`;
        });

        return instructions;
    }
}
