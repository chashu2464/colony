# M2: workflow-board 告示牌模式落地 - Stage 2 System Design

- Task ID: `fd3046b5`
- Stage: 2 (System/Architectural Design)
- Date: `2026-04-01`
- Owner: architect
- Workflow Version: `v2`

## 1) 系统架构概览

### 1.1 架构分层

```
┌─────────────────────────────────────────────────────────┐
│  API Layer (handler.sh)                                 │
│  - board.get / board.events / board.blockers / update   │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Business Logic Layer (board.sh)                        │
│  - Validation / State Mutation / Event Generation       │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Storage Layer (workflow state JSON)                    │
│  - extensions.board (snapshot)                          │
│  - board_events (event stream)                          │
└─────────────────────────────────────────────────────────┘
```

**设计理由**：
- 三层架构确保关注点分离：API 层负责路由与参数解析，业务层负责校验与状态变更，存储层负责持久化
- board.sh 独立模块化，便于单元测试与后续扩展（如事件归档）

### 1.2 核心组件

| 组件 | 职责 | 输入 | 输出 |
|------|------|------|------|
| `handler.sh` | API 路由与分派 | JSON action 请求 | JSON 响应或错误码 |
| `board.sh` | Board 业务逻辑 | 操作类型 + 参数 | 更新后的 state + event |
| `lock.sh` | 并发控制（复用 M1） | task_id | lock token |
| `validator.sh` | Schema 校验 | JSON + schema | 校验结果 |

## 2) 数据流设计

### 2.1 board.get 查询流程

```
User Request
    ↓
handler.sh (parse action)
    ↓
board.sh::get_snapshot()
    ↓
Read .data/workflows/<task_id>.json
    ↓
Extract extensions.board
    ↓
Return JSON response
```

**关键决策**：
- 仅读取主文件，不遍历事件流（性能优化）
- 如 board_mode=false，返回 BOARD_DISABLED 错误

### 2.2 board.update 写入流程

```
User Request
    ↓
handler.sh (parse action + operations)
    ↓
Acquire lock (5s timeout)
    ↓
board.sh::validate_operations()
    ↓
board.sh::apply_operations()
    ├─ Update extensions.board (snapshot)
    └─ Append board_events (event)
    ↓
Write to temp file
    ↓
Atomic rename (mv)
    ↓
Release lock
    ↓
Return updated board + event_id
```

**关键决策**：
- 先校验后执行（fail-fast）
- 使用 temp-then-rename 确保原子性
- 每次 update 生成一个 BoardEvent（seq 自增）

### 2.3 board.events 分页查询流程

```
User Request (limit=50, offset=0)
    ↓
handler.sh (parse pagination params)
    ↓
board.sh::get_events()
    ↓
Read board_events array
    ↓
Apply offset + limit
    ↓
Return events + pagination metadata
```

**关键决策**：
- Phase 1 仅支持主文件查询（不跨归档）
- Phase 3 再实现归档文件的跨文件分页

## 3) 并发控制设计

### 3.1 Lock 机制（复用 M1）

```bash
# Acquire lock
LOCK_DIR=".data/workflows/.lock_${TASK_ID}"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  # Wait up to 5 seconds
  for i in {1..10}; do
    sleep 0.5
    if mkdir "$LOCK_DIR" 2>/dev/null; then
      break
    fi
  done
  if [ ! -d "$LOCK_DIR" ]; then
    echo '{"error": "BOARD_CONCURRENT_CONFLICT"}' >&2
    exit 3
  fi
fi

# Critical section
# ...

# Release lock
rmdir "$LOCK_DIR"
```

**设计理由**：
- mkdir 是原子操作，天然支持分布式锁
- 5 秒超时避免死锁
- 返回明确错误码（exit 3）供调用方重试

### 3.2 原子写入

