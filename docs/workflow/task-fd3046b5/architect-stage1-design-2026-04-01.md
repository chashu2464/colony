# M2: workflow-board 告示牌模式落地 - Stage 1 Design

- Task ID: `fd3046b5`
- Stage: 1 (Design)
- Date: `2026-04-01`
- Owner: architect
- Workflow Version: `v2`

## 1) 设计目标

实现告示牌模式的三大核心能力：
1. **当前态可见**：一次查询获取任务当前状态（stage + owner + todo/in_progress/blocked/done）
2. **过程可追溯**：事件流记录所有状态变更，支持分页回放
3. **阻塞可定位**：阻塞项必须包含机读原因码和责任人

## 2) 数据模型设计

### 2.1 BoardSnapshot（当前态快照）

存储在 workflow state 的 `extensions.board` 字段中。

```json
{
  "board": {
    "todo": [
      {
        "id": "string",           // 任务卡 ID（唯一）
        "title": "string",        // 任务标题
        "owner": "string",        // 责任人（agent ID）
        "created_at": "ISO8601"   // 创建时间
      }
    ],
    "in_progress": [
      {
        "id": "string",
        "title": "string",
        "owner": "string",
        "started_at": "ISO8601"   // 开始时间
      }
    ],
    "blocked": [
      {
        "id": "string",
        "title": "string",
        "owner": "string",
        "block_reason": "string",      // 机读原因码（必填）
        "block_message": "string",     // 人类可读描述
        "blocked_at": "ISO8601",       // 阻塞时间
        "related_event_id": "string?"  // 关联事件 ID（可选）
      }
    ],
    "done": [
      {
        "id": "string",
        "title": "string",
        "owner": "string",
        "completed_at": "ISO8601"  // 完成时间
      }
    ]
  }
}
```

**设计决策**：
- 采用四列看板模型（todo/in_progress/blocked/done）
- blocked 项强制要求 `block_reason`（机读）和 `owner`
- 时间戳字段根据状态不同（created_at/started_at/blocked_at/completed_at）

### 2.2 BoardEvent（事件流）

存储在 workflow state 的 `board_events` 数组中（新增顶层字段）。

```json
{
  "board_events": [
    {
      "seq": 1,                      // 序列号（从 1 开始）
      "event_id": "string",          // 事件唯一 ID
      "task_id": "string",           // 任务 ID
      "actor": "string",             // 操作者（agent ID）
      "action": "string",            // 动作类型
      "from_stage": "number?",       // 源阶段（可选）
      "to_stage": "number?",         // 目标阶段（可选）
      "timestamp": "ISO8601",        // 事件时间
      "evidence_refs": ["string"],   // 证据文件路径列表
      "metadata": {                  // 扩展元数据
        "board_card_id": "string?",  // 关联的看板卡片 ID
        "review_status": "string?",  // 评审状态
        "notes": "string?"           // 备注
      }
    }
  ]
}
```

**设计决策**：
- 事件流 append-only，不可修改历史
- `seq` 字段确保顺序，支持分页查询
- `metadata` 字段支持扩展，避免频繁修改 schema

### 2.3 BoardBlocker（阻塞项视图）

这是一个派生视图，从 `extensions.board.blocked` 聚合而来，不单独存储。

```json
{
  "blockers": [
    {
      "id": "string",
      "title": "string",
      "owner": "string",
      "block_reason": "string",      // 机读原因码
      "block_message": "string",     // 人类可读描述
      "blocked_at": "ISO8601",
      "related_event_id": "string?",
      "task_id": "string",           // 所属任务 ID
      "stage_name": "string"         // 所属阶段名称
    }
  ]
}
```

## 3) API 契约设计

### 3.1 board.get（获取当前态）

**请求**：
```json
{
  "action": "board.get",
  "task_id": "string?"  // 可选，不传则返回当前房间任务
}
```

**响应**：
```json
{
  "task_id": "string",
  "workflow_version": "string",
  "current_stage": "number",
  "stage_name": "string",
  "owner": "string",
  "board": {
    "todo": [...],
    "in_progress": [...],
    "blocked": [...],
    "done": [...]
  },
  "updated_at": "ISO8601"
}
```

**错误码**：
- `BOARD_NOT_FOUND`: 任务不存在或未启用 board 模式
- `BOARD_DISABLED`: v1 任务未启用 board 模式

### 3.2 board.events（获取事件流）

**请求**：
```json
{
  "action": "board.events",
  "task_id": "string?",
  "limit": "number?",    // 默认 50，最大 200
  "offset": "number?",   // 默认 0
  "since_seq": "number?" // 可选，返回 seq > since_seq 的事件
}
```

**响应**：
```json
{
  "task_id": "string",
  "events": [...],
  "pagination": {
    "total": "number",
    "limit": "number",
    "offset": "number",
    "has_more": "boolean"
  }
}
```

**错误码**：
- `BOARD_NOT_FOUND`: 任务不存在
- `INVALID_PAGINATION`: limit 或 offset 参数非法

### 3.3 board.blockers（获取阻塞项）

**请求**：
```json
{
  "action": "board.blockers",
  "task_id": "string?",
  "owner": "string?"  // 可选，按责任人过滤
}
```

**响应**：
```json
{
  "task_id": "string",
  "blockers": [...],
  "count": "number"
}
```

