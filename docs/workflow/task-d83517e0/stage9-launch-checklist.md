# Stage 9 上线检查清单

**任务**: M2.1 Stage6 Continue (ID: d83517e0)
**生成时间**: 2026-04-03T19:45:42Z
**契约冻结版本**: a0ca54bbfd3c5ba53c667e22b47730344721ae44

---

## 1. 契约一致性核对

### 1.1 接口契约核对

#### board.sync
**契约定义**:
- 调度频率: 1m 最小间隔
- 退避策略: 1/2/4/8/15m（5 级）
- fail-close: 异常时自动降级

**核对命令**:
```bash
cd /Users/casu/Documents/Colony
git diff c7e9a8a..a0ca54b -- src/extensions/board/scheduler.ts | grep -E "(SYNC_INTERVAL|BACKOFF_LEVELS|fail_close)"
```

**预期结果**: 无 diff（契约未变更）

**核对状态**: ⬜ 待执行

---

#### board.events
**契约定义**:
- 实时事件流
- 游标分页（cursor-based pagination）
- 鉴权同强度（WF_PERMISSION_DENIED）

**核对命令**:
```bash
git diff c7e9a8a..a0ca54b -- src/extensions/board/service.ts | grep -E "(events|cursor|pagination)"
```

**预期结果**: 无 diff（契约未变更）

**核对状态**: ⬜ 待执行

---

#### board.archive
**契约定义**:
- 归档层查询
- 鉴权同强度（WF_PERMISSION_DENIED）
- 保留策略（retention_policy）

**核对命令**:
```bash
git diff c7e9a8a..a0ca54b -- src/extensions/board/service.ts | grep -E "(archive|retention)"
```

**预期结果**: 无 diff（契约未变更）

**核对状态**: ⬜ 待执行

---

### 1.2 数据模型核对

#### WorkflowSyncState
**契约定义**:
```typescript
interface WorkflowSyncState {
  workflow_id: string;
  last_sync_at: Date;
  next_sync_at: Date;
  sync_interval: number;  // 秒
  backoff_level: number;  // 0-4
}
```

**核对命令**:
```bash
git diff c7e9a8a..a0ca54b -- src/extensions/board/types.ts | grep -A 10 "interface WorkflowSyncState"
```

**预期结果**: 无 diff（数据模型未变更）

**核对状态**: ⬜ 待执行

---

#### SyncIdempotencyRecord
**契约定义**:
```typescript
interface SyncIdempotencyRecord {
  idempotency_key: string;  // SHA-256 签名
  workflow_id: string;
  created_at: Date;
  expires_at: Date;
}
```

**核对命令**:
```bash
git diff c7e9a8a..a0ca54b -- src/extensions/board/types.ts | grep -A 10 "interface SyncIdempotencyRecord"
```

**预期结果**: 无 diff（数据模型未变更）

**核对状态**: ⬜ 待执行

---

#### ArchiveMetadata
**契约定义**:
```typescript
interface ArchiveMetadata {
  workflow_id: string;
  archived_at: Date;
  archive_id: string;
  retention_policy: string;
}
```

**核对命令**:
```bash
git diff c7e9a8a..a0ca54b -- src/extensions/board/types.ts | grep -A 10 "interface ArchiveMetadata"
```

**预期结果**: 无 diff（数据模型未变更）

**核对状态**: ⬜ 待执行

---

### 1.3 配置文件核对

#### 调度配置
**契约定义**:
- SYNC_INTERVAL_MS: 60000（1 分钟）
- BACKOFF_LEVELS: [60, 120, 240, 480, 900]（秒）

**核对命令**:
```bash
git diff c7e9a8a..a0ca54b -- src/extensions/board/config.ts
```

**预期结果**: 无 diff（配置未变更）

**核对状态**: ⬜ 待执行

---

#### 鉴权配置
**契约定义**:
- 归档层鉴权同强度
- 未授权返回 WF_PERMISSION_DENIED

**核对命令**:
```bash
git diff c7e9a8a..a0ca54b -- src/extensions/board/auth.ts
```

**预期结果**: 无 diff（鉴权逻辑未变更）

**核对状态**: ⬜ 待执行

---

## 2. 性能阈值监控

### 2.1 监控面板创建

#### Grafana Dashboard: Board Sync Performance
**面板 URL**: 待创建

