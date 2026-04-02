# M2.1 Stage 1: Initial Requirements

## 1. 核心需求

### 1.1 自动同步（stage->board）
- **频率**：默认每 1 分钟调度一次
- **重试策略**：指数退避（1m/2m/4m，上限 15m）
- **幂等保证**：幂等键 = `workflow_id + source_stage_event_id + action`
- **失败处理**：连续失败 15m 后告警，恢复后 30m 内清空待处理队列

### 1.2 事件归档
- **触发条件**：workflow 进入 Stage 9（Completed）
- **归档范围**：该 workflow 的全部 board_events
- **归档目标**：独立归档层（与在线层隔离）
- **保留策略**：在线层保留最近 30 天，归档层永久保留

### 1.3 跨归档分页查询
- **统一游标**：`cursor_version/layer/event_id/ts`（毫秒时间戳）
- **查询接口**：`board.events` 自动跨层查询
- **性能要求**：归档运行时 p95 延迟增幅 < 10%
- **一致性保证**：无重复/漏读

## 2. 接口契约

### 2.1 board.sync（新增）
```typescript
interface BoardSyncRequest {
  workflow_id: string;
  force?: boolean;  // 强制同步，忽略幂等检查
}

interface BoardSyncResponse {
  synced_events: number;
  skipped_events: number;  // 幂等跳过
  next_sync_at: string;    // ISO 8601
}
```

### 2.2 board.events（扩展）
```typescript
interface BoardEventsRequest {
  workflow_id: string;
  cursor?: string;  // 格式: v1/online|archive/event_id/ts_ms
  limit?: number;   // 默认 50，最大 200
}

interface BoardEventsResponse {
  events: BoardEvent[];
  cursor: string | null;  // 下一页游标
  has_more: boolean;
  metadata: {
    layer: 'online' | 'archive';
    total_scanned: number;
  };
}
```

### 2.3 board.archive（新增，内部接口）
```typescript
interface BoardArchiveRequest {
  workflow_id: string;
}

interface BoardArchiveResponse {
  archived_count: number;
  archive_id: string;
  archived_at: string;
}
```

## 3. 数据模型

### 3.1 同步状态表（新增）
```typescript
interface WorkflowSyncState {
  workflow_id: string;
  last_synced_event_id: string;
  last_synced_at: string;
  next_sync_at: string;
  retry_count: number;
  last_error: string | null;
}
```

### 3.2 幂等记录表（新增）
```typescript
interface SyncIdempotencyRecord {
  idempotency_key: string;  // workflow_id + source_stage_event_id + action
  workflow_id: string;
  source_stage_event_id: string;
  action: string;
  created_at: string;
  ttl: number;  // 7 天后自动清理
}
```

### 3.3 归档元数据表（新增）
```typescript
interface ArchiveMetadata {
  archive_id: string;
  workflow_id: string;
  event_count: number;
  archived_at: string;
  storage_path: string;
}
```

## 4. 可行性门槛

### 4.1 调度可行性
- **p99 漂移**：< 30s（1 分钟周期下）
- **并发能力**：支持 100+ workflow 同时调度
- **恢复能力**：15m 失败后，30m 内清空堆积

### 4.2 查询性能
- **在线层 p95**：< 50ms
- **归档层 p95**：< 200ms
- **跨层查询 p95**：< 250ms
- **归档运行时增幅**：< 10%

### 4.3 存储可行性
- **归档压缩率**：> 50%（相比在线层）
- **归档访问频率**：< 5% 总查询量
- **在线层清理**：30 天后自动迁移

## 5. 安全与鉴权

### 5.1 归档层鉴权
- **规则**：与在线层保持同等强度
- **实现**：复用现有 workflow 鉴权逻辑
- **审计**：归档访问记录独立审计日志

### 5.2 幂等键安全
- **防篡改**：幂等键包含 workflow_id 防止跨 workflow 攻击
- **TTL 保护**：7 天后自动清理，防止无限增长

## 6. 回滚策略

### 6.1 同步回滚
- **触发条件**：连续失败 > 15m 或数据不一致
- **回滚动作**：
  1. 停止调度器
  2. 清空 `WorkflowSyncState` 表
  3. 重置 `last_synced_event_id` 为 null
  4. 手动触发全量同步

### 6.2 归档回滚
- **触发条件**：归档数据损坏或查询异常
- **回滚动作**：
  1. 切换查询路由至在线层 only
  2. 删除损坏归档元数据
  3. 从在线层重新归档

### 6.3 查询回滚
- **触发条件**：跨层查询出现重复/漏读
- **回滚动作**：
  1. 降级为在线层 only 查询
  2. 修复游标解析逻辑
  3. 灰度恢复跨层查询

## 7. 验收标准

### 7.1 功能验收
- [ ] 同步延迟 p99 < 2 分钟
- [ ] 幂等重试不产生重复事件
- [ ] 归档后在线层数据正确清理
- [ ] 跨归档分页无重复/漏读

### 7.2 性能验收
- [ ] 调度漂移 p99 < 30s
- [ ] 归档查询 p95 < 200ms
- [ ] 跨层查询增幅 < 10%
- [ ] 堆积恢复 < 30m

### 7.3 安全验收
- [ ] 归档层鉴权与在线层一致
- [ ] 幂等键防篡改有效
- [ ] 归档访问审计日志完整

## 8. 实施顺序

1. **Phase 1**：同步调度基础设施（幂等 + 重试）
2. **Phase 2**：归档机制（触发 + 存储 + 元数据）
3. **Phase 3**：跨归档查询（统一游标 + 路由）
4. **Phase 4**：性能优化与压测验证
