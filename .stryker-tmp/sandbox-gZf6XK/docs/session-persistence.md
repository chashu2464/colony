# 会话持久化功能

## 功能概述

实现了会话持久化功能，使得Colony重启后会话不会丢失。

## 核心特性

### 1. 自动保存
- 每次发送消息后自动保存会话状态
- 保存内容包括：
  - 会话ID和名称
  - 参与的agent列表
  - 人类参与者列表
  - 完整的消息历史
  - 默认agent设置

### 2. 启动时自动恢复
- Colony启动时自动加载所有已保存的会话
- 恢复会话的完整状态（参与者、消息历史等）
- 失败的会话会被跳过，不影响其他会话

### 3. 会话管理API
- 列出所有已保存的会话
- 手动恢复指定会话
- 删除会话（同时删除内存和磁盘数据）
- 手动保存会话

## 修改的文件

### 1. `src/conversation/ChatRoom.ts`
添加了自动保存回调机制和消息恢复功能：

```typescript
private autoSaveCallback?: (roomId: string) => Promise<void>;

setAutoSaveCallback(callback: (roomId: string) => Promise<void>): void {
    this.autoSaveCallback = callback;
}

restoreMessages(messages: Message[]): void {
    this.messageHistory = [...messages];
    log.info(`Restored ${messages.length} messages to room "${this.name}"`);
}

private onMessage(message: Message): void {
    this.messageHistory.push(message);

    // 触发自动保存
    if (this.autoSaveCallback) {
        this.autoSaveCallback(this.id).catch(err => {
            log.error(`Auto-save failed for room ${this.id}:`, err);
        });
    }
    // ...
}
```

### 2. `src/conversation/ChatRoomManager.ts`
添加了自动保存和批量恢复功能：

```typescript
createRoom(name: string, agentIds?: string[]): ChatRoom {
    const room = new ChatRoom(name, this.messageBus);

    // 设置自动保存
    room.setAutoSaveCallback(async (roomId) => {
        await this.saveRoom(roomId);
    });

    // ...
}

async restoreRoom(roomId: string): Promise<ChatRoom | null> {
    const data = await this.sessionManager.loadSession(roomId);
    const roomData = data as {
        id: string;
        name: string;
        agentIds: string[];
        humanParticipants: Participant[];
        messages: Message[];
        defaultAgentId: string | null;
    };

    const room = new ChatRoom(roomData.name, this.messageBus, roomData.id);

    // 恢复agents和participants
    // ...

    // 恢复默认agent
    if (roomData.defaultAgentId) {
        room.setDefaultAgent(roomData.defaultAgentId);
    }

    // 恢复消息历史
    if (roomData.messages && roomData.messages.length > 0) {
        room.restoreMessages(roomData.messages);
    }

    return room;
}

async restoreAllSessions(): Promise<void> {
    const sessionIds = await this.sessionManager.listSessions();
    for (const sessionId of sessionIds) {
        await this.restoreRoom(sessionId);
    }
}

async deleteRoom(roomId: string): Promise<boolean> {
    // 删除内存中的room
    room.destroy();
    this.rooms.delete(roomId);

    // 同时删除磁盘上的会话
    await this.sessionManager.deleteSession(roomId);
}
```

### 3. `src/Colony.ts`
添加了初始化方法：

```typescript
async initialize(): Promise<void> {
    await this.chatRoomManager.restoreAllSessions();
}
```

### 4. `src/main.ts`
在启动时调用初始化：

```typescript
const colony = new Colony({ ... });

// 恢复已保存的会话
await colony.initialize();

const { start } = createColonyServer({ colony, port });
await start();
```

### 5. `src/server/index.ts`
添加了新的API端点：

```typescript
// 列出所有已保存的会话
GET /api/sessions/saved

// 恢复指定会话
POST /api/sessions/:id/restore

// 手动保存会话
POST /api/sessions/:id/save

// 删除会话（更新为async）
DELETE /api/sessions/:id
```

## API使用示例

### 列出所有活跃会话
```bash
curl http://localhost:3001/api/sessions
```

### 列出所有已保存的会话
```bash
curl http://localhost:3001/api/sessions/saved
```

### 恢复指定会话
```bash
curl -X POST http://localhost:3001/api/sessions/{session-id}/restore
```

### 手动保存会话
```bash
curl -X POST http://localhost:3001/api/sessions/{session-id}/save
```

### 删除会话
```bash
curl -X DELETE http://localhost:3001/api/sessions/{session-id}
```

## 存储位置

会话数据保存在：
```
.data/sessions/{session-id}.json
```

## 会话数据格式

```json
{
  "id": "session-uuid",
  "name": "会话名称",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "agentIds": ["agent-1", "agent-2"],
  "humanParticipants": [
    {
      "id": "user-1",
      "type": "human",
      "name": "用户名"
    }
  ],
  "messages": [
    {
      "id": "msg-uuid",
      "roomId": "session-uuid",
      "sender": { "id": "user-1", "type": "human", "name": "用户名" },
      "content": "消息内容",
      "mentions": [],
      "timestamp": "2024-01-01T00:00:00.000Z"
    }
  ],
  "defaultAgentId": "agent-1"
}
```