```bash
# Write to temp file
TEMP_FILE="${STATE_FILE}.tmp.$$"
echo "$NEW_STATE" > "$TEMP_FILE"

# Atomic rename
mv "$TEMP_FILE" "$STATE_FILE"
```

**设计理由**：
- mv 是原子操作，避免部分写入
- 使用 PID ($) 确保 temp 文件唯一性

## 4) 错误处理设计

### 4.1 错误码体系

| 错误码 | HTTP 等价 | 含义 | 重试策略 |
|--------|-----------|------|----------|
| `BOARD_NOT_FOUND` | 404 | 任务不存在 | 不重试 |
| `BOARD_DISABLED` | 403 | v1 任务未启用 board | 不重试 |
| `BOARD_VALIDATION_ERROR` | 400 | 参数非法 | 不重试 |
| `BOARD_CARD_NOT_FOUND` | 404 | 卡片 ID 不存在 | 不重试 |
| `BOARD_CONCURRENT_CONFLICT` | 409 | 并发写冲突 | 可重试（指数退避） |
| `BOARD_INTERNAL_ERROR` | 500 | 内部错误 | 可重试（最多 3 次） |

**设计理由**：
- 错误码机读，便于自动化测试与监控
- 区分可重试与不可重试错误，避免无效重试

### 4.2 Fail-Closed 原则

所有校验失败必须阻断操作：
- block 操作缺少 `block_reason` → 返回 `BOARD_VALIDATION_ERROR`
- 卡片 ID 不存在 → 返回 `BOARD_CARD_NOT_FOUND`
- 并发冲突 → 返回 `BOARD_CONCURRENT_CONFLICT`

**设计理由**：
- 宁可拒绝合法请求，也不允许非法状态写入
- 错误信息必须包含失败原因（machine-readable）

## 5) Schema 设计

### 5.1 BoardSnapshot Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["todo", "in_progress", "blocked", "done"],
  "properties": {
    "todo": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "title", "owner", "created_at"],
        "properties": {
          "id": {"type": "string", "minLength": 1},
          "title": {"type": "string", "minLength": 1},
          "owner": {"type": "string", "minLength": 1},
          "created_at": {"type": "string", "format": "date-time"}
        }
      }
    },
    "in_progress": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "title", "owner", "started_at"],
        "properties": {
          "id": {"type": "string", "minLength": 1},
          "title": {"type": "string", "minLength": 1},
          "owner": {"type": "string", "minLength": 1},
          "started_at": {"type": "string", "format": "date-time"}
        }
      }
    },
    "blocked": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "title", "owner", "block_reason", "blocked_at"],
        "properties": {
          "id": {"type": "string", "minLength": 1},
          "title": {"type": "string", "minLength": 1},
          "owner": {"type": "string", "minLength": 1},
          "block_reason": {"type": "string", "minLength": 1},
          "block_message": {"type": "string"},
          "blocked_at": {"type": "string", "format": "date-time"},
          "related_event_id": {"type": "string"}
        }
      }
    },
    "done": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "title", "owner", "completed_at"],
        "properties": {
          "id": {"type": "string", "minLength": 1},
          "title": {"type": "string", "minLength": 1},
          "owner": {"type": "string", "minLength": 1},
          "completed_at": {"type": "string", "format": "date-time"}
        }
      }
    }
  }
}
```

**设计理由**：
- 使用 JSON Schema Draft 07（jq 原生支持）
- blocked 项强制要求 block_reason（fail-closed）
- 时间戳使用 ISO8601 格式（date-time）

### 5.2 BoardEvent Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["seq", "event_id", "task_id", "actor", "action", "timestamp"],
  "properties": {
    "seq": {"type": "integer", "minimum": 1},
    "event_id": {"type": "string", "minLength": 1},
    "task_id": {"type": "string", "minLength": 1},
    "actor": {"type": "string", "minLength": 1},
    "action": {"type": "string", "enum": ["add", "move", "remove", "block", "unblock", "stage_change"]},
    "from_stage": {"type": "integer", "minimum": 0},
    "to_stage": {"type": "integer", "minimum": 0},
    "timestamp": {"type": "string", "format": "date-time"},
    "evidence_refs": {
      "type": "array",
      "items": {"type": "string"}
    },
    "metadata": {
      "type": "object",
      "properties": {
        "board_card_id": {"type": "string"},
        "review_status": {"type": "string"},
        "notes": {"type": "string"}
      }
    }
  }
}
```