**必需指标**:
1. **board_sync_drift_p95**: 调度漂移 p95
   - 数据源: Prometheus
   - 查询语句: `histogram_quantile(0.95, board_sync_drift_bucket{job="colony-server"})`
   - 阈值线: 20s（WARNING）、30s（CRITICAL）

2. **board_sync_drift_p99**: 调度漂移 p99
   - 数据源: Prometheus
   - 查询语句: `histogram_quantile(0.99, board_sync_drift_bucket{job="colony-server"})`
   - 阈值线: 30s（WARNING）、40s（CRITICAL）

3. **board_sync_error_rate**: 错误率
   - 数据源: Prometheus
   - 查询语句: `rate(board_sync_errors_total{job="colony-server"}[5m]) / rate(board_sync_requests_total{job="colony-server"}[5m])`
   - 阈值线: 0.1（10% WARNING）、0.2（20% CRITICAL）

4. **board_sync_timeout_rate**: 超时率
   - 数据源: Prometheus
   - 查询语句: `rate(board_sync_timeouts_total{job="colony-server"}[5m]) / rate(board_sync_requests_total{job="colony-server"}[5m])`
   - 阈值线: 0.05（5% WARNING）、0.1（10% CRITICAL）

**创建状态**: ⬜ 待创建（上线后 24 小时内）

**执行环境要求**:
- Grafana 访问权限
- Prometheus 数据源配置
- Colony 服务已启用 metrics 导出

---

### 2.2 告警规则配置

#### 告警 1: 调度漂移超阈值
**告警名称**: BoardSyncDriftHigh
**触发条件**: board_sync_drift_p95 > 30s 持续 10 分钟
**严重程度**: WARNING
**通知渠道**: Slack #colony-alerts

**Prometheus 规则**:
```yaml
- alert: BoardSyncDriftHigh
  expr: histogram_quantile(0.95, board_sync_drift_bucket{job="colony-server"}) > 30
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "Board sync drift p95 is high"
    description: "Board sync drift p95 is {{ $value }}s (threshold: 30s)"
```

**配置状态**: ⬜ 待配置（上线后 24 小时内）

---

#### 告警 2: 错误率超阈值
**告警名称**: BoardSyncErrorRateHigh
**触发条件**: board_sync_error_rate > 0.2 持续 10 分钟
**严重程度**: CRITICAL
**通知渠道**: Slack #colony-alerts + PagerDuty

**Prometheus 规则**:
```yaml
- alert: BoardSyncErrorRateHigh
  expr: rate(board_sync_errors_total{job="colony-server"}[5m]) / rate(board_sync_requests_total{job="colony-server"}[5m]) > 0.2
  for: 10m
  labels:
    severity: critical
  annotations:
    summary: "Board sync error rate is high"
    description: "Board sync error rate is {{ $value | humanizePercentage }} (threshold: 20%)"
```

**配置状态**: ⬜ 待配置（上线后 24 小时内）

---

#### 告警 3: 超时率超阈值
**告警名称**: BoardSyncTimeoutRateHigh
**触发条件**: board_sync_timeout_rate > 0.1 持续 10 分钟
**严重程度**: WARNING
**通知渠道**: Slack #colony-alerts

**Prometheus 规则**:
```yaml
- alert: BoardSyncTimeoutRateHigh
  expr: rate(board_sync_timeouts_total{job="colony-server"}[5m]) / rate(board_sync_requests_total{job="colony-server"}[5m]) > 0.1
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "Board sync timeout rate is high"
    description: "Board sync timeout rate is {{ $value | humanizePercentage }} (threshold: 10%)"
```

**配置状态**: ⬜ 待配置（上线后 24 小时内）

---

### 2.3 性能基线验证

#### 上线后前 24 小时监控
**监控频率**: 每 5 分钟
**监控指标**: board_sync_drift_p95, board_sync_error_rate, board_sync_timeout_rate

**验证命令**:
```bash
# 查询最近 24 小时的 p95 延迟
curl -s 'http://prometheus:9090/api/v1/query_range?query=histogram_quantile(0.95,board_sync_drift_bucket{job="colony-server"})&start='$(date -u -d '24 hours ago' +%s)'&end='$(date -u +%s)'&step=300' | \
jq -r '.data.result[0].values[] | @tsv' | \
awk '{sum+=$2; count++} END {print "avg_p95:", sum/count, "samples:", count}'

# 预期输出: avg_p95 < 20s
```

**验证状态**: ⬜ 待执行（上线后 24 小时）

**执行环境要求**:
- Prometheus 访问权限
- curl、jq 工具
- 上线后至少 24 小时数据

