# Discord Integration - Quick Start

## 5分钟快速开始

### 1. 创建Discord Bot (2分钟)

1. 访问 https://discord.com/developers/applications
2. 点击 "New Application"，输入名称 "Colony Bot"
3. 进入 "Bot" 标签，点击 "Add Bot"
4. 启用 "MESSAGE CONTENT INTENT"
5. 点击 "Reset Token"，复制token

### 2. 邀请Bot到服务器 (1分钟)

1. 进入 "OAuth2" → "URL Generator"
2. 选择 `bot` scope
3. 选择权限：Send Messages, Read Messages, Add Reactions
4. 复制URL并在浏览器打开
5. 选择你的服务器，点击 "Authorize"

### 3. 配置Colony (1分钟)

编辑 `.env` 文件：

```bash
DISCORD_BOT_TOKEN=your-bot-token-here
```

### 4. 启动Colony (1分钟)

```bash
npm run build:server
npm start
```

查看日志确认Discord已连接：
```
[INFO] [DiscordBot] Discord bot logged in as Colony Bot#1234
```

### 5. 测试 (1分钟)

在Discord中输入：

```
/colony help
```

应该看到帮助信息！

## 基本使用

### 创建会话

```
/colony create "我的项目"
```

### 加入会话

```
/colony join <session-id>
```

### 与Agent对话

```
@architect 帮我设计一个系统
```

### 查看状态

```
/colony status
```

## 完整文档

详细设置和使用说明请参考：
- [Discord Setup Guide](./discord-setup-guide.md)
- [Phase 5 Summary](./phase5-summary.md)

## 故障排除

### Bot不响应

1. 检查bot是否在线（Discord中显示绿点）
2. 检查Colony日志是否有错误
3. 确认bot token正确

### 命令不工作

1. 确认命令前缀是 `/colony`
2. 检查bot是否有发送消息权限
3. 尝试在不同频道

### 需要帮助？

查看 [Discord Setup Guide](./discord-setup-guide.md) 的故障排除部分。

## 禁用Discord

如果不需要Discord集成：

1. 不设置 `DISCORD_BOT_TOKEN`
2. Colony会自动跳过Discord初始化

## 下一步

- 设置通知频道
- 配置权限控制
- 在移动端使用
- 探索更多命令

享受使用Colony + Discord！🎉