**设计理由**：
- seq 从 1 开始递增（便于分页与去重）
- action 枚举限制（防止非法动作）
- metadata 可扩展（避免频繁修改 schema）

## 6) 实施文件结构

```
skills/dev-workflow/
├── scripts/
│   ├── handler.sh          # 主入口（增加 board.* 路由）
│   ├── board.sh            # Board 业务逻辑（新增）
│   └── lock.sh             # 并发控制（复用 M1）
├── schemas/
│   ├── board_snapshot.json # BoardSnapshot schema（新增）
│   └── board_event.json    # BoardEvent schema（新增）
└── README.md               # 更新文档

tests/
├── workflow_board_test.sh  # Board 集成测试（新增）
└── unit/
    └── workflow/
        └── boardOperations.test.ts  # Board 单元测试（新增）

.data/workflows/
├── <task_id>.json          # 主状态文件（增加 board_events 字段）
└── archives/               # 事件归档目录（Phase 3）
    └── <task_id>_events_<timestamp>.json
```

## 7) API 实现细节

### 7.1 handler.sh 路由增强

```bash
# 在 handler.sh 中增加 board.* action 路由
case "$ACTION" in
  "board.get")
    source "$(dirname "$0")/board.sh"
    board_get "$TASK_ID"
    ;;
  "board.events")
    source "$(dirname "$0")/board.sh"
    board_events "$TASK_ID" "$LIMIT" "$OFFSET" "$SINCE_SEQ"
    ;;
  "board.blockers")
    source "$(dirname "$0")/board.sh"
    board_blockers "$TASK_ID" "$OWNER"
    ;;
  "board.update")
    source "$(dirname "$0")/board.sh"
    board_update "$TASK_ID" "$OPERATIONS"
    ;;
  *)
    # 原有 action 处理
    ;;
esac
```

### 7.2 board.sh 核心函数签名

```bash
# 获取当前态快照
board_get() {
  local task_id="$1"
  # 1. 读取 state file
  # 2. 检查 board_mode
  # 3. 返回 extensions.board + metadata
}

# 获取事件流
board_events() {
  local task_id="$1"
  local limit="${2:-50}"
  local offset="${3:-0}"
  local since_seq="${4:-0}"
  # 1. 读取 board_events 数组
  # 2. 应用 offset + limit
  # 3. 返回 events + pagination
}

# 获取阻塞项
board_blockers() {
  local task_id="$1"
  local owner="$2"
  # 1. 读取 extensions.board.blocked
  # 2. 按 owner 过滤（可选）
  # 3. 返回 blockers + count
}

# 更新看板状态
board_update() {
  local task_id="$1"
  local operations="$2"  # JSON array
  # 1. Acquire lock
  # 2. Validate operations
  # 3. Apply operations (update snapshot + append event)
  # 4. Write to temp file
  # 5. Atomic rename
  # 6. Release lock
  # 7. Return updated board + event_id
}
```

## 8) 测试策略

### 8.1 单元测试（Jest）

测试文件：`src/tests/unit/workflow/boardOperations.test.ts`

测试用例：
- `board.get` 返回完整快照
- `board.get` 对 v1 任务返回 BOARD_DISABLED
- `board.events` 分页查询正确
- `board.events` 增量查询（since_seq）正确
- `board.blockers` 返回所有阻塞项
- `board.blockers` 按 owner 过滤正确
- `board.update` add 操作成功
- `board.update` move 操作成功
- `board.update` block 操作缺少 block_reason 时失败
- `board.update` 并发冲突返回 BOARD_CONCURRENT_CONFLICT

