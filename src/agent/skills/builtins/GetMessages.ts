// ── Colony: Built-in Skill — GetMessages ─────────────────
// Allows agents to fetch recent chat room messages.

import { Skill } from '../Skill.js';
import type { SkillExecutionContext, SkillResult } from '../../../types.js';
import type { Message } from '../../../types.js';

export class GetMessagesSkill extends Skill {
    async execute(
        params: Record<string, unknown>,
        context: SkillExecutionContext
    ): Promise<SkillResult> {
        const limit = (params.limit as number) ?? 20;

        try {
            const messages: Message[] = context.getMessages(limit);

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
        } catch (err) {
            return {
                success: false,
                error: `获取消息失败: ${(err as Error).message}`,
            };
        }
    }
}
