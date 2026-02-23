"use strict";
// ── Colony: Skill Base Class ─────────────────────────────
// All agent skills extend this abstract class.
// Metadata is loaded from SKILL.md files (Claude Agent Skills standard).
Object.defineProperty(exports, "__esModule", { value: true });
exports.Skill = void 0;
class Skill {
    /** Metadata loaded from SKILL.md (name, description, instructions). */
    metadata;
    /** The skill name (from SKILL.md frontmatter). */
    get name() {
        return this.metadata.name;
    }
    /**
     * Render this skill's instructions for the LLM prompt.
     * Returns the full SKILL.md body (instructions, parameters, examples).
     */
    toPromptDescription() {
        return this.metadata.instructions;
    }
}
exports.Skill = Skill;