### 8.2 集成测试（Bash）

测试文件：`tests/workflow_board_test.sh`

测试场景：
- 创建 v2 任务 → board.get 返回空看板
- board.update add 卡片 → board.get 返回新卡片
- board.update move 卡片 → board.events 记录 move 事件
- board.update block 卡片 → board.blockers 返回阻塞项
- 并发执行两个 board.update → 一个成功一个返回 lock timeout

### 8.3 性能测试

测试指标：
- `board.get` 查询延迟 < 100ms（P95）
- `board.events` 分页查询延迟 < 200ms（P95）
- 单任务状态文件大小 < 1MB（100 个事件以内）

测试方法：
- 使用 `time` 命令测量延迟
- 使用 `du -h` 测量文件大小
- 生成 100 个事件后验证性能

## 9) 迁移与兼容性

### 9.1 v1 任务兼容性

- v1 任务保持 `board_mode: false`
- 查询 board 时返回 `BOARD_DISABLED` 错误
- 不自动迁移 v1 任务（避免破坏现有状态）

### 9.2 v2 任务默认行为

- 新创建的 v2 任务默认 `board_mode: true`
- 自动初始化空看板（todo/in_progress/blocked/done 均为空数组）
- 自动初始化 `board_events: []`

### 9.3 手动启用 board 模式

```bash
echo '{
  "action": "update",
  "extensions": {
    "board_mode": true,
    "board": {
      "todo": [],
      "in_progress": [],
      "blocked": [],
      "done": []
    }
  }
}' | bash scripts/handler.sh
```

## 10) 监控与可观测性

### 10.1 关键指标

| 指标 | 类型 | 阈值 | 告警条件 |
|------|------|------|----------|
| `board.get` 延迟 | P95 | < 100ms | P95 > 200ms |
| `board.events` 延迟 | P95 | < 200ms | P95 > 500ms |
| `board.update` 成功率 | % | > 99% | < 95% |
| Lock timeout 次数 | Count | < 10/hour | > 50/hour |
| 状态文件大小 | MB | < 1MB | > 5MB |

### 10.2 日志记录

关键操作必须记录日志：
- board.update 操作（包含 actor + operation + event_id）
- Lock 获取失败（包含 task_id + retry_count）
- Schema 校验失败（包含 error_code + validation_details）

日志格式：
```
[2026-04-01T12:00:00Z] [BOARD] [INFO] board.update task_id=fd3046b5 actor=developer operation=add event_id=evt_123
[2026-04-01T12:00:01Z] [BOARD] [ERROR] lock_timeout task_id=fd3046b5 retry_count=10
```

## 11) 安全考虑

### 11.1 输入校验

所有用户输入必须校验：
- task_id: 必须匹配 `^[a-f0-9]{8}$` 格式
- card_id: 必须匹配 `^[a-zA-Z0-9_-]+$` 格式
- owner: 必须是已知 agent ID
- block_reason: 必须非空且长度 < 200 字符

### 11.2 权限控制

Phase 1 不实施权限控制（所有 agent 可读写）。
Phase 2 增加权限控制：
- 仅 task owner 可执行 board.update
- 所有 agent 可执行 board.get/events/blockers

### 11.3 注入防护

- 所有 JSON 输入使用 jq 解析（防止 shell 注入）
- 文件路径必须校验（防止路径遍历）
- 不使用 eval 或动态执行用户输入

## 12) 后续优化方向（Phase 2/3）

### Phase 2: 自动同步
- workflow stage 变更时自动更新 board 状态
- 自动创建 board event 记录
- 自动将 evidence 关联到 board card

### Phase 3: 事件归档
- 实现事件归档机制（超过 100 个事件时归档前 50 个）
- 实现跨归档文件的分页查询
- 实现归档文件的压缩与清理

