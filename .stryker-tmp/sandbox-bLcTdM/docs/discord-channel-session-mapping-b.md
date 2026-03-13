# 方向 B 架构设计：Discord Channel 创建 → 自动创建 Colony Session

> 状态：设计中
> 日期：2026-03-07
> 依赖：方向 A（已完成，commit 2fa7ca8）+ 路径2修复（已完成，commit b47bccf）

---

## 功能目标

用户在 Discord 中于指定 Category 下创建 Channel 时，Colony 自动：
1. 识别该 Channel 属于 Session Category（通过配置的 Category ID）
2. 用 Channel name 作为 Session name 创建 Colony Session
3. 可选：从 Channel topic 解析 agent 列表
4. 回写 sessionId 到 Channel topic
5. 建立 channelId ↔ sessionId 双向映射（复用已有 ChannelSessionMapper）

---

## 与方向 A 的差异

| 维度 | 方向 A | 方向 B |
|------|--------|--------|
| 触发方 | Colony（`/colony create`）| Discord（用户创建 Channel）|
| Channel 创建者 | Colony Bot | Discord 用户 |
| Session 创建者 | Colony Bot | Colony Bot（事件驱动）|
| 识别机制 | N/A | Category ID 匹配 |
| Agent 来源 | 命令参数 | Channel topic 解析（可选，默认加载全部）|
| Channel topic | Bot 写入 | 用户预设 → Bot 回写 sessionId |

---

## 架构决策

### 决策 1：触发条件 — Category ID 匹配（而非名称前缀）
- **理由**：Category ID 是 Discord 内部唯一标识符，不受用户重命名 Category 影响；前缀命名容易误触发，且 Channel 名称空间被污染
- **配置字段**：`guild.sessionCategory`（已存在于 DiscordConfig，本次复用）
- **推导**：`channel.parentId === config.guild.sessionCategory`

### 决策 2：Agent 列表解析 — topic 可选解析，默认全部
- **理由**：强制要求用户预先填写 topic 增加摩擦，默认加载全部 agents 可以让方向 B 做到"零配置即用"
- **topic 解析格式**（可选）：`agents: architect,developer`
- **降级**：topic 为空或无 agents 字段时，加载 `agentRegistry.getAll()`

### 决策 3：Channel topic 回写
- **理由**：将 sessionId 写回 topic，便于用户识别绑定关系，也与方向 A 格式一致
- **回写格式**：在用户原有 topic 后追加 ` | id: <sessionId>`；若原 topic 为空，写入完整格式
- **时机**：`createRoom` 成功后立即回写，失败只记录 warn，不阻塞

### 决策 4：防重入机制
- **理由**：`channelCreate` 在方向 A 创建 Channel 时也会触发，必须防止循环：Colony 自己创建的 Channel 不应再触发方向 B
- **方案**：在 `handleChannelCreate` 中，先检查 `mapper.getSessionByChannel(channelId)` 是否已有绑定；若已绑定，跳过（方向 A 创建后立即 bind，所以此时 channelCreate 触发时绑定已存在）

---

## 接口契约扩展

### DiscordConfig 新增字段（可选）
```typescript
guild?: {
  id: string;
  sessionCategory?: string;
  autoCreateOnChannelCreate?: boolean; // 新增，默认 false，显式开启方向B
  defaultAgents?: string[];            // 新增，可选，覆盖"加载全部"的默认行为
};
```

### discord.yaml 示例
```yaml
guild:
  id: "${DISCORD_GUILD_ID}"
  sessionCategory: "${DISCORD_SESSION_CATEGORY_ID}"
  autoCreateOnChannelCreate: true   # 开启方向B
  # defaultAgents:                  # 可选，不填则加载全部
  #   - architect
  #   - developer
```

---

## 改动文件清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/discord/types.ts` | 修改 | `DiscordConfig.guild` 新增 `autoCreateOnChannelCreate` 和 `defaultAgents` 字段 |
| `src/discord/DiscordBot.ts` | 修改 | `setupEventHandlers` 增加 `channelCreate` 监听；新增 `handleChannelCreate` 私有方法 |
| `config/discord.yaml` | 修改 | 新增 `autoCreateOnChannelCreate` 配置示例 |

**不需要修改**：`ChannelSessionMapper`（已有 bind/getSessionByChannel，直接复用）、`DiscordManager`、`DiscordBridge`

---

## handleChannelCreate 逻辑流（伪代码，非完整实现）

```
handleChannelCreate(channel):
  // 1. 过滤非文字频道
  if channel.type !== GuildText → return

  // 2. 检查是否在 sessionCategory 下
  if !config.guild.sessionCategory → return
  if channel.parentId !== config.guild.sessionCategory → return

  // 3. 检查是否已有绑定（防重入）
  if mapper.getSessionByChannel(channel.id) → return

  // 4. 检查 autoCreateOnChannelCreate 开关
  if !config.guild.autoCreateOnChannelCreate → return

  // 5. 解析 agent 列表
  agentIds = parseAgentsFromTopic(channel.topic) ?? config.guild.defaultAgents ?? []

  // 6. 创建 Colony Session
  sessionName = channel.name  // 已经是 slug 格式，无需再转换
  room = colony.chatRoomManager.createRoom(sessionName, agentIds)

  // 7. 建立映射
  await mapper.bind(channel.id, room.id, { sessionName, guildId, createdAt })

  // 8. 回写 topic
  const newTopic = buildTopic(channel.topic, room.id, agentIds)
  await channel.setTopic(newTopic).catch(warn)

  // 9. 发送欢迎消息到 Channel
  await channel.send("🤖 Colony Session created: **{name}** | Agents: {agents}")
```

---

## 测试要点（供 QA）

1. **TC-B01 基础触发**：在 sessionCategory 下创建 Channel → 自动创建 Session，topic 被回写 sessionId
2. **TC-B02 防重入**：方向 A 创建的 Channel（已有绑定）不触发方向 B
3. **TC-B03 非目标 Category**：在其他 Category 下创建 Channel → 不触发
4. **TC-B04 Agent 解析**：Channel topic 包含 `agents: architect` → 只加载 architect；topic 为空 → 加载全部 agents
5. **TC-B05 autoCreate 开关**：`autoCreateOnChannelCreate: false` 时创建 Channel → 不触发
6. **TC-B06 Topic 回写失败**：Bot 无 MANAGE_CHANNELS 权限时，Session 仍然创建成功，仅 topic 回写失败（warn）
7. **TC-B07 同名 Channel 冲突**：同 Category 下创建与已有 Session 同名的 Channel → 行为明确（创建新 Session，名称加后缀 或 拒绝）

---

## 遗留问题（TC-B07）需决策

TC-B07 同名冲突有两种策略：
- **A. 自动加后缀**：Session 名改为 `channel-name-2`（Discord channel 名称不变，Topic 中的 session name 不同）
- **B. 不处理**：`chatRoomManager` 允许同名 Session 存在（检查现有行为）

需确认 `createRoom` 对同名是否有约束后决定。
