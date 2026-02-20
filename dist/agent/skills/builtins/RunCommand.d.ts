import { Skill } from '../Skill.js';
import type { SkillExecutionContext, SkillResult } from '../../../types.js';
export declare class RunCommandSkill extends Skill {
    execute(params: Record<string, unknown>, _context: SkillExecutionContext): Promise<SkillResult>;
}
