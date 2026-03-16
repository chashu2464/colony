const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const sessionConfigDir = path.join(process.cwd(), '.data/test-session-config');
if (!fs.existsSync(sessionConfigDir)) {
    fs.mkdirSync(sessionConfigDir, { recursive: true });
}

const args = ['-p', 'hello', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions', '--resume', '12345678-1234-1234-1234-123456789012'];

const child = spawn('claude', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
        ...process.env,
        XDG_CONFIG_HOME: sessionConfigDir,
        CLAUDE_CONFIG_DIR: sessionConfigDir,
        ...(process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN ? { CLAUDE_CODE_SESSION_ACCESS_TOKEN: process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN } : {}),
    }
});

let stdout = '';
let stderr = '';

child.stdout.on('data', (d) => stdout += d.toString());
child.stderr.on('data', (d) => stderr += d.toString());

child.on('close', (code) => {
    console.log(`Exit code: ${code}`);
    console.log(`STDOUT: ${stdout}`);
    console.log(`STDERR: ${stderr}`);
});
