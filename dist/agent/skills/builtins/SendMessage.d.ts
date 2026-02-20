import { Skill } from '../Skill.js';
import type { SkillExecutionContext, SkillResult } from '../../../types.js';
export declare class SendMessageSkill extends Skill {
    execute(params: Record<string, unknown>, context: SkillExecutionContext): Promise<SkillResult>;
}
