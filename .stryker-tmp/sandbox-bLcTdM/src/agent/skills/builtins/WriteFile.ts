// @ts-nocheck
// ── Colony: Built-in Skill — WriteFile ───────────────────
// Allows an agent to write content to a file.

import * as fs from 'fs';
import * as path from 'path';
import { Skill } from '../Skill.js';
import type { SkillExecutionContext, SkillResult } from '../../../types.js';

export class WriteFileSkill extends Skill {
    async execute(
        params: Record<string, unknown>,
        _context: SkillExecutionContext
    ): Promise<SkillResult> {
        const filePath = path.resolve(params.path as string);
        const content = params.content as string;
        const append = params.append as boolean | undefined;

        try {
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            if (append) {
                fs.appendFileSync(filePath, content, 'utf-8');
            } else {
                fs.writeFileSync(filePath, content, 'utf-8');
            }

            return { success: true, output: `File written: ${filePath}` };
        } catch (err) {
            return { success: false, error: `Failed to write file: ${(err as Error).message}` };
        }
    }
}