### Phase 4: 高级查询
- 支持按时间范围查询事件
- 支持按 actor 过滤事件
- 支持按 action 类型过滤事件

## 13) 验收标准（可测试）

### 13.1 功能验收

- [ ] `board.get` 返回完整的 board 快照（包含 todo/in_progress/blocked/done）
- [ ] `board.events` 支持分页查询（limit + offset）
- [ ] `board.events` 支持增量查询（since_seq）
- [ ] `board.blockers` 返回所有阻塞项，每项包含 block_reason + owner
- [ ] `board.update` 支持 add/move/remove/block/unblock 操作
- [ ] block 操作缺少 block_reason 时返回 `BOARD_VALIDATION_ERROR`
- [ ] v1 任务查询 board 时返回 `BOARD_DISABLED`
- [ ] 并发 update 时一个成功一个返回 `BOARD_CONCURRENT_CONFLICT`

### 13.2 性能验收

- [ ] `board.get` 查询延迟 < 100ms（P95）
- [ ] `board.events` 分页查询延迟 < 200ms（P95）
- [ ] 单任务状态文件大小 < 1MB（100 个事件以内）

### 13.3 安全验收

- [ ] 非法 task_id 返回 `BOARD_NOT_FOUND`
- [ ] 非法 card_id 返回 `BOARD_CARD_NOT_FOUND`
- [ ] block 操作缺少 block_reason 返回 `BOARD_VALIDATION_ERROR`
- [ ] 所有 JSON 输入通过 jq 解析（无 shell 注入风险）

## 14) 交付清单

### 14.1 代码文件
- `skills/dev-workflow/scripts/board.sh`（新增，约 500 行）
- `skills/dev-workflow/scripts/handler.sh`（修改，增加 board.* 路由）
- `skills/dev-workflow/schemas/board_snapshot.json`（新增）
- `skills/dev-workflow/schemas/board_event.json`（新增）

### 14.2 测试文件
- `tests/workflow_board_test.sh`（新增，约 200 行）
- `src/tests/unit/workflow/boardOperations.test.ts`（新增，约 300 行）

### 14.3 文档文件
- `skills/dev-workflow/README.md`（更新，增加 board API 文档）
- `docs/workflow/task-fd3046b5/architect-stage2-system-design-2026-04-01.md`（本文档）

## 15) 风险与缓解（更新）

### R1: 事件流膨胀
- **影响**：单任务状态文件超过 1MB，查询性能下降
- **缓解**：Phase 1 限制单任务最多 100 个事件（超过后警告），Phase 3 实现归档
- **监控**：记录状态文件大小，超过 1MB 时告警

### R2: 并发写冲突
- **影响**：高频 update 时 lock timeout 增加
- **缓解**：复用 M1 的 lock 机制（5 秒超时），返回明确错误码供重试
- **监控**：记录 lock timeout 次数，超过 50/hour 时告警

### R3: Schema 不兼容
- **影响**：旧版本 agent 无法解析新 schema
- **缓解**：使用 JSON Schema 严格校验，拒绝非法输入
- **监控**：记录 schema 校验失败次数

### R4: 性能回归
- **影响**：board.get 延迟超过 100ms
- **缓解**：仅读取快照，不遍历事件流；使用 jq 高效解析 JSON
- **监控**：记录查询延迟 P95/P99

## 16) 下一步行动

1. 进入 Stage 3 (Forward Briefing)，由 developer 向 qa_lead 解释设计
2. developer 需重点说明：
   - 三层架构（API/Business/Storage）
   - 并发控制机制（lock + atomic write）
   - 错误处理策略（fail-closed + 错误码）
   - 测试策略（单元测试 + 集成测试 + 性能测试）
3. qa_lead 需确认理解：
   - 验收标准（功能/性能/安全）
   - 测试用例覆盖范围
   - 错误码与重试策略
