import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import type { Message } from '../types.js';

export interface MentionRoutingRule {
    sourceMention: string;
    intentKeywords: string[];
    targetMention: string;
    routingHint: string;
}

interface MentionRoutingConfig {
    rules?: MentionRoutingRule[];
}

export class MentionRouter {
    constructor(private readonly rules: MentionRoutingRule[]) {}

    static fromDefaultConfig(): MentionRouter {
        const configPath = process.env.COLONY_ROUTING_CONFIG
            ?? path.join(process.cwd(), 'config', 'routing.yaml');
        if (!fs.existsSync(configPath)) return new MentionRouter([]);
        try {
            const raw = fs.readFileSync(configPath, 'utf-8');
            const parsed = yaml.parse(raw) as MentionRoutingConfig;
            return new MentionRouter(parsed?.rules ?? []);
        } catch {
            return new MentionRouter([]);
        }
    }

    route(message: Message, resolvedMentions: string[], resolveMention: (mention: string) => string | null): { mentionIds: string[]; routingHint?: string } {
        const content = message.content.toLowerCase();
        const rawMentions = [...message.content.matchAll(/@(\S+)/g)].map(m => m[1].toLowerCase());
        for (const rule of this.rules) {
            const sourceId = resolveMention(rule.sourceMention);
            const sourceMention = rule.sourceMention.toLowerCase();
            const sourceMatched = rawMentions.includes(sourceMention)
                || resolvedMentions.includes(rule.sourceMention)
                || (!!sourceId && resolvedMentions.includes(sourceId));
            const keywordMatched = rule.intentKeywords.some(k => content.includes(k.toLowerCase()));
            if (!sourceMatched || !keywordMatched) continue;
            const targetId = resolveMention(rule.targetMention);
            if (!targetId) continue;
            return { mentionIds: [targetId], routingHint: rule.routingHint };
        }
        return { mentionIds: resolvedMentions };
    }
}
