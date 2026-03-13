# Colony重启指南

## 为什么需要重启？

当你修改了以下文件后，需要重启Colony：

1. **Python文件**（`scripts/mem0_bridge.py`）
   - Python subprocess会缓存代码
   - 需要重启Colony来重新spawn Python进程

2. **TypeScript文件**（`src/**/*.ts`）
   - 需要rebuild（`npm run build:server`）
   - 然后重启Colony

3. **配置文件**（`.env`, `config/*.yaml`）
   - 环境变量在启动时加载
   - 需要重启Colony来重新加载

## 重启步骤

### 方法1：使用Ctrl+C（推荐）

```bash
# 1. 在运行npm start的终端按Ctrl+C
^C

# 2. 等待进程完全停止（看到命令提示符）

# 3. 重新启动
npm start
```

### 方法2：查找并杀死进程

```bash
# 1. 查找Colony进程
ps aux | grep "node dist/main.js" | grep -v grep

# 2. 杀死进程（替换PID）
kill <PID>

# 3. 如果进程不响应，强制杀死
kill -9 <PID>

# 4. 重新启动
npm start
```

### 方法3：杀死所有相关进程

```bash
# 杀死所有node和python进程（谨慎使用！）
pkill -f "node dist/main.js"
pkill -f "python.*mem0_bridge"

# 重新启动
npm start
```

## 完整的修改-重启流程

### 场景1：修改了Python代码

```bash
# 1. 修改scripts/mem0_bridge.py
vim scripts/mem0_bridge.py

# 2. 停止Colony（在运行的终端按Ctrl+C）
^C

# 3. 重新启动
npm start
```

**注意**：Python文件不需要rebuild，直接重启即可。

### 场景2：修改了TypeScript代码

```bash
# 1. 修改src/**/*.ts
vim src/memory/Mem0LongTermMemory.ts

# 2. 停止Colony
^C

# 3. Rebuild
npm run build:server

# 4. 重新启动
npm start
```

### 场景3：修改了配置文件

```bash
# 1. 修改.env或config/*.yaml
vim .env

# 2. 停止Colony
^C

# 3. 重新启动（会重新加载配置）
npm start
```

### 场景4：修改了多个文件

```bash
# 1. 修改所有需要的文件
vim scripts/mem0_bridge.py
vim src/memory/Mem0LongTermMemory.ts
vim .env

# 2. 停止Colony
^C

# 3. Rebuild（如果修改了TypeScript）
npm run build:server

# 4. 重新启动
npm start
```

## 验证重启成功

### 检查日志

启动后应该看到：

```
[INFO] [Colony] Starting Colony...
[INFO] [Colony] Loading Mem0 configuration...
[INFO] [Colony] Mem0 long-term memory created
[INFO] [Colony] Colony initialized with X agents
[INFO] [Server] Colony server listening on port 3001
```

### 检查Mem0初始化

发送第一条消息后，应该看到：

```
[INFO] [Mem0LongTermMemory] Initializing Mem0 bridge...
[INFO] [mem0_bridge] Using LLM endpoint from env: https://...
[INFO] [mem0_bridge] Using embedder endpoint from env: https://...
[INFO] [mem0_bridge] Mem0 initialized successfully
```

### 检查进程

```bash
# 应该看到新的进程
ps aux | grep "node dist/main.js"
ps aux | grep "python.*mem0_bridge"
```

## 常见问题

### 问题1：Ctrl+C不响应

**解决**：
```bash
# 强制停止
ps aux | grep "node dist/main.js" | grep -v grep | awk '{print $2}' | xargs kill -9
```

### 问题2：端口被占用

**错误**：
```
Error: listen EADDRINUSE: address already in use :::3001
```

**解决**：
```bash
# 查找占用端口的进程
lsof -i :3001

# 杀死进程
kill -9 <PID>

# 或者使用不同的端口
PORT=3002 npm start
```

### 问题3：Python进程残留

**症状**：修改了mem0_bridge.py但还是使用旧代码

**解决**：
```bash
# 杀死所有mem0_bridge进程
pkill -f "python.*mem0_bridge"

# 重新启动Colony
npm start
```

### 问题4：环境变量未更新

**症状**：修改了.env但还是使用旧值

**解决**：
```bash
# 确保完全停止Colony
^C

# 验证环境变量
node -e "require('dotenv').config(); console.log(process.env.OPENAI_BASE_URL)"

# 重新启动
npm start
```

## 开发技巧

### 使用nodemon自动重启（可选）

```bash
# 安装nodemon
npm install --save-dev nodemon

# 添加到package.json
"scripts": {
  "dev:server": "nodemon --watch dist dist/main.js"
}

# 使用
npm run build:server -- --watch  # 终端1：自动rebuild
npm run dev:server                # 终端2：自动重启
```

### 使用tmux管理多个终端

```bash
# 创建session
tmux new -s colony

# 分割窗口
Ctrl+b %  # 垂直分割
Ctrl+b "  # 水平分割

# 在不同窗口运行
# 窗口1：npm run build:server -- --watch
# 窗口2：npm start
# 窗口3：tail -f logs/*.log
```

## 当前情况的解决方案

根据你的情况，你需要：

```bash
# 1. 停止当前运行的Colony
# 在运行npm start的终端按Ctrl+C

# 2. 确认进程已停止
ps aux | grep "node dist/main.js" | grep -v grep
# 应该没有输出

# 3. 重新启动
npm start

# 4. 观察日志，应该看到新的配置生效
```

## 快速重启命令

创建一个重启脚本：

```bash
# restart.sh
#!/bin/bash
echo "Stopping Colony..."
pkill -f "node dist/main.js"
pkill -f "python.*mem0_bridge"
sleep 2

echo "Rebuilding..."
npm run build:server

echo "Starting Colony..."
npm start
```

使用：
```bash
chmod +x restart.sh
./restart.sh
```

## 总结

### 记住这个流程

```
修改代码 → 停止Colony (Ctrl+C) → Rebuild (如果改了TS) → 重新启动 (npm start)
```

### 关键点

1. ✅ **Python代码修改**：只需重启，不需要rebuild
2. ✅ **TypeScript代码修改**：需要rebuild + 重启
3. ✅ **配置文件修改**：只需重启
4. ✅ **使用Ctrl+C优雅停止**
5. ✅ **确认进程完全停止后再启动**