**错误码**：
- `BOARD_NOT_FOUND`: 任务不存在

### 3.4 board.update（更新看板状态）

**请求**：
```json
{
  "action": "board.update",
  "task_id": "string?",
  "operations": [
    {
      "op": "add|move|remove|block|unblock",
      "card_id": "string?",
      "from_column": "todo|in_progress|blocked|done",
      "to_column": "todo|in_progress|blocked|done",
      "card": {
        "title": "string",
        "owner": "string",
        "block_reason": "string?",
        "block_message": "string?"
      }
    }
  ]
}
```

**响应**：
```json
{
  "task_id": "string",
  "updated_board": {...},
  "event_id": "string"
}
```

**错误码**：
- `BOARD_VALIDATION_ERROR`: 操作非法（如 block 操作缺少 block_reason）
- `BOARD_CARD_NOT_FOUND`: 卡片 ID 不存在
- `BOARD_CONCURRENT_CONFLICT`: 并发写冲突

## 4) 存储策略

### 4.1 主存储：workflow state JSON

- `extensions.board`: 存储当前态快照
- `board_events`: 存储事件流（新增顶层字段）

### 4.2 事件归档策略

当 `board_events` 数组超过 100 个事件时：
1. 将前 50 个事件归档到 `.data/workflows/archives/<task_id>_events_<timestamp>.json`
2. 从主文件中删除已归档事件
3. 在主文件中记录归档文件路径

**归档文件格式**：
```json
{
  "task_id": "string",
  "archived_at": "ISO8601",
  "events": [...]
}
```

### 4.3 查询策略

- `board.get`: 仅读取主文件的 `extensions.board`
- `board.events`: 先读取主文件，如需更早事件则读取归档文件
- `board.blockers`: 仅读取主文件的 `extensions.board.blocked`

## 5) 实施策略

### 5.1 分阶段实施

**Phase 1: 核心数据模型**（本次 M2）
- 实现 `BoardSnapshot` 和 `BoardEvent` 数据结构
- 实现 `board.get`、`board.events`、`board.blockers` 查询
- 实现 `board.update` 基本操作（add/move/remove/block/unblock）

**Phase 2: 自动同步**（后续优化）
- workflow stage 变更时自动更新 board 状态
- 自动创建 board event 记录

**Phase 3: 事件归档**（后续优化）
- 实现事件归档机制
- 实现跨归档文件的分页查询

### 5.2 兼容性策略

- v2 workflow 任务默认启用 `board_mode: true`
- v1 workflow 任务保持 `board_mode: false`，查询时返回 `BOARD_DISABLED` 错误
- 可通过 `update` action 手动启用 board 模式

### 5.3 并发控制

复用 M1 的 lock 机制：
- 所有 board 操作必须先获取 workflow lock
- 使用 mkdir-based atomic locking（5 秒超时）
- 写入使用 temp-then-rename 模式确保原子性

## 6) 验收标准（可测试）

### 6.1 功能验收

- [ ] `board.get` 返回完整的 board 快照（包含 todo/in_progress/blocked/done）
- [ ] `board.events` 支持分页查询（limit + offset）
- [ ] `board.events` 支持增量查询（since_seq）
- [ ] `board.blockers` 返回所有阻塞项，每项包含 block_reason + owner
- [ ] `board.update` 支持 add/move/remove/block/unblock 操作
- [ ] block 操作缺少 block_reason 时返回 `BOARD_VALIDATION_ERROR`
- [ ] v1 任务查询 board 时返回 `BOARD_DISABLED`

### 6.2 性能验收

- [ ] `board.get` 查询延迟 < 100ms（P95）
- [ ] `board.events` 分页查询延迟 < 200ms（P95）
- [ ] 单任务状态文件大小 < 1MB（100 个事件以内）

### 6.3 并发验收

- [ ] 两个 agent 同时执行 `board.update`，一个成功一个返回 lock timeout
- [ ] 并发更新不丢失数据（通过 event seq 验证）

## 7) 风险与缓解

### R1: 事件流膨胀
- **缓解**：Phase 3 实现事件归档机制
- **临时方案**：限制单任务最多 100 个事件（超过后警告）

### R2: 查询性能下降
- **缓解**：board.get 仅读取快照，不遍历事件流
- **监控**：记录查询延迟 P95/P99

### R3: 并发写冲突
- **缓解**：复用 M1 的 lock 机制
- **降级**：lock timeout 时返回明确错误码，由调用方重试

## 8) 实施文件清单

### 8.1 新增文件
- `skills/dev-workflow/scripts/board.sh`: board 操作的核心逻辑
- `skills/dev-workflow/schemas/board_snapshot.json`: BoardSnapshot JSON schema
- `skills/dev-workflow/schemas/board_event.json`: BoardEvent JSON schema

### 8.2 修改文件
- `skills/dev-workflow/scripts/handler.sh`: 增加 board.* action 路由
- `.data/workflows/*.json`: 增加 `board_events` 顶层字段

### 8.3 测试文件
- `tests/workflow_board_test.sh`: board 功能集成测试
- `src/tests/unit/workflow/boardOperations.test.ts`: board 操作单元测试

## 9) 下一步行动

1. 进入 Stage 2 (Build)，由 developer 实施
2. 优先实现 Phase 1 核心功能
3. Phase 2/3 作为后续优化项，不阻塞 M2 交付