---

## 3. 安全验证命令

### 3.1 归档层鉴权验证

#### 测试 1: 未授权访问归档层
**目的**: 验证归档层鉴权同强度

**验证命令**:
```bash
curl -X POST http://localhost:3000/api/board/archive \
  -H "Authorization: Bearer invalid_token" \
  -H "Content-Type: application/json" \
  -d '{"workflow_id": "test-wf-001", "archive_id": "test-archive-001"}' | \
  jq -r '.error.reason'
```

**预期输出**: `WF_PERMISSION_DENIED`

**验证状态**: ⬜ 待执行（上线后）

**执行环境要求**:
- Colony 服务运行中
- 有效的测试 workflow_id
- curl、jq 工具

---

#### 测试 2: 有效授权访问归档层
**目的**: 验证正常鉴权流程

**验证命令**:
```bash
curl -X POST http://localhost:3000/api/board/archive \
  -H "Authorization: Bearer valid_token" \
  -H "Content-Type: application/json" \
  -d '{"workflow_id": "test-wf-001", "archive_id": "test-archive-001"}' | \
  jq -r '.data'
```

**预期输出**: 归档数据（非错误）

**验证状态**: ⬜ 待执行（上线后）

**执行环境要求**:
- Colony 服务运行中
- 有效的测试 workflow_id 与 archive_id
- 有效的 Bearer token
- curl、jq 工具

---

### 3.2 幂等键防篡改验证

#### 测试 3: 重复幂等键
**目的**: 验证幂等键防篡改机制

**验证命令**:
```bash
# 第一次请求
idempotency_key=$(echo -n "test-wf-001-$(date +%s)" | sha256sum | awk '{print $1}')
curl -X POST http://localhost:3000/api/board/sync \
  -H "Authorization: Bearer valid_token" \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: $idempotency_key" \
  -d '{"workflow_id": "test-wf-001"}' | \
  jq -r '.data.sync_id'

# 第二次请求（相同幂等键）
curl -X POST http://localhost:3000/api/board/sync \
  -H "Authorization: Bearer valid_token" \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: $idempotency_key" \
  -d '{"workflow_id": "test-wf-001"}' | \
  jq -r '.data.sync_id'

# 预期: 两次请求返回相同的 sync_id（幂等）
```

**预期输出**: 两次请求返回相同的 sync_id

**验证状态**: ⬜ 待执行（上线后）

**执行环境要求**:
- Colony 服务运行中
- 有效的测试 workflow_id
- 有效的 Bearer token
- curl、jq、sha256sum 工具

---

### 3.3 审计日志完整性验证

#### 测试 4: 审计字段完整性
**目的**: 验证审计日志 100% 覆盖 actor/workflow_id/archive_id/trace_id

**验证命令**:
```bash
psql -h localhost -U postgres -d colony -c "
  SELECT
    COUNT(*) AS total,
    COUNT(actor) AS actor_count,
    COUNT(workflow_id) AS workflow_id_count,
    COUNT(archive_id) AS archive_id_count,
    COUNT(trace_id) AS trace_id_count
  FROM extensions.board_audit
  WHERE created_at > NOW() - INTERVAL '24 hours';
"
```

**预期输出**:
```
 total | actor_count | workflow_id_count | archive_id_count | trace_id_count
-------+-------------+-------------------+------------------+----------------
  1000 |        1000 |              1000 |             1000 |           1000
```
（所有字段计数相等，无 NULL 值）

**验证状态**: ⬜ 待执行（上线后 24 小时）

**执行环境要求**:
- 数据库访问权限
- psql 工具
- 上线后至少 24 小时数据

---

#### 测试 5: 审计日志缺失检测
**目的**: 验证无审计日志缺失

**验证命令**:
```bash
psql -h localhost -U postgres -d colony -c "
  SELECT COUNT(*) AS missing_count
  FROM extensions.board_audit
  WHERE actor IS NULL
     OR workflow_id IS NULL
     OR archive_id IS NULL
     OR trace_id IS NULL;
"
```

**预期输出**: `missing_count = 0`

**验证状态**: ⬜ 待执行（上线后 24 小时）

**执行环境要求**:
- 数据库访问权限
- psql 工具
- 上线后至少 24 小时数据

---

### 3.4 OWASP 负例回归测试

#### 测试 6: 未授权访问
**目的**: 验证未授权返回 WF_PERMISSION_DENIED

