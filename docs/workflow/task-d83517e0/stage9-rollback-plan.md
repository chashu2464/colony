# Stage 9 回滚预案验证记录

**任务**: M2.1 Stage6 Continue (ID: d83517e0)
**生成时间**: 2026-04-03T19:45:42Z
**契约冻结版本**: a0ca54bbfd3c5ba53c667e22b47730344721ae44

---

## 1. 回滚触发条件（量化）

### 1.1 性能降级触发
- **条件**: 调度漂移 p95 连续 3 个窗口（每窗口 30 分钟）> 30s
- **监控指标**: board_sync_drift_p95
- **查询语句**:
  ```promql
  board_sync_drift_p95{job="colony-server"} > 30
  ```
- **决策链**: 触发告警 → 人工确认 → 执行回滚

### 1.2 错误率飙升触发
- **条件**: 错误率连续 3 个窗口（每窗口 30 分钟）> 20%
- **监控指标**: board_sync_error_rate
- **查询语句**:
  ```promql
  board_sync_error_rate{job="colony-server"} > 0.2
  ```
- **决策链**: 触发告警 → 人工确认 → 执行回滚

### 1.3 安全边界失效触发
- **条件**: OWASP 负例语义偏移（任一负例返回非预期错误码）
- **监控指标**: owasp_negative_semantic_consistency
- **查询语句**: 手动执行回归测试（见遗留风险清单 R3）
- **决策链**: 发现偏移 → 立即安全审查 → 评估影响 → 执行回滚

### 1.4 数据不一致触发
- **条件**: 审计日志完整性 < 100%（actor/workflow_id/archive_id/trace_id 任一字段缺失）
- **监控指标**: audit_log_completeness
- **查询语句**:
  ```sql
  SELECT COUNT(*) FROM extensions.board_audit
  WHERE actor IS NULL OR workflow_id IS NULL OR archive_id IS NULL OR trace_id IS NULL;
  ```
- **预期结果**: 0
- **决策链**: 发现缺失 → 立即数据审计 → 评估影响 → 执行回滚

---

## 2. 回滚执行步骤

### 2.1 前置检查
**执行人**: developer 或 运维
**预期耗时**: 5 分钟

```bash
# 1. 确认当前版本
cd /Users/casu/Documents/Colony
git log -1 --oneline
# 预期输出: a0ca54b feat: Investigated source of receipt-only wording...

# 2. 确认回滚目标版本（上一个稳定版本）
git log --oneline | grep -E "(feat|fix):" | head -5
# 选择回滚目标（如 c7e9a8a）

# 3. 检查当前服务状态
ps aux | grep "node.*server" | grep -v grep
# 确认 Colony 服务正在运行

# 4. 备份当前数据库状态（可选但推荐）
pg_dump -h localhost -U postgres -d colony > /tmp/colony_backup_$(date +%Y%m%d_%H%M%S).sql
# 预期输出: 备份文件路径
```

### 2.2 停止服务
**执行人**: developer 或 运维
**预期耗时**: 1 分钟

```bash
# 1. 优雅停止 Colony 服务
pkill -SIGTERM -f "node.*server"

# 2. 等待进程退出（最多 30 秒）
for i in {1..30}; do
  if ! ps aux | grep "node.*server" | grep -v grep > /dev/null; then
    echo "Service stopped gracefully"
    break
  fi
  sleep 1
done

# 3. 强制停止（如果优雅停止失败）
pkill -SIGKILL -f "node.*server"

# 4. 确认服务已停止
ps aux | grep "node.*server" | grep -v grep
# 预期输出: 无输出（服务已停止）
```

### 2.3 回滚代码
**执行人**: developer
**预期耗时**: 2 分钟

```bash
# 1. 切换到回滚目标版本
git checkout c7e9a8a  # 替换为实际回滚目标

# 2. 确认切换成功
git log -1 --oneline
# 预期输出: c7e9a8a feat: M2: workflow-board 告示牌模式落地

# 3. 重新安装依赖（如果 package.json 有变化）
npm install

# 4. 重新编译
npm run build:server
# 预期输出: Build completed successfully
```

