# Discord Channel ↔ Session 映射功能设计规格

> 状态：待实现
> 决策日期：2026-03-07
> 负责架构师：架构师

---

## 功能目标

建立 Discord Channel 与 Colony Session 的 **1:1 双向映射**：

- **方向 A（本期）**：创建 Colony Session 时，自动在 Discord 指定 Category 下创建同名 Channel，Channel topic 写入 session 元信息（agents、working dir、sessionId）。用户直接进入该 Channel 即可与 agents 对话，无需 `/colony join`。
- **方向 B（后续）**：Discord 创建 Channel 触发 Colony Session 自动创建（本期不实现）。

---

## 架构决策

### 决策 1：引入 `ChannelSessionMapper` 组件
- **理由**：职责单一，可独立测试，避免将双向映射逻辑散落在 DiscordBot/DiscordBridge 中
- **位置**：`src/discord/ChannelSessionMapper.ts`
- **持久化**：`.data/discord-channel-map.json`（服务重启后恢复映射）

### 决策 2：消息路由改为 channelId-first
- **理由**：channel 和 session 绑定后，`channelId → sessionId` 是唯一确定的路由，无需用户 join
- **兼容性**：无绑定的 channel 降级到旧 `userSessions` 逻辑

### 决策 3：Channel 删除 → 停止并删除 Session
- **理由**：用户主动删除 channel 表示放弃该会话，数据应一并清理
- **实现**：监听 `channelDelete` 事件 → `chatRoomManager.deleteRoom(sessionId)`

### 决策 4：Channel 识别条件 — 使用 Guild Category
- **理由**：Category 隔离比前缀命名更明确、不易误触发
- **配置**：`discord.yaml` 新增 `guild.id` 和 `guild.sessionCategory`

---

## 接口契约

### ChannelSessionMapper

```typescript
interface IChannelSessionMapper {
  bind(channelId: string, sessionId: string, meta: MappingMeta): Promise<void>;
  unbind(channelId: string): Promise<void>;
  getSessionByChannel(channelId: string): string | undefined;
  getChannelBySession(sessionId: string): string | undefined;
  load(): Promise<void>;
  save(): Promise<void>;
  getAllMappings(): MappingRecord[];
}

interface MappingMeta {
  sessionName: string;
  guildId: string;
  createdAt: string; // ISO 8601
}

interface MappingRecord {
  channelId: string;
  sessionId: string;
  sessionName: string;
  guildId: string;
  createdAt: string;
}
```

### DiscordConfig 扩展（discord.yaml）

```typescript
interface DiscordConfig {
  bot: { token: string; prefix: string; };
  guild?: {
    id: string;               // Guild ID（必须，用于创建 channel）
    sessionCategory?: string; // Category Channel ID，session channel 将创建于此
  };
  channels?: { notifications?: string; };
  notifications?: { enabled: boolean; events: string[]; };
  permissions?: { allowedServers?: string[]; allowedRoles?: string[]; allowedUsers?: string[]; };
}
```

### Channel Topic 格式

```
🤖 Colony Session | agents: architect,developer | id: <sessionId>
```

（如有 workingDir 则追加：`| dir: /path/to/project`）

---

## 数据模型

### 持久化文件：`.data/discord-channel-map.json`

```json
{
  "version": 1,
  "mappings": [
    {
      "channelId": "1234567890123456789",
      "sessionId": "550e8400-e29b-41d4-a716-446655440000",
      "sessionName": "MyProject",
      "guildId": "9876543210987654321",
      "createdAt": "2026-03-07T00:00:00.000Z"
    }
  ]
}
```

---

## 改动文件清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/discord/ChannelSessionMapper.ts` | **新建** | 双向映射组件 + JSON 持久化 |
| `src/discord/types.ts` | 修改 | 扩展 DiscordConfig、新增 MappingRecord 接口 |
| `src/discord/DiscordBot.ts` | 修改 | cmdCreate 创建 channel、handleMessage 路由改造、channelDelete 监听 |
| `src/discord/DiscordBridge.ts` | 修改 | 迁移 sessionChannels 到 ChannelSessionMapper |
| `src/discord/DiscordManager.ts` | 修改 | 初始化 ChannelSessionMapper，load 持久化数据 |
| `config/discord.yaml` | 修改 | 新增 guild.id / guild.sessionCategory 配置示例 |

---

## 消息路由改造对比

```
【旧流程 - Discord → Colony】
messageCreate → userSessions[userId] → sessionId → colony.sendMessage

【新流程 - Discord → Colony】
messageCreate → channelSessionMap[channelId]?
  → 有绑定 → sessionId → colony.sendMessage（自动添加用户为 participant）
  → 无绑定 → userSessions[userId] → sessionId（降级兼容）

【Session 创建流程（方向A）】
/colony create <name> [agents] [--dir /path]
  → colony.createSession(name, agentIds, workingDir) → sessionId
  → guild.channels.create({ name: slugify(name), parent: sessionCategory, topic: formatTopic(...) })
  → channelSessionMapper.bind(channelId, sessionId, meta)
  → reply "✅ Session + Channel 已创建: #channel-name"

【Channel 删除流程】
channelDelete event → channelSessionMapper.getSessionByChannel(channelId)?
  → 有绑定 → colony.chatRoomManager.deleteRoom(sessionId)
  → channelSessionMapper.unbind(channelId)
```

---

## 需要 Discord Bot 的额外权限

| 权限 | 用途 |
|------|------|
| `MANAGE_CHANNELS` | 创建 / 修改 channel topic |

现有权限（已有）：`Guilds`, `GuildMessages`, `MessageContent`, `DirectMessages`

---

## 测试要点（供 QA 参考）

1. 创建 session → 验证 Discord 中 channel 存在且 topic 格式正确
2. 在绑定 channel 中发消息 → 验证消息路由到正确 session
3. 多 channel 并存 → 验证消息不跨 session 泄漏
4. 删除 Discord channel → 验证 session 被删除、映射被清理
5. 服务重启 → 验证映射从 JSON 恢复，消息路由正常
6. 无 guild 配置时 `/colony create` → 验证优雅降级（不创建 channel，仅创建 session）