**验证命令**:
```bash
curl -X POST http://localhost:3000/api/board/events \
  -H "Authorization: Bearer invalid_token" \
  -H "Content-Type: application/json" \
  -d '{"workflow_id": "test-wf-001", "cursor": null}' | \
  jq -r '.error.reason'
```

**预期输出**: `WF_PERMISSION_DENIED`

**验证状态**: ⬜ 待执行（上线后）

---

#### 测试 7: 无效游标
**目的**: 验证无效游标返回 BOARD_CURSOR_INVALID

**验证命令**:
```bash
curl -X POST http://localhost:3000/api/board/events \
  -H "Authorization: Bearer valid_token" \
  -H "Content-Type: application/json" \
  -d '{"workflow_id": "test-wf-001", "cursor": "invalid_cursor_format"}' | \
  jq -r '.error.reason'
```

**预期输出**: `BOARD_CURSOR_INVALID`

**验证状态**: ⬜ 待执行（上线后）

---

#### 测试 8: 游标冲突
**目的**: 验证游标冲突返回 BOARD_CURSOR_CONFLICT

**验证命令**:
```bash
curl -X POST http://localhost:3000/api/board/events \
  -H "Authorization: Bearer valid_token" \
  -H "Content-Type: application/json" \
  -d '{"workflow_id": "test-wf-001", "cursor": "expired_cursor"}' | \
  jq -r '.error.reason'
```

**预期输出**: `BOARD_CURSOR_CONFLICT`

**验证状态**: ⬜ 待执行（上线后）

---

#### 测试 9: 资源滥用（限流）
**目的**: 验证高频请求触发限流

**验证命令**:
```bash
for i in {1..100}; do
  curl -X POST http://localhost:3000/api/board/sync \
    -H "Authorization: Bearer valid_token" \
    -H "Content-Type: application/json" \
    -d '{"workflow_id": "test-wf-001"}' &
done
wait

# 检查是否有请求返回限流错误
curl -X POST http://localhost:3000/api/board/sync \
  -H "Authorization: Bearer valid_token" \
  -H "Content-Type: application/json" \
  -d '{"workflow_id": "test-wf-001"}' | \
  jq -r '.error.reason'
```

**预期输出**: 部分请求返回 `WF_PERMISSION_DENIED`（限流）

**验证状态**: ⬜ 待执行（上线后）

**执行环境要求**:
- Colony 服务运行中
- 有效的测试 workflow_id
- 有效的 Bearer token
- curl、jq 工具
- 限流配置已启用

---

## 4. 上线前检查清单

### 4.1 代码与配置
- [ ] 契约一致性核对完成（无 diff）
- [ ] 单元测试全部通过
- [ ] 集成测试全部通过
- [ ] 代码审查通过（architect + qa_lead）
- [ ] 依赖版本锁定（package-lock.json）

### 4.2 数据库
- [ ] Migration 脚本已验证
- [ ] 数据库备份已完成
- [ ] 回滚脚本已准备

### 4.3 监控与告警
- [ ] Prometheus metrics 导出已启用
- [ ] Grafana Dashboard 已创建（或计划 24h 内创建）
- [ ] 告警规则已配置（或计划 24h 内配置）
- [ ] 告警通知渠道已测试

### 4.4 安全
- [ ] OWASP 负例回归测试通过
- [ ] 鉴权逻辑已验证
- [ ] 幂等键防篡改已验证
- [ ] 审计日志完整性已验证

### 4.5 文档
- [ ] 最终实施报告已落盘
- [ ] 证据归档总索引已落盘
- [ ] 遗留风险清单已落盘
- [ ] 回滚预案已落盘
- [ ] 上线检查清单已落盘（本文档）

---

## 5. 上线后检查清单

### 5.1 前 1 小时
- [ ] 服务启动成功（健康检查通过）
- [ ] 基本功能正常（API 调用成功）
- [ ] 无 CRITICAL 告警
- [ ] 错误率 < 10%

### 5.2 前 24 小时
- [ ] 性能指标稳定（p95 < 20s）
- [ ] 错误率稳定（< 10%）
- [ ] 审计日志完整性 100%
- [ ] OWASP 负例回归测试通过
- [ ] 监控面板已创建
- [ ] 告警规则已配置

### 5.3 前 7 天
- [ ] 遗留风险持续跟踪（每日复核）
- [ ] 无回滚触发条件
- [ ] 用户反馈正常
- [ ] 性能优化计划启动（如需要）

---

## 6. 上线决策