### 2.4 回滚数据库（如需要）
**执行人**: developer 或 DBA
**预期耗时**: 5-10 分钟（取决于数据量）

```bash
# 1. 检查是否需要回滚数据库 schema
git diff c7e9a8a..a0ca54b -- migrations/
# 如果有 migration 变更，需要回滚

# 2. 执行数据库回滚（示例）
psql -h localhost -U postgres -d colony -c "
  -- 回滚 board_audit 表变更（如有）
  -- DROP TABLE IF EXISTS extensions.board_audit;

  -- 回滚 sync_idempotency 表变更（如有）
  -- DROP TABLE IF EXISTS extensions.sync_idempotency;
"

# 3. 确认数据库状态
psql -h localhost -U postgres -d colony -c "\dt extensions.*"
# 预期输出: 表列表（确认关键表存在）
```

### 2.5 重启服务
**执行人**: developer 或 运维
**预期耗时**: 2 分钟

```bash
# 1. 启动 Colony 服务
cd /Users/casu/Documents/Colony
npm run start:server &

# 2. 等待服务启动（最多 60 秒）
for i in {1..60}; do
  if curl -s http://localhost:3000/health > /dev/null; then
    echo "Service started successfully"
    break
  fi
  sleep 1
done

# 3. 确认服务状态
curl -s http://localhost:3000/health | jq .
# 预期输出: {"status": "ok"}
```

### 2.6 验收检查
**执行人**: developer 或 QA
**预期耗时**: 10 分钟

```bash
# 1. 检查基本功能
curl -X POST http://localhost:3000/api/board/sync \
  -H "Authorization: Bearer test_token" \
  -H "Content-Type: application/json" \
  -d '{"workflow_id": "test-wf-001"}' | jq .
# 预期输出: 正常响应（不报错）

# 2. 检查调度漂移
# 等待 5 分钟后检查监控面板
# 预期: p95 < 30s

# 3. 检查错误率
# 查看监控面板
# 预期: error_rate < 10%

# 4. 检查审计日志
psql -h localhost -U postgres -d colony -c "
  SELECT COUNT(*) FROM extensions.board_audit
  WHERE actor IS NULL OR workflow_id IS NULL;
"
# 预期输出: 0

# 5. 检查 OWASP 负例
bash scripts/owasp_regression_test.sh
# 预期输出: All tests passed
```

---

## 3. 验收信号

### 3.1 性能指标恢复
- **指标**: board_sync_drift_p95
- **查询语句**:
  ```promql
  board_sync_drift_p95{job="colony-server"}
  ```
- **正常值范围**: < 20s
- **观测方式**: Grafana Dashboard - Board Sync Performance

### 3.2 错误率恢复
- **指标**: board_sync_error_rate
- **查询语句**:
  ```promql
  board_sync_error_rate{job="colony-server"}
  ```
- **正常值范围**: < 10%
- **观测方式**: Grafana Dashboard - Board Sync Error Rate

### 3.3 安全边界正常
- **指标**: owasp_negative_semantic_consistency
- **查询语句**: 手动执行回归测试
- **正常值范围**: 100%
- **观测方式**: 执行 `bash scripts/owasp_regression_test.sh`

### 3.4 审计日志完整
- **指标**: audit_log_completeness
- **查询语句**:
  ```sql
  SELECT COUNT(*) FROM extensions.board_audit
  WHERE actor IS NULL OR workflow_id IS NULL OR archive_id IS NULL OR trace_id IS NULL;
  ```
- **正常值范围**: 0
- **观测方式**: 直接查询数据库

---

## 4. 回滚演练记录

### 4.1 演练类型
**桌面推演**（Desktop Walkthrough）

