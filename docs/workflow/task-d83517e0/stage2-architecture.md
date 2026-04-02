# M2.1 Stage 2: System/Architectural Design

## 1. 系统架构

### 1.1 整体架构图
```
┌─────────────────────────────────────────────────────────┐
│                    Workflow Engine                       │
│  (stage transitions → board_events generation)           │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│              Sync Scheduler (1min interval)              │
│  - Idempotency check (workflow_id+event_id+action)      │
│  - Exponential backoff (1m/2m/4m, cap=15m)              │
│  - Failure alerting (>15m continuous failure)            │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│                  Board State Manager                     │
│  - Apply events to board snapshot                        │
│  - Maintain board.todo/in_progress/blocked/done          │
└────────────────┬────────────────────────────────────────┘
                 │
                 ├──────────────────┬──────────────────────┐
                 ▼                  ▼                      ▼
         ┌──────────────┐   ┌──────────────┐    ┌──────────────┐
         │ Online Layer │   │Archive Layer │    │ Query Router │
         │ (30d events) │   │(永久保留)     │    │(统一游标)     │
         └──────────────┘   └──────────────┘    └──────────────┘
```

### 1.2 核心组件

#### 1.2.1 Sync Scheduler
- **职责**：定时扫描 workflow stage 变更，生成 board 同步任务
- **调度策略**：
  - 默认 1 分钟轮询一次
  - 每个 workflow 维护 `last_synced_event_id`
  - 增量同步（只处理新事件）
- **幂等保证**：
  - 幂等键 = `${workflow_id}:${source_stage_event_id}:${action}`
  - TTL = 7 天（自动清理）
- **重试策略**：
  - 指数退避：1m → 2m → 4m → 8m → 15m（cap）
  - 连续失败 15m 后触发告警
  - 恢复后 30m 内清空堆积队列

#### 1.2.2 Board State Manager
- **职责**：应用事件流到 board 快照
- **状态模型**：
  ```typescript
  interface BoardSnapshot {
    workflow_id: string;
    todo: string[];          // task_card_id[]
    in_progress: string[];
    blocked: string[];
    done: string[];
    last_event_id: string;
    last_updated_at: string;
  }
  ```
- **事件应用规则**：
  - `card_created` → 加入 `todo`
  - `card_moved` → 从旧列表移除，加入新列表
  - `card_blocked` → 移至 `blocked`
  - `card_completed` → 移至 `done`

#### 1.2.3 Archive Manager
- **触发条件**：workflow 进入 Stage 9（Completed）
- **归档流程**：
  1. 查询该 workflow 的全部 board_events
  2. 写入归档层（独立存储）
  3. 记录归档元数据（archive_id, event_count, archived_at）
  4. 30 天后清理在线层数据
- **归档格式**：
  ```typescript
  interface ArchivedWorkflow {
    archive_id: string;
    workflow_id: string;
    events: BoardEvent[];
    metadata: {
      event_count: number;
      archived_at: string;
      storage_path: string;
    };
  }
  ```

#### 1.2.4 Query Router
- **职责**：统一跨层查询入口
- **游标协议**：
  ```
  格式: v1/{layer}/{event_id}/{ts_ms}
  示例: v1/online/evt_abc123/1735689600000
  ```
- **路由逻辑**：
  1. 解析游标，确定起始层（online/archive）
  2. 在当前层查询，直到 limit 满足或层耗尽
  3. 若当前层不足，切换到下一层继续查询
  4. 返回新游标（指向下次查询起点）
- **性能优化**：
  - 在线层优先（90%+ 查询命中）
  - 归档层懒加载（仅在需要时访问）
  - 游标携带层信息（避免重复扫描）

## 2. 数据流设计

### 2.1 同步流程
```
1. Workflow stage transition
   ↓
2. Generate stage_event (workflow history)
   ↓
3. Sync Scheduler detects new event
   ↓
4. Check idempotency (skip if duplicate)
   ↓
5. Generate board_event (card_moved/card_created/etc)
   ↓
6. Apply event to BoardSnapshot
   ↓
7. Update last_synced_event_id
```

### 2.2 归档流程
```
1. Workflow enters Stage 9
   ↓
2. Archive Manager triggered
   ↓
3. Query all board_events for workflow
   ↓
4. Write to Archive Layer
   ↓
5. Record ArchiveMetadata
   ↓
6. Schedule online layer cleanup (30d later)
```

### 2.3 查询流程
```
1. Client calls board.events(workflow_id, cursor?)
   ↓
2. Query Router parses cursor
   ↓
3. Query current layer (online/archive)
   ↓
4. If insufficient results, switch to next layer
   ↓
5. Return events + new cursor + has_more flag
```

## 3. 技术选型

### 3.1 调度器实现
- **方案**：基于现有 Colony 调度基础设施
- **实现**：
  - 使用 `setInterval` 或 cron-like 调度器
  - 每个 workflow 独立调度（避免全局锁）
  - 调度状态持久化（支持重启恢复）