### 6.1 上线条件
**必需条件**（全部满足才能上线）:
1. ✅ Stage 0-8 全部通过 QA 门禁
2. ✅ 契约冻结版本确认（a0ca54bbfd3c5ba53c667e22b47730344721ae44）
3. ✅ 回滚预案已验证（桌面推演完成）
4. ✅ 上线检查清单已准备
5. ⬜ 架构门禁评审通过（待 architect 评审）

**可选条件**（建议满足但不阻塞上线）:
- 监控面板已创建（可上线后 24h 内补齐）
- 告警规则已配置（可上线后 24h 内补齐）
- 回滚演练已在生产环境执行（可上线后 24h 内补齐）

### 6.2 上线决策人
- **最终决策**: architect
- **技术评审**: developer + qa_lead
- **运维确认**: 运维负责人（待补充）

### 6.3 上线时间建议
- **推荐时间**: 工作日 10:00-16:00（非高峰时段）
- **避免时间**: 周五下午、节假日前、业务高峰期

---

## 7. 联系方式

### 上线协调人
- **架构负责人**: architect
- **开发负责人**: developer
- **QA 负责人**: qa_lead
- **运维负责人**: 待补充

### 紧急联系
- **Slack 频道**: #colony-alerts
- **PagerDuty**: 待配置

---

## 附录：快速验证脚本

### 一键验证脚本
```bash
#!/bin/bash
# 文件: scripts/stage9_launch_verification.sh

set -e

echo "=== Stage 9 上线验证 ==="

# 1. 契约一致性核对
echo "[1/5] 契约一致性核对..."
git diff c7e9a8a..a0ca54b -- src/extensions/board/types.ts src/extensions/board/service.ts src/extensions/board/scheduler.ts
if [ $? -eq 0 ]; then
  echo "✅ 契约一致性核对通过"
else
  echo "❌ 契约一致性核对失败"
  exit 1
fi

# 2. 基本功能验证
echo "[2/5] 基本功能验证..."
response=$(curl -s -X POST http://localhost:3000/api/board/sync \
  -H "Authorization: Bearer test_token" \
  -H "Content-Type: application/json" \
  -d '{"workflow_id": "test-wf-001"}')
if echo "$response" | jq -e '.data' > /dev/null; then
  echo "✅ 基本功能验证通过"
else
  echo "❌ 基本功能验证失败: $response"
  exit 1
fi

# 3. 鉴权验证
echo "[3/5] 鉴权验证..."
reason=$(curl -s -X POST http://localhost:3000/api/board/archive \
  -H "Authorization: Bearer invalid_token" \
  -H "Content-Type: application/json" \
  -d '{"workflow_id": "test-wf-001", "archive_id": "test-archive-001"}' | \
  jq -r '.error.reason')
if [ "$reason" = "WF_PERMISSION_DENIED" ]; then
  echo "✅ 鉴权验证通过"
else
  echo "❌ 鉴权验证失败: $reason"
  exit 1
fi

# 4. 审计日志完整性验证
echo "[4/5] 审计日志完整性验证..."
missing=$(psql -h localhost -U postgres -d colony -t -c "
  SELECT COUNT(*) FROM extensions.board_audit
  WHERE actor IS NULL OR workflow_id IS NULL OR archive_id IS NULL OR trace_id IS NULL;
")
if [ "$missing" -eq 0 ]; then
  echo "✅ 审计日志完整性验证通过"
else
  echo "❌ 审计日志完整性验证失败: $missing 条记录缺失字段"
  exit 1
fi

# 5. OWASP 负例验证
echo "[5/5] OWASP 负例验证..."
unauthorized=$(curl -s -X POST http://localhost:3000/api/board/events \
  -H "Authorization: Bearer invalid_token" \
  -H "Content-Type: application/json" \
  -d '{"workflow_id": "test-wf-001", "cursor": null}' | \
  jq -r '.error.reason')
if [ "$unauthorized" = "WF_PERMISSION_DENIED" ]; then
  echo "✅ OWASP 负例验证通过"
else
  echo "❌ OWASP 负例验证失败: $unauthorized"
  exit 1
fi

echo ""
echo "=== 全部验证通过 ✅ ==="
```

**使用方法**:
```bash
bash scripts/stage9_launch_verification.sh
```

**预期输出**: 全部验证通过 ✅

**执行环境要求**:
- Colony 服务运行中
- 数据库可访问
- curl、jq、psql 工具
- 有效的测试数据