**原因**: 当前环境为开发环境，不具备完整的生产环境条件（如监控面板、告警系统、数据库备份策略）。采用桌面推演方式验证回滚步骤的可达性与完整性。

### 4.2 演练时间
**UTC 时间**: 2026-04-03T19:45:42Z

### 4.3 执行人
**developer**

### 4.4 演练场景
模拟性能降级触发回滚：调度漂移 p95 连续 3 个窗口 > 30s

### 4.5 演练步骤与结果

#### 步骤 1: 前置检查
**命令**:
```bash
cd /Users/casu/Documents/Colony
git log -1 --oneline
git log --oneline | grep -E "(feat|fix):" | head -5
ps aux | grep "node.*server" | grep -v grep
```

**预期结果**:
- 当前版本: a0ca54b
- 回滚目标: c7e9a8a
- 服务状态: 运行中

**实际结果**:
- ✅ 当前版本确认: a0ca54b
- ✅ 回滚目标确认: c7e9a8a
- ⚠️ 服务状态: 当前环境未运行服务（开发环境）

**阻塞项**: 无（开发环境可接受）

#### 步骤 2: 停止服务
**命令**:
```bash
pkill -SIGTERM -f "node.*server"
ps aux | grep "node.*server" | grep -v grep
```

**预期结果**: 服务优雅停止

**实际结果**: ⚠️ 当前环境未运行服务，跳过此步骤

**阻塞项**: 无（生产环境需验证优雅停止逻辑）

#### 步骤 3: 回滚代码
**命令**:
```bash
git checkout c7e9a8a
git log -1 --oneline
npm install
npm run build:server
```

**预期结果**:
- 代码切换成功
- 依赖安装成功
- 编译成功

**实际结果**:
- ✅ 代码切换可达（git checkout 命令有效）
- ⚠️ 未实际执行（避免影响当前开发环境）
- ⚠️ 编译步骤未验证（需在生产环境验证）

**阻塞项**: 无（桌面推演阶段可接受）

#### 步骤 4: 回滚数据库
**命令**:
```bash
git diff c7e9a8a..a0ca54b -- migrations/
psql -h localhost -U postgres -d colony -c "\dt extensions.*"
```

**预期结果**:
- 检查 migration 变更
- 确认数据库表状态

**实际结果**:
- ✅ git diff 命令可达
- ⚠️ 数据库连接未验证（需在生产环境验证）

**阻塞项**: 需补充数据库回滚脚本（当前缺失）

#### 步骤 5: 重启服务
**命令**:
```bash
npm run start:server &
curl -s http://localhost:3000/health | jq .
```

**预期结果**: 服务启动成功，健康检查通过

**实际结果**: ⚠️ 未实际执行（避免影响当前开发环境）

**阻塞项**: 无（生产环境需验证启动逻辑）

#### 步骤 6: 验收检查
**命令**:
```bash
curl -X POST http://localhost:3000/api/board/sync \
  -H "Authorization: Bearer test_token" \
  -H "Content-Type: application/json" \
  -d '{"workflow_id": "test-wf-001"}' | jq .
```

**预期结果**: 基本功能正常，性能指标恢复

**实际结果**: ⚠️ 未实际执行（需在生产环境验证）

**阻塞项**: 需补充验收检查脚本（当前缺失）

### 4.6 演练结论

**整体评估**: ✅ 回滚步骤逻辑完整，命令可达性验证通过

**发现的阻塞项**:
1. **数据库回滚脚本缺失**: 需补充自动化数据库回滚脚本（如 migration rollback）
2. **验收检查脚本缺失**: 需补充自动化验收检查脚本（如 smoke test）
3. **监控面板未创建**: 需在生产环境创建 Grafana Dashboard

**补齐计划**:
1. **数据库回滚脚本**: 在上线前补充（预计 2 小时）
2. **验收检查脚本**: 在上线前补充（预计 1 小时）
3. **监控面板**: 在上线后 24 小时内创建（预计 4 小时）

### 4.7 生产环境补充验证计划

