#!/usr/bin/env node
// @ts-nocheck
/**
 * 测试Mem0初始化过程
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const yaml = require('yaml');

// 加载环境变量
require('dotenv').config();

console.log('=== 测试Mem0初始化 ===\n');

// 1. 检查环境变量
console.log('1. 环境变量检查:');
console.log('   OPENAI_BASE_URL:', process.env.OPENAI_BASE_URL || '❌ 未设置');
console.log('   OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅ 已设置' : '❌ 未设置');
console.log('');

// 2. 加载配置
console.log('2. 加载Mem0配置:');
const configPath = path.join(process.cwd(), 'config', 'mem0.yaml');
const configContent = fs.readFileSync(configPath, 'utf-8');
const config = yaml.parse(configContent);
console.log('   配置文件:', configPath);
console.log('   Vector Store:', config.vector_store?.provider);
console.log('   LLM:', config.llm?.provider);
console.log('   Embedder:', config.embedder?.provider);
console.log('');

// 3. 启动Python进程
console.log('3. 启动Python进程:');
const scriptsDir = path.join(process.cwd(), 'scripts');
const configStr = JSON.stringify(config);

console.log('   PYTHONPATH:', scriptsDir);
console.log('   配置长度:', configStr.length, 'bytes');
console.log('');

const pythonProcess = spawn('python3', [
    '-u',
    '-m', 'mem0_bridge',
    '--config', configStr
], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
        ...process.env,
        PYTHONPATH: scriptsDir
    }
});

console.log('   Python进程PID:', pythonProcess.pid);
console.log('');

// 4. 监听输出
console.log('4. Python进程输出:');
console.log('   --- STDOUT ---');

pythonProcess.stdout.on('data', (data) => {
    console.log('   ', data.toString().trim());
});

pythonProcess.stderr.on('data', (data) => {
    const output = data.toString().trim();
    if (output.includes('ERROR') || output.includes('Traceback') || output.includes('Exception')) {
        console.error('   ❌', output);
    } else {
        console.log('   ', output);
    }
});

pythonProcess.on('exit', (code, signal) => {
    console.log('');
    console.log('5. Python进程退出:');
    console.log('   退出码:', code);
    console.log('   信号:', signal);

    if (code === 0) {
        console.log('   ✅ 正常退出');
    } else {
        console.log('   ❌ 异常退出');
    }

    process.exit(code || 0);
});

pythonProcess.on('error', (err) => {
    console.error('');
    console.error('❌ 启动失败:', err);
    process.exit(1);
});

// 5. 10秒后发送测试请求
setTimeout(() => {
    console.log('');
    console.log('6. 发送测试请求:');

    const request = {
        id: 1,
        method: 'add',
        params: {
            messages: 'This is a test memory',
            agent_id: 'test-agent',
            run_id: 'test-run',
            metadata: {
                type: 'conversation',
                importance: 0.5,
                tags: [],
                timestamp: new Date().toISOString()
            }
        }
    };

    console.log('   请求:', JSON.stringify(request, null, 2));
    pythonProcess.stdin.write(JSON.stringify(request) + '\n');

    // 15秒后超时
    setTimeout(() => {
        console.log('');
        console.log('❌ 请求超时（15秒）');
        pythonProcess.kill();
        process.exit(1);
    }, 15000);
}, 10000);
