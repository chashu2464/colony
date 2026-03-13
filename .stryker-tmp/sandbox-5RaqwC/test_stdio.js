#!/usr/bin/env node
// @ts-nocheck
/**
 * 简单测试stdout/stderr处理
 */
const { spawn } = require('child_process');

console.log('=== 测试stdout/stderr ===\n');

const proc = spawn('python3', ['-c', `
import sys
import json

# 输出到stderr（日志）
print('This is stderr log', file=sys.stderr, flush=True)

# 输出到stdout（响应）
response = {'id': 1, 'success': True, 'data': 'test'}
print(json.dumps(response), flush=True)

# 再输出一些stderr
print('More stderr log', file=sys.stderr, flush=True)
`]);

proc.stdout.on('data', (data) => {
    console.log('STDOUT:', data.toString());
});

proc.stderr.on('data', (data) => {
    console.log('STDERR:', data.toString());
});

proc.on('exit', (code) => {
    console.log('Exit code:', code);
    process.exit(0);
});