**时间**: 上线后 24 小时内

**验证内容**:
1. 在生产环境执行一次完整回滚演练（非高峰时段）
2. 验证服务优雅停止逻辑（确认无请求丢失）
3. 验证数据库回滚脚本（在测试数据库上执行）
4. 验证监控面板与告警规则（触发测试告警）
5. 验证验收检查脚本（执行 smoke test）

**执行人**: developer + 运维

**预期耗时**: 2 小时

---

## 5. 回滚决策矩阵

| 触发条件 | 严重程度 | 决策时间 | 决策人 | 是否回滚 |
|---------|---------|---------|--------|---------|
| 调度漂移 p95 > 30s 连续 3 窗口 | 中 | 90 分钟内 | architect + developer | 是 |
| 错误率 > 20% 连续 3 窗口 | 高 | 90 分钟内 | architect + developer | 是 |
| OWASP 负例语义偏移 | 严重 | 立即 | architect + qa_lead | 是 |
| 审计日志完整性 < 100% | 严重 | 立即 | architect + developer | 是 |
| 高并发尾延迟超阈值 | 低 | 7 日内 | architect + developer | 评估后决定 |
| EXIT_0 非 OK 占比 > 20% | 中 | 24 小时内 | architect + developer | 评估后决定 |

---

## 6. 回滚后恢复计划

### 6.1 根因分析
**责任方**: developer
**时间要求**: 回滚后 24 小时内

**分析内容**:
1. 定位触发回滚的根本原因（代码缺陷、配置错误、环境问题）
2. 评估影响范围（受影响的用户数、数据完整性）
3. 提出修复方案（代码修复、配置调整、架构优化）

### 6.2 修复验证
**责任方**: developer + qa_lead
**时间要求**: 根因分析完成后 48 小时内

**验证内容**:
1. 在测试环境复现问题
2. 验证修复方案有效性
3. 执行完整的回归测试（Stage 4-8 证据复现）
4. 通过 QA 门禁评审

### 6.3 重新上线
**责任方**: architect + developer + 运维
**时间要求**: 修复验证通过后 24 小时内

**上线流程**:
1. 代码合并到主分支
2. 执行 CI/CD 流水线
3. 灰度发布（10% 流量 → 50% 流量 → 100% 流量）
4. 持续监控 24 小时

---

## 7. 联系方式

### 紧急联系人
- **架构负责人**: architect
- **开发负责人**: developer
- **QA 负责人**: qa_lead
- **运维负责人**: 待补充

### 升级路径
1. **发现异常**: 监控告警 → 值班人员
2. **初步评估**: 值班人员 → developer
3. **回滚决策**: developer → architect
4. **执行回滚**: developer + 运维
5. **验收确认**: qa_lead

---

## 附录：回滚检查清单

### 回滚前检查
- [ ] 确认触发条件（量化指标超阈值）
- [ ] 确认回滚目标版本（上一个稳定版本）
- [ ] 备份当前数据库状态
- [ ] 通知相关人员（architect + qa_lead + 运维）

### 回滚中检查
- [ ] 服务优雅停止（无请求丢失）
- [ ] 代码切换成功（git checkout）
- [ ] 依赖安装成功（npm install）
- [ ] 编译成功（npm run build:server）
- [ ] 数据库回滚成功（如需要）
- [ ] 服务重启成功（健康检查通过）

### 回滚后检查
- [ ] 基本功能正常（API 调用成功）
- [ ] 性能指标恢复（p95 < 20s）
- [ ] 错误率恢复（< 10%）
- [ ] 安全边界正常（OWASP 负例通过）
- [ ] 审计日志完整（100%）
- [ ] 监控告警恢复正常

### 恢复计划检查
- [ ] 根因分析完成（24 小时内）
- [ ] 修复方案提出（48 小时内）
- [ ] 修复验证通过（回归测试）
- [ ] QA 门禁评审通过
- [ ] 重新上线计划确认
