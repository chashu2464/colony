"use strict";
// ── Colony: Built-in Skill — GetMessages ─────────────────
// Allows agents to fetch recent chat room messages.
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetMessagesSkill = void 0;
const Skill_js_1 = require("../Skill.js");
class GetMessagesSkill extends Skill_js_1.Skill {
    async execute(params, context) {
        const limit = params.limit ?? 20;
        try {
            const messages = context.getMessages(limit);
            if (messages.length === 0) {
                return { success: true, output: '暂无聊天消息。' };
            }
            const formatted = messages.map(msg => {
                const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN');
                const mentions = msg.mentions.length > 0
                    ? ` [@${msg.mentions.join(', @')}]`
                    : '';
                return `[${time}] ${msg.sender.name} (${msg.sender.type})${mentions}: ${msg.content}`;
            }).join('\n');
            return {
                success: true,
                output: `最近 ${messages.length} 条消息:\n${formatted}`,
            };
        }
        catch (err) {
            return {
                success: false,
                error: `获取消息失败: ${err.message}`,
            };
        }
    }
}
exports.GetMessagesSkill = GetMessagesSkill;
//# sourceMappingURL=GetMessages.js.map