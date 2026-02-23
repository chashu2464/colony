"use strict";
// ── Colony: Built-in Skill — RunCommand ──────────────────
// Allows an agent to execute shell commands.
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunCommandSkill = void 0;
const child_process_1 = require("child_process");
const Skill_js_1 = require("../Skill.js");
class RunCommandSkill extends Skill_js_1.Skill {
    async execute(params, _context) {
        const command = params.command;
        const cwd = params.cwd;
        const timeout = params.timeout ?? 30000;
        try {
            const output = (0, child_process_1.execSync)(command, {
                cwd,
                encoding: 'utf-8',
                timeout,
                maxBuffer: 1024 * 1024, // 1MB
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            return { success: true, output: output.trim() };
        }
        catch (err) {
            const execErr = err;
            const output = [execErr.stdout, execErr.stderr].filter(Boolean).join('\n').trim();
            return {
                success: false,
                error: output || execErr.message,
            };
        }
    }
}
exports.RunCommandSkill = RunCommandSkill;
