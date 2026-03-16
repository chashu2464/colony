const { spawn } = require('child_process');
const child = spawn('claude', ['-p', 'hello', '--output-format', 'stream-json', '--verbose'], {
    env: {
        ...process.env,
        CLAUDE_CODE_SESSION_ACCESS_TOKEN: ''
    }
});
let output = '';
child.stdout.on('data', d => output += d.toString());
child.stderr.on('data', d => output += d.toString());
child.on('close', code => {
    console.log(`Exit code: ${code}`);
    console.log(output);
});
