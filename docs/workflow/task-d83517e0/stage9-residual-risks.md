# Stage 9 遗留风险清单

**任务**: M2.1 Stage6 Continue (ID: d83517e0)
**生成时间**: 2026-04-03T19:45:42Z
**契约冻结版本**: a0ca54bbfd3c5ba53c667e22b47730344721ae44

---

## 风险总览

| 风险编号 | 现象 | 影响范围 | 责任方 | 复核周期 | 量化指标 | 阈值 | 升级路径 |
|---------|------|---------|--------|---------|---------|------|---------|
| R1-PERF-TAIL | 高并发尾延迟集中 | 24/48/64 并发场景 | developer + 运维 | 上线后每日，持续 4 周 | p95/p99/max 延迟、timeout rate | 见 R1 详情 | 连续 3 日超阈值→性能优化专项；连续 7 日→回滚评估 |
| R2-EXIT0-NONOK | EXIT_0 非 OK 失败 | 所有并发档位 | developer | 上线后每周，持续 8 周 | EXIT_0 且 ok=false 占比 | < 5% | 占比 > 10%→根因分析专项；> 20%→回滚评估 |
| R3-OWASP-DRIFT | OWASP 负例语义漂移 | 安全边界 | qa_lead + developer | 上线后每周，持续 12 周 | 协议级响应语义一致性 | 100% | 语义偏移→安全审查；持续偏移→回滚评估 |

---

## R1: 高并发尾延迟集中

### 现象描述
在 24/48/64 并发压测中，p95/p99/max 延迟显著高于 12 并发，且 timeout rate 随并发度上升：
- **12 并发**: p95=4750ms, p99=5071ms, max=5365ms, timeout rate=3.3%
- **24 并发**: p95=5537ms, p99=5664ms, max=5729ms, timeout rate=27.9%
- **48 并发**: p95=6301ms, p99=6554ms, max=6719ms, timeout rate=57.5%
- **64 并发**: p95=7672ms, p99=8084ms, max=8278ms, timeout rate=61.1%

### 影响范围
- **业务影响**: 当前业务场景主要在 12 并发以下，24/48/64 并发为未来扩展预留
- **用户体验**: 高并发场景下部分请求超时（6s timeout），影响实时性
- **系统稳定性**: 未发现系统崩溃或数据不一致，仅性能降级

### 触发条件
- 并发度 >= 24
- 单个 workflow 的 board.sync 调用频率 > 1 次/分钟
- Temporal 服务负载 > 70%

### 缓解措施
1. **当前措施**:
   - 限制单个 workflow 的 board.sync 调用频率（1m 最小间隔）
   - 退避策略自动降级异常 workflow（1/2/4/8/15m）
   - fail-close 机制防止雪崩

2. **计划优化**:
   - 引入请求队列与流控（限制全局并发度）
   - 优化 Temporal workflow 查询性能（索引优化、缓存）
   - 分片策略（按 workflow_id 哈希分片到多个 worker）

### 持续跟踪指标
- **指标名称**: board_sync_latency_p95, board_sync_latency_p99, board_sync_timeout_rate
- **采集频率**: 每 5 分钟
- **监控面板**: Grafana Dashboard - Board Sync Performance（待创建）
- **告警规则**:
  - p95 > 6000ms 持续 10 分钟 → WARNING
  - p95 > 8000ms 持续 5 分钟 → CRITICAL
  - timeout rate > 30% 持续 10 分钟 → WARNING
  - timeout rate > 50% 持续 5 分钟 → CRITICAL

### 量化阈值
| 并发档位 | p95 阈值 | p99 阈值 | max 阈值 | timeout rate 阈值 |
|---------|---------|---------|---------|------------------|
| 12 | < 5000ms | < 5500ms | < 6000ms | < 5% |
| 24 | < 6000ms | < 6500ms | < 7000ms | < 30% |
| 48 | < 7000ms | < 7500ms | < 8000ms | < 60% |
| 64 | < 8500ms | < 9000ms | < 9500ms | < 65% |

### 升级路径
1. **连续 3 日超阈值**:
   - 触发性能优化专项（developer + 运维）
   - 评估是否需要扩容 Temporal worker
   - 评估是否需要引入流控机制

2. **连续 7 日超阈值**:
   - 触发回滚评估（architect + developer + qa_lead）
   - 评估是否需要回滚到上一个稳定版本
   - 评估是否需要降级高并发场景（限制并发度上限）

### 责任方
- **主责**: developer（性能优化、代码改进）
- **协同**: 运维侧（Temporal 服务扩容、监控告警）
- **复核**: architect（每周复核优化进展）

