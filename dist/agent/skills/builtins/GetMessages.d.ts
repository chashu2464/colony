import { Skill } from '../Skill.js';
import type { SkillExecutionContext, SkillResult } from '../../../types.js';
export declare class GetMessagesSkill extends Skill {
    execute(params: Record<string, unknown>, context: SkillExecutionContext): Promise<SkillResult>;
}
