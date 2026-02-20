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

        // LLMs may send mentions as a string ("a,b") or an array (["a","b"])
        const rawMentions = params.mentions;
        let mentions: string[] | undefined;

        if (Array.isArray(rawMentions)) {
            mentions = rawMentions.map(String).filter(Boolean);
        } else if (typeof rawMentions === 'string' && rawMentions.trim()) {
            mentions = rawMentions.split(',').map(s => s.trim()).filter(Boolean);
        }

        context.sendMessage(content, mentions);
        return { success: true, output: `Message sent${mentions ? ` (mentioned: ${mentions.join(', ')})` : ''}` };
    }
}