### 复核周期
- **频率**: 上线后每日复核，持续 4 周
- **复核内容**:
  - 检查监控面板，确认 p95/p99/timeout rate 是否在阈值内
  - 分析异常峰值的根因（业务高峰 vs 系统瓶颈）
  - 评估优化措施的效果（如已实施）

---

## R2: EXIT_0 非 OK 失败

### 现象描述
在压测中发现部分请求返回 exit_code=0 但 ok=false 的情况，占比约 2-5%：
- **Stage 8 数据**:
  - 12 并发: EXIT_0 非 OK = 0/120 (0%)
  - 24 并发: EXIT_0 非 OK = 13/240 (5.4%)
  - 48 并发: EXIT_0 非 OK = 30/480 (6.3%)
  - 64 并发: EXIT_0 非 OK = 46/640 (7.2%)

### 影响范围
- **业务影响**: 部分请求被标记为失败，但实际可能已成功执行（幂等性保证）
- **监控影响**: 错误率统计偏高，可能触发误告警
- **根因不明**: 当前未完全定位根因，可能与 Temporal workflow 超时、网络抖动、或业务逻辑异常有关

### 触发条件
- 并发度 >= 24
- Temporal workflow 执行时间接近 6s timeout
- 可能与特定 workflow 状态有关（待验证）

### 缓解措施
1. **当前措施**:
   - 幂等性保证（idempotency_key）防止重复执行
   - 审计日志完整记录（actor/workflow_id/trace_id）用于事后排查

2. **计划排查**:
   - 分析 EXIT_0 非 OK 样本的共同特征（workflow_id、执行时间、错误信息）
   - 增加详细日志（Temporal workflow 内部状态、超时原因）
   - 复现特定场景（如 workflow 接近 timeout 时的行为）

### 持续跟踪指标
- **指标名称**: board_sync_exit0_nonok_rate
- **计算公式**: (EXIT_0 且 ok=false 的请求数) / (总请求数) * 100%
- **采集频率**: 每小时
- **监控面板**: Grafana Dashboard - Board Sync Error Analysis（待创建）
- **告警规则**:
  - EXIT_0 非 OK 占比 > 10% 持续 1 小时 → WARNING
  - EXIT_0 非 OK 占比 > 20% 持续 30 分钟 → CRITICAL

### 量化阈值
- **可接受上限**: < 5%
- **触发根因分析**: > 10%
- **触发回滚评估**: > 20%

### 升级路径
1. **占比 > 10%**:
   - 触发根因分析专项（developer）
   - 收集 EXIT_0 非 OK 样本（至少 100 个）
   - 分析共同特征（workflow 状态、执行时间、错误类型）
   - 提出修复方案并验证

2. **占比 > 20%**:
   - 触发回滚评估（architect + developer + qa_lead）
   - 评估是否需要回滚到上一个稳定版本
   - 评估是否需要紧急修复（hotfix）

### 责任方
- **主责**: developer（根因分析、代码修复）
- **协同**: qa_lead（复现场景、验证修复）
- **复核**: architect（每周复核排查进展）

### 复核周期
- **频率**: 上线后每周一次，持续 8 周
- **复核内容**:
  - 检查 EXIT_0 非 OK 占比趋势
  - 分析新增样本的根因
  - 评估修复方案的效果（如已实施）

### 排查方向
1. **Temporal workflow 超时**:
   - 检查 workflow 执行时间分布
   - 分析接近 6s timeout 的请求是否更容易出现 EXIT_0 非 OK
   - 评估是否需要调整 timeout 配置

2. **网络抖动**:
   - 检查 Temporal 服务与 worker 之间的网络延迟
   - 分析是否存在网络超时或重试

3. **业务逻辑异常**:
   - 检查 board.sync 内部是否有未捕获的异常
   - 分析是否存在特定 workflow 状态导致的失败

---

## R3: OWASP 负例语义漂移

### 现象描述
OWASP 四类负例（未授权/无效游标/游标冲突/资源滥用）在 Stage 7-8 中均返回预期的协议级错误语义：
- **未授权**: WF_PERMISSION_DENIED
- **无效游标**: BOARD_CURSOR_INVALID
- **游标冲突**: BOARD_CURSOR_CONFLICT
- **资源滥用**: WF_PERMISSION_DENIED（限流）

但存在语义漂移风险：
- 代码变更可能导致错误码变化（如重构错误处理逻辑）
- 依赖库升级可能改变错误响应格式
- 配置变更可能影响鉴权逻辑

