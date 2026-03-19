// ── Colony: Built-in Skill — SendMessage ─────────────────
// Allows an agent to send a message to the current chat room.

import { Skill } from '../Skill.js';
import type { SkillExecutionContext, SkillResult } from '../../../types.js';

export class SendMessageSkill extends Skill {
    async execute(
        params: Record<string, unknown>,
        context: SkillExecutionContext
    ): Promise<SkillResult> {
        const content = params.content as string;
        if (!content?.trim()) {
            return { success: false, error: 'Message content cannot be empty' };
        }

        // mentions should be a single agent name (string), not an array
        const rawMentions = params.mentions;
        let mentions: string[] | undefined;

        if (typeof rawMentions === 'string' && rawMentions.trim()) {
            mentions = [rawMentions.trim()];
        } else if (rawMentions !== undefined && rawMentions !== null) {
            return { success: false, error: 'mentions must be a string (single agent name), not an array or other type' };
        }

        context.sendMessage(content, mentions);
        return { success: true, output: `Message sent${mentions ? ` (mentioned: ${mentions[0]})` : ''}` };
    }
}
