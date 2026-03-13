// @ts-nocheck
// ── Colony: Built-in Skill — RunCommand ──────────────────
// Allows an agent to execute shell commands.

import { execSync } from 'child_process';
import { Skill } from '../Skill.js';
import type { SkillExecutionContext, SkillResult } from '../../../types.js';

export class RunCommandSkill extends Skill {
    async execute(
        params: Record<string, unknown>,
        _context: SkillExecutionContext
    ): Promise<SkillResult> {
        const command = params.command as string;
        const cwd = params.cwd as string | undefined;
        const timeout = (params.timeout as number | undefined) ?? 30000;

        try {
            const output = execSync(command, {
                cwd,
                encoding: 'utf-8',
                timeout,
                maxBuffer: 1024 * 1024, // 1MB
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            return { success: true, output: output.trim() };
        } catch (err) {
            const execErr = err as { stdout?: string; stderr?: string; message: string };
            const output = [execErr.stdout, execErr.stderr].filter(Boolean).join('\n').trim();
            return {
                success: false,
                error: output || execErr.message,
            };
        }
    }
}