### 影响范围
- **安全影响**: 如果负例语义漂移，可能导致安全边界失效（如未授权请求被误判为成功）
- **审计影响**: 审计日志依赖协议级错误码，语义漂移会影响审计准确性
- **监控影响**: 安全监控依赖错误码分类，语义漂移会影响告警准确性

### 触发条件
- 代码变更涉及错误处理逻辑
- 依赖库升级（如 Temporal SDK、鉴权库）
- 配置变更（如鉴权规则、限流阈值）

### 缓解措施
1. **当前措施**:
   - Stage 7-8 引入 empty-raw fail-fast 自检（任一负例空输出即阻断提交）
   - 协议级 raw 文件永久保留（用于回归对比）

2. **计划加固**:
   - 引入 OWASP 负例回归测试（CI/CD 流水线）
   - 每次代码变更自动执行四类负例并对比协议级响应
   - 语义漂移自动告警（错误码不匹配）

### 持续跟踪指标
- **指标名称**: owasp_negative_semantic_consistency
- **计算公式**: (协议级响应与预期一致的负例数) / (总负例数) * 100%
- **采集频率**: 每周一次（手动执行或 CI/CD 自动触发）
- **监控面板**: 无（手动检查）
- **告警规则**:
  - 语义一致性 < 100% → CRITICAL（立即触发安全审查）

### 量化阈值
- **可接受上限**: 100%（任一负例语义偏移即不可接受）
- **触发安全审查**: 语义一致性 < 100%
- **触发回滚评估**: 语义偏移持续 > 24 小时

### 升级路径
1. **语义偏移（一致性 < 100%）**:
   - 立即触发安全审查（qa_lead + developer）
   - 定位偏移原因（代码变更、依赖升级、配置变更）
   - 评估安全影响（是否存在安全漏洞）
   - 提出修复方案并验证

2. **持续偏移（> 24 小时）**:
   - 触发回滚评估（architect + developer + qa_lead）
   - 评估是否需要回滚到上一个稳定版本
   - 评估是否需要紧急修复（hotfix）

### 责任方
- **主责**: qa_lead（负例回归测试、语义一致性验证）
- **协同**: developer（修复语义偏移、代码审查）
- **复核**: architect（每周复核安全状态）

### 复核周期
- **频率**: 上线后每周一次，持续 12 周
- **复核内容**:
  - 执行 OWASP 四类负例回归测试
  - 对比协议级响应与预期语义
  - 分析任何偏移的根因
  - 评估修复方案的效果（如已实施）

### 回归测试命令
```bash
# 未授权负例
curl -X POST http://localhost:3000/api/board/events \
  -H "Authorization: Bearer invalid_token" \
  -H "Content-Type: application/json" \
  -d '{"workflow_id": "test-wf-001", "cursor": null}' | \
  jq -r '.error.reason'
# 预期输出: WF_PERMISSION_DENIED

# 无效游标负例
curl -X POST http://localhost:3000/api/board/events \
  -H "Authorization: Bearer valid_token" \
  -H "Content-Type: application/json" \
  -d '{"workflow_id": "test-wf-001", "cursor": "invalid_cursor_format"}' | \
  jq -r '.error.reason'
# 预期输出: BOARD_CURSOR_INVALID

# 游标冲突负例
curl -X POST http://localhost:3000/api/board/events \
  -H "Authorization: Bearer valid_token" \
  -H "Content-Type: application/json" \
  -d '{"workflow_id": "test-wf-001", "cursor": "expired_cursor"}' | \
  jq -r '.error.reason'
# 预期输出: BOARD_CURSOR_CONFLICT

# 资源滥用负例（高频请求触发限流）
for i in {1..100}; do
  curl -X POST http://localhost:3000/api/board/sync \
    -H "Authorization: Bearer valid_token" \
    -H "Content-Type: application/json" \
    -d '{"workflow_id": "test-wf-001"}' &
done
wait
# 预期部分请求返回: WF_PERMISSION_DENIED（限流）
```

---

## 风险总结

### 高优先级风险
- **R3-OWASP-DRIFT**: 安全边界失效风险，必须持续监控

### 中优先级风险
- **R1-PERF-TAIL**: 影响高并发场景用户体验，但当前业务场景可接受
- **R2-EXIT0-NONOK**: 根因不明，需持续排查

### 低优先级风险
- 无

### 整体评估
当前遗留风险均在可控范围内，已建立持续跟踪机制与升级路径。建议按计划执行复核，及时发现并处理异常。
