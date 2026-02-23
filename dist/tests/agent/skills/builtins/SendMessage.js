"use strict";
// ── Colony: Built-in Skill — SendMessage ─────────────────
// Allows an agent to send a message to the current chat room.
Object.defineProperty(exports, "__esModule", { value: true });
exports.SendMessageSkill = void 0;
const Skill_js_1 = require("../Skill.js");
class SendMessageSkill extends Skill_js_1.Skill {
    async execute(params, context) {
        const content = params.content;
        if (!content?.trim()) {
            return { success: false, error: 'Message content cannot be empty' };
        }
        // LLMs may send mentions as a string ("a,b") or an array (["a","b"])
        const rawMentions = params.mentions;
        let mentions;
        if (Array.isArray(rawMentions)) {
            mentions = rawMentions.map(String).filter(Boolean);
        }
        else if (typeof rawMentions === 'string' && rawMentions.trim()) {
            mentions = rawMentions.split(',').map(s => s.trim()).filter(Boolean);
        }
        context.sendMessage(content, mentions);
        return { success: true, output: `Message sent${mentions ? ` (mentioned: ${mentions.join(', ')})` : ''}` };
    }
}
exports.SendMessageSkill = SendMessageSkill;