## 工作流程

### 创建新会话
1. 用户通过API创建会话
2. ChatRoomManager创建ChatRoom实例
3. 设置自动保存回调
4. 添加agents和participants

### 发送消息
1. 用户发送消息到会话
2. ChatRoom将消息添加到历史
3. 触发自动保存回调
4. SessionManager将会话状态写入磁盘

### 重启恢复
1. Colony启动时调用initialize()
2. ChatRoomManager.restoreAllSessions()
3. 遍历.data/sessions/目录
4. 为每个会话文件：
   - 读取JSON数据
   - 创建ChatRoom实例
   - 恢复agents和participants
   - 设置自动保存回调

### 删除会话
1. 用户通过API删除会话
2. ChatRoomManager销毁ChatRoom实例
3. 从内存中移除
4. SessionManager删除磁盘文件

## 注意事项

### 1. 消息历史
- ✅ 消息历史完整保存，包括所有元数据
- ✅ 重启后消息历史完全恢复
- ✅ 不会丢失任何对话内容
- ✅ 消息顺序保持不变

### 2. Agent状态
- Agent的配置从config/agents/重新加载
- Agent的运行时状态不保存（如正在处理的请求）
- 会话中的agent列表会被恢复
- 默认agent设置会被恢复

### 3. 性能考虑
- 自动保存是异步的，不阻塞消息处理
- 保存失败会记录错误但不影响会话继续
- 大量会话时启动可能需要几秒钟
- 消息历史越长，保存和加载时间越长

### 4. 错误处理
- 单个会话恢复失败不影响其他会话
- 损坏的会话文件会被跳过
- 所有错误都会记录到日志
- 消息恢复失败会记录警告但不中断会话恢复

## 测试步骤

### 1. 创建会话并发送消息
```bash
# 创建会话
curl -X POST http://localhost:3001/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"name": "测试会话"}'

# 记录返回的session ID

# 加入会话
curl -X POST http://localhost:3001/api/sessions/{session-id}/join \
  -H "Content-Type: application/json" \
  -d '{"participant": {"id": "user1", "name": "测试用户"}}'

# 发送消息
curl -X POST http://localhost:3001/api/sessions/{session-id}/messages \
  -H "Content-Type: application/json" \
  -d '{"senderId": "user1", "content": "你好"}'
```

### 2. 验证自动保存
```bash
# 检查会话文件是否存在
ls -la .data/sessions/

# 查看会话内容
cat .data/sessions/{session-id}.json
```

### 3. 重启Colony
```bash
# 停止Colony
Ctrl+C

# 重新启动
npm start
```

### 4. 验证恢复
```bash
# 列出活跃会话（应该包含之前的会话）
curl http://localhost:3001/api/sessions

# 获取会话消息（应该包含之前的消息）
curl http://localhost:3001/api/sessions/{session-id}/messages

# 验证消息数量
curl http://localhost:3001/api/sessions/{session-id}/messages | jq '.messages | length'
```

**期望结果**：
- 会话列表包含重启前的会话
- 消息历史完整保留
- 消息顺序正确
- 所有消息元数据（sender, timestamp等）都存在

### 5. 测试删除
```bash
# 删除会话
curl -X DELETE http://localhost:3001/api/sessions/{session-id}

# 验证文件已删除
ls -la .data/sessions/
```

## 与长期记忆的关系

会话持久化和Mem0长期记忆是互补的：

- **会话持久化**：保存完整的对话历史和会话状态
  - 用途：重启后恢复会话
  - 存储：本地JSON文件
  - 范围：单个会话的所有消息

- **Mem0长期记忆**：提取和存储语义记忆
  - 用途：跨会话的知识共享和检索
  - 存储：Qdrant向量数据库
  - 范围：所有会话的重要信息

两者配合使用：
1. 会话持久化确保对话不丢失
2. Mem0提取重要信息到长期记忆
3. 新会话可以检索历史会话的知识

## 总结

### 已实现
- ✅ 自动保存会话状态
- ✅ 启动时自动恢复所有会话
- ✅ 完整的会话管理API
- ✅ 删除会话同时清理磁盘
- ✅ 错误处理和日志记录
- ✅ 消息历史完整恢复
- ✅ 默认agent设置恢复

### 效果
- ✅ 重启后会话不丢失
- ✅ 消息历史完整保留（包括所有元数据）
- ✅ 参与者状态恢复
- ✅ 默认agent设置恢复
- ✅ 无需手动管理会话
- ✅ 对话可以无缝继续

### 下一步优化（可选）
- 添加会话归档功能（移动旧会话到archive目录）
- 实现会话搜索和过滤
- 添加会话导出/导入功能
- 优化大量会话的启动性能
- 添加消息历史分页加载（对于超长会话）
