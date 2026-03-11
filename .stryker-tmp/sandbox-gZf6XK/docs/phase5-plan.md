# Phase 5: Discord Integration - 实现计划

## 目标

将Colony与Discord集成，使用户可以通过Discord移动端管理和参与会话。

## 功能需求

### 1. Discord Bot基础功能
- [ ] 创建Discord bot并连接到服务器
- [ ] 实现基本命令系统
- [ ] 会话管理命令（创建、切换、列表）
- [ ] 状态���询命令（token使用量、agent状态）

### 2. 消息桥接
- [ ] Discord消息 → Colony聊天室
- [ ] Colony聊天室 → Discord频道
- [ ] 支持@提及（Discord用户 ↔ Colony agent）
- [ ] 消息格式转换和美化

### 3. 任务通知
- [ ] 里程碑事件监听
- [ ] 自动发送通知到Discord
- [ ] 可配置的通知规则

## 技术选型

### Discord库
- **discord.js** (推荐)
  - 成熟稳定，文档完善
  - TypeScript支持良好
  - 活跃的社区

### 架构设计
```
Discord Bot (discord.js)
    ↓
DiscordBridge (TypeScript)
    ↓
Colony MessageBus
    ↓
Chat Rooms / Agents
```

## 实现步骤

### Step 1: 环境准备
1. 安装discord.js
2. 创建Discord应用和Bot
3. 配置Bot权限和Token

### Step 2: Discord Bot基础
1. 创建`src/discord/DiscordBot.ts`
2. 实现连接和基本事件处理
3. 实现命令解析器

### Step 3: 命令实现
1. `/colony create <name>` - 创建会话
2. `/colony list` - 列出所有会话
3. `/colony join <id>` - 加入会话
4. `/colony leave` - 离开当前会话
5. `/colony status` - 查看状态
6. `/colony agents` - 列出agents

### Step 4: 消息桥接
1. 创建`src/discord/DiscordBridge.ts`
2. Discord消息 → Colony
   - 解析消息内容
   - 转换@提及
   - 发送到对应聊天室
3. Colony → Discord
   - 监听MessageBus事件
   - 格式化消息
   - 发送到Discord频道

### Step 5: 通知系统
1. 定义里程碑事件类型
2. 实现事件监听器
3. 发送通知到Discord

### Step 6: 测试和优化
1. 单元测试
2. 集成测试
3. 错误处理和重连机制

## 文件结构

```
src/discord/
├── DiscordBot.ts          # Discord bot主类
├── DiscordBridge.ts       # 消息桥接
├── CommandHandler.ts      # 命令处理
├── NotificationManager.ts # 通知管理
└── types.ts              # Discord相关类型定义

config/
└── discord.yaml          # Discord配置

.env
└── DISCORD_BOT_TOKEN     # Bot token
```

## 配置示例

### config/discord.yaml
```yaml
bot:
  token: ${DISCORD_BOT_TOKEN}
  prefix: /colony

channels:
  # 默认通知频道
  notifications: "1234567890"

  # 会话频道映射（可选）
  sessions:
    default: "1234567891"

notifications:
  enabled: true
  events:
    - milestone_completed
    - task_finished
    - error_occurred
```

### .env
```bash
DISCORD_BOT_TOKEN=your-bot-token-here
```

## 命令设计

### 会话管理

```
/colony create <name> [agents]
  创建新会话
  示例: /colony create "项目讨论" architect,developer

/colony list
  列出所有会话

/colony join <session-id>
  加入会话（之后的消息会发送到该会话）

/colony leave
  离开当前会话

/colony current
  显示当前会话信息
```

### 状态查询

```
/colony status
  显示系统状态（活跃会话、agents状态、token使用量）

/colony agents
  列出所有agents及其状态

/colony sessions
  显示所有会话的详细信息
```

### 消息发送

```
直接发送消息（在加入会话后）:
  "你好 @architect"

@提及agent:
  "@developer 请帮我实现这个功能"
```

## 用户体验流程

### 场景1：创建会话并讨论

```
用户: /colony create "新功能开发"
Bot:  ✅ 会话已创建
      ID: abc-123
      名称: 新功能开发
      Agents: architect, developer, qa-lead

      使用 /colony join abc-123 加入会话

用户: /colony join abc-123
Bot:  ✅ 已加入会话 "新功能开发"
      现在你可以直接发送消息与agents对话

用户: @architect 我们需要设计一个用户认证系统
Bot:  [转发消息到Colony]

[Architect响应]
Bot:  💬 Architect:
      好的，我建议使用JWT + OAuth2.0的方案...
```

### 场景2：查看状态

```
用户: /colony status
Bot:  📊 Colony状态

      活跃会话: 3
      在线Agents: 3/3

      Token使用量:
      - Claude: 45,231 / 100,000
      - Gemini: 12,450 / 50,000

      当前会话: 新功能开发 (abc-123)
```

### 场景3：接收通知

```
Bot:  🎉 里程碑完成
      会话: 新功能开发

      Architect 已完成系统设计文档
      - 架构图已生成
      - API接口已定义
      - 数据库schema已设计

      查看详情: http://localhost:3001/sessions/abc-123
```

## 安全考虑

1. **权限控制**
   - 只允许特定Discord服务器使用
   - 可配置允许的用户/角色
   - 命令权限分级

2. **速率限制**
   - 防止命令滥用
   - 消息频率限制

3. **数据隔离**
   - Discord用户与Colony会话的映射
   - 防止跨会话信息泄露

## 性能优化

1. **消息批处理**
   - 合并短时间内的多条消息
   - 减少Discord API调用

2. **缓存**
   - 缓存会话信息
   - 缓存用户状态

3. **异步处理**
   - 消息转发异步化
   - 通知发送队列

## 错误处理

1. **连接断开**
   - 自动重连机制
   - 重连时恢复状态

2. **命令错误**
   - 友好的错误提示
   - 使用帮助信息

3. **消息发送失败**
   - 重试机制
   - 失败通知

## 测试计划

### 单元测试
- [ ] 命令解析
- [ ] 消息格式转换
- [ ] 事件处理

### 集成测试
- [ ] Discord → Colony消息流
- [ ] Colony → Discord消息流
- [ ] 命令执行流程

### 端到端测试
- [ ] 完整的会话创建和对话流程
- [ ] 通知发送
- [ ] 错误恢复

## 文档

- [ ] Discord Bot设置指南
- [ ] 命令使用手册
- [ ] 故障排除指南

## 时间估算

- Step 1-2: 2-3小时（环境准备和基础框架）
- Step 3: 3-4小时（命令实现）
- Step 4: 4-5小时（消息桥接）
- Step 5: 2-3小时（通知系统）
- Step 6: 2-3小时（测试和优化）

**总计**: 13-18小时

## 下一步

开始实现Step 1和Step 2：
1. 安装discord.js
2. 创建Discord Bot基础框架
3. 实现连接和基本事件处理