### 3.2 存储层实现
- **在线层**：复用现有 workflow 存储（JSON 文件或数据库）
- **归档层**：独立存储（可选 S3/本地文件系统）
- **索引**：
  - 在线层：`workflow_id + event_id` 主键
  - 归档层：`archive_id + workflow_id` 索引

### 3.3 幂等实现
- **存储**：内存 Map + 定期持久化（或直接用数据库）
- **TTL**：7 天后自动清理（避免无限增长）
- **冲突处理**：幂等键冲突时直接跳过（不报错）

## 4. 性能设计

### 4.1 调度性能
- **目标**：支持 100+ workflow 并发调度
- **优化**：
  - 每个 workflow 独立调度（无全局锁）
  - 增量同步（只处理新事件）
  - 批量处理（一次调度处理多个事件）

### 4.2 查询性能
- **在线层**：
  - 索引：`workflow_id + event_id`
  - 目标：p95 < 50ms
- **归档层**：
  - 索引：`archive_id + workflow_id`
  - 目标：p95 < 200ms
- **跨层查询**：
  - 在线层优先（90%+ 命中）
  - 归档层懒加载
  - 目标：p95 < 250ms

### 4.3 存储性能
- **在线层**：保留 30 天（自动清理）
- **归档层**：压缩存储（目标压缩率 > 50%）
- **清理策略**：定期扫描（每天一次）

## 5. 安全设计

### 5.1 鉴权
- **规则**：归档层与在线层保持同等鉴权强度
- **实现**：
  - 复用现有 workflow 鉴权逻辑
  - 归档访问需验证 `workflow_id` 权限
  - 禁止跨 workflow 访问

### 5.2 审计
- **在线层访问**：记录到现有审计日志
- **归档层访问**：独立审计日志（包含 archive_id）
- **同步操作**：记录幂等键、重试次数、失败原因

### 5.3 防篡改
- **幂等键**：包含 `workflow_id` 防止跨 workflow 攻击
- **游标**：包含 `cursor_version` 防止协议降级攻击
- **归档**：只读（禁止修改已归档数据）

## 6. 可观测性

### 6.1 监控指标
- **调度器**：
  - `sync_scheduler_lag_seconds`（调度延迟）
  - `sync_scheduler_retry_count`（重试次数）
  - `sync_scheduler_failure_count`（失败次数）
- **查询**：
  - `board_events_query_latency_ms`（查询延迟）
  - `board_events_query_layer`（查询层分布）
  - `board_events_query_cursor_parse_errors`（游标解析错误）
- **归档**：
  - `archive_operation_count`（归档操作次数）
  - `archive_event_count`（归档事件数）
  - `archive_storage_bytes`（归档存储大小）

### 6.2 告警规则
- **调度延迟**：p99 > 2 分钟
- **连续失败**：> 15 分钟
- **查询延迟**：p95 > 250ms
- **归档失败**：任何归档操作失败

### 6.3 日志
- **调度日志**：记录每次调度的 workflow_id、event_id、结果
- **查询日志**：记录 workflow_id、cursor、layer、latency
- **归档日志**：记录 workflow_id、archive_id、event_count、duration

## 7. 回滚与灾难恢复

### 7.1 同步回滚
- **场景**：数据不一致或连续失败
- **步骤**：
  1. 停止调度器
  2. 清空 `WorkflowSyncState` 表
  3. 重置 `last_synced_event_id` 为 null
  4. 手动触发全量同步

### 7.2 归档回滚
- **场景**：归档数据损坏
- **步骤**：
  1. 切换查询路由至在线层 only
  2. 删除损坏归档元数据
  3. 从在线层重新归档

### 7.3 查询降级
- **场景**：跨层查询异常
- **步骤**：
  1. 降级为在线层 only 查询
  2. 修复游标解析逻辑
  3. 灰度恢复跨层查询

## 8. 实施计划

### Phase 1: 同步调度基础设施（3-5 天）
- [ ] 实现 Sync Scheduler（1min 轮询）
- [ ] 实现幂等检查（workflow_id+event_id+action）
- [ ] 实现重试策略（指数退避）
- [ ] 单元测试（正常/异常/边界）

### Phase 2: 归档机制（2-3 天）
- [ ] 实现 Archive Manager（触发 + 存储）
- [ ] 实现归档元数据管理
- [ ] 实现在线层清理（30d TTL）
- [ ] 单元测试（归档/清理/恢复）

### Phase 3: 跨归档查询（3-4 天）
- [ ] 实现统一游标协议（v1/layer/event_id/ts）
- [ ] 实现 Query Router（跨层查询）
- [ ] 实现性能优化（在线层优先）
- [ ] 单元测试（单层/跨层/边界）

### Phase 4: 集成测试与压测（2-3 天）
- [ ] 端到端测试（同步→归档→查询）
- [ ] 性能压测（调度/查询/归档）
- [ ] 故障注入测试（重试/降级/回滚）
- [ ] 文档与交付

**总计**：10-15 天
