// @ts-nocheck
// ── Colony: Built-in Skill — ReadFile ────────────────────
// Allows an agent to read a file from the local filesystem.

import * as fs from 'fs';
import * as path from 'path';
import { Skill } from '../Skill.js';
import type { SkillExecutionContext, SkillResult } from '../../../types.js';

export class ReadFileSkill extends Skill {
    async execute(
        params: Record<string, unknown>,
        _context: SkillExecutionContext
    ): Promise<SkillResult> {
        const filePath = path.resolve(params.path as string);

        try {
            if (!fs.existsSync(filePath)) {
                return { success: false, error: `File not found: ${filePath}` };
            }

            let content = fs.readFileSync(filePath, 'utf-8');

            const startLine = params.start_line as number | undefined;
            const endLine = params.end_line as number | undefined;

            if (startLine || endLine) {
                const lines = content.split('\n');
                const start = (startLine ?? 1) - 1;
                const end = endLine ?? lines.length;
                content = lines.slice(start, end).join('\n');
            }

            return { success: true, output: content };
        } catch (err) {
            return { success: false, error: `Failed to read file: ${(err as Error).message}` };
        }
    }
}
