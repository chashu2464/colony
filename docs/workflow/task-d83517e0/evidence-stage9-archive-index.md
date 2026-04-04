# Stage 9 证据归档总索引

**任务**: M2.1 Stage6 Continue (ID: d83517e0)
**生成时间**: 2026-04-03T19:45:42Z
**契约冻结版本**: a0ca54bbfd3c5ba53c667e22b47730344721ae44

---

## 索引格式说明

每条断言映射包含：
- **断言编号**: 唯一标识符
- **Stage**: 所属阶段
- **证据文档**: 分析报告路径
- **Raw 文件**: 原始数据路径
- **复算命令**: 独立复现命令

---

## Stage 4: Testing & Evidence

### A1-SYNC-DRIFT
- **断言**: board.sync 调度漂移 p95 <= 20s
- **Stage**: 4
- **证据文档**: `docs/workflow/task-d83517e0/evidence-stage4/01-sync-drift.md`
- **Raw 文件**: `docs/workflow/task-d83517e0/evidence-stage4/raw/stage4_sync_drift_samples.ndjson`
- **复算命令**:
  ```bash
  jq -r '.actual_interval' docs/workflow/task-d83517e0/evidence-stage4/raw/stage4_sync_drift_samples.ndjson | \
  sort -n | awk '{a[NR]=$1} END {print a[int(NR*0.95)]}'
  # 预期输出: 19
  ```

### A2-BACKOFF
- **断言**: 退避策略按 1/2/4/8/15m 递增
- **Stage**: 4
- **证据文档**: `docs/workflow/task-d83517e0/evidence-stage4/02-backoff-strategy.md`
- **Raw 文件**: `docs/workflow/task-d83517e0/evidence-stage4/raw/stage4_backoff_samples.ndjson`
- **复算命令**:
  ```bash
  jq -r 'select(.backoff_level >= 0 and .backoff_level <= 4) | .next_interval' \
  docs/workflow/task-d83517e0/evidence-stage4/raw/stage4_backoff_samples.ndjson | sort -u
  # 预期输出: 60 120 240 480 900（秒）
  ```

### A3-FAIL-CLOSE
- **断言**: fail-close 自检通过
- **Stage**: 4
- **证据文档**: `docs/workflow/task-d83517e0/evidence-stage4/03-fail-close.md`
- **Raw 文件**: `docs/workflow/task-d83517e0/evidence-stage4/raw/stage4_fail_close_check.json`
- **复算命令**:
  ```bash
  jq -r '.result' docs/workflow/task-d83517e0/evidence-stage4/raw/stage4_fail_close_check.json
  # 预期输出: "pass"
  ```

---

## Stage 5: Continuous Observation

### A1-CONTINUOUS-DRIFT
- **断言**: 8 窗口调度漂移稳定（p95=19s）
- **Stage**: 5
- **证据文档**: `docs/workflow/task-d83517e0/evidence-stage5/01-continuous-drift.md`
- **Raw 文件**: `docs/workflow/task-d83517e0/evidence-stage5/raw/stage5_windows.ndjson`
- **复算命令**:
  ```bash
  jq -r '.metrics.A1_p95' docs/workflow/task-d83517e0/evidence-stage5/raw/stage5_windows.ndjson | \
  awk '{sum+=$1; count++} END {print sum/count}'
  # 预期输出: 19
  ```

### E1-ERROR-RATE
- **断言**: 8 窗口错误率稳定（8%）
- **Stage**: 5
- **证据文档**: `docs/workflow/task-d83517e0/evidence-stage5/02-error-rate.md`
- **Raw 文件**: `docs/workflow/task-d83517e0/evidence-stage5/raw/stage5_windows.ndjson`
- **复算命令**:
  ```bash
  jq -r '.metrics.E1_error_rate' docs/workflow/task-d83517e0/evidence-stage5/raw/stage5_windows.ndjson | \
  awk '{sum+=$1; count++} END {print sum/count}'
  # 预期输出: 8
  ```

---

## Stage 6: Stress Testing

### CONC-12-P95
- **断言**: 12 并发 p95 延迟 <= 5000ms
- **Stage**: 6
- **证据文档**: `docs/workflow/task-d83517e0/evidence-stage6/01-concurrency-tier.md`
- **Raw 文件**: `docs/workflow/task-d83517e0/evidence-stage6/raw/stage6_tier_12_responses.ndjson`
- **复算命令**:
  ```bash
  jq -r '.duration_ms' docs/workflow/task-d83517e0/evidence-stage6/raw/stage6_tier_12_responses.ndjson | \
  sort -n | awk '{a[NR]=$1} END {print a[int(NR*0.95)]}'
  # 预期输出: 4750
  ```

### CONC-24-P95
- **断言**: 24 并发 p95 延迟 <= 6000ms
- **Stage**: 6
- **证据文档**: `docs/workflow/task-d83517e0/evidence-stage6/01-concurrency-tier.md`
- **Raw 文件**: `docs/workflow/task-d83517e0/evidence-stage6/raw/stage6_tier_24_responses.ndjson`
- **复算命令**:
  ```bash
  jq -r '.duration_ms' docs/workflow/task-d83517e0/evidence-stage6/raw/stage6_tier_24_responses.ndjson | \
  sort -n | awk '{a[NR]=$1} END {print a[int(NR*0.95)]}'
  # 预期输出: 5537
  ```

---

## Stage 7: Evidence Hardening

### D1-SEMANTIC
- **断言**: D1 未授权语义一致（WF_PERMISSION_DENIED）
- **Stage**: 7
- **证据文档**: `docs/workflow/task-d83517e0/evidence-stage7/03-d1-semantic-and-audit-traceability.md`
- **Raw 文件**: `docs/workflow/task-d83517e0/evidence-stage7/raw/stage7_d1_by_window.ndjson`
- **复算命令**:
  ```bash
  jq -r '.existing_unauthorized_reason, .non_existing_unauthorized_reason' \
  docs/workflow/task-d83517e0/evidence-stage7/raw/stage7_d1_by_window.ndjson | \
  sort -u
  # 预期输出: WF_PERMISSION_DENIED（仅一行）
  ```

### OWASP-PROTOCOL-RAW
- **断言**: OWASP 四类负例均有协议级 raw
- **Stage**: 7
- **证据文档**: `docs/workflow/task-d83517e0/evidence-stage7/04-owasp-negative-paths.md`
- **Raw 文件**: `docs/workflow/task-d83517e0/evidence-stage7/raw/stage7_owasp_negative_outputs.ndjson`
- **复算命令**:
  ```bash
  jq -r '.probe_type' docs/workflow/task-d83517e0/evidence-stage7/raw/stage7_owasp_negative_outputs.ndjson | \
  sort -u | wc -l
  # 预期输出: 4（unauthorized/invalid_cursor/cursor_conflict/resource_abuse）
  ```

---

## Stage 8: Convergence & Audit

### CONC-4TIER
- **断言**: 四档并发（12/24/48/64）全部可复算
- **Stage**: 8
- **证据文档**: `docs/workflow/task-d83517e0/evidence-stage8/01-concurrency-tier-tail.md`
- **Raw 文件**:
  - `docs/workflow/task-d83517e0/evidence-stage8/raw/stage8_tier_12_responses.ndjson`
  - `docs/workflow/task-d83517e0/evidence-stage8/raw/stage8_tier_24_responses.ndjson`
  - `docs/workflow/task-d83517e0/evidence-stage8/raw/stage8_tier_48_responses.ndjson`
  - `docs/workflow/task-d83517e0/evidence-stage8/raw/stage8_tier_64_responses.ndjson`
- **复算命令**:
  ```bash
  for tier in 12 24 48 64; do
    echo "=== Tier $tier ==="
    jq -s 'length' docs/workflow/task-d83517e0/evidence-stage8/raw/stage8_tier_${tier}_responses.ndjson
    jq -r 'select(.ok == true)' docs/workflow/task-d83517e0/evidence-stage8/raw/stage8_tier_${tier}_responses.ndjson | wc -l
    jq -r '.duration_ms' docs/workflow/task-d83517e0/evidence-stage8/raw/stage8_tier_${tier}_responses.ndjson | \
    sort -n | awk '{a[NR]=$1} END {print "p95:", a[int(NR*0.95)], "p99:", a[int(NR*0.99)], "max:", a[NR]}'
  done
  ```

### SOAK-8H
- **断言**: soak >=8h 趋势稳定
- **Stage**: 8
- **证据文档**: `docs/workflow/task-d83517e0/evidence-stage8/02-soak-8h-trend.md`
- **Raw 文件**: `docs/workflow/task-d83517e0/evidence-stage8/raw/stage8_windows.ndjson`
- **复算命令**:
  ```bash
  jq -r '.window_start, .window_end, .metrics.A1_p95, .metrics.E1_error_rate' \
  docs/workflow/task-d83517e0/evidence-stage8/raw/stage8_windows.ndjson | \
  paste - - - - | awk '{print $1, $2, "A1_p95="$3, "E1="$4}'
  # 验证时间跨度 >= 8h 且 A1/E1 稳定
  ```

### D1-CONTINUOUS
- **断言**: D1 持续一致性（16/16 窗口）
- **Stage**: 8
- **证据文档**: `docs/workflow/task-d83517e0/evidence-stage8/03-d1-semantic-and-audit-traceability.md`
- **Raw 文件**: `docs/workflow/task-d83517e0/evidence-stage8/raw/stage8_d1_by_window.ndjson`
- **复算命令**:
  ```bash
  jq -r '.existing_unauthorized_reason, .non_existing_unauthorized_reason' \
  docs/workflow/task-d83517e0/evidence-stage8/raw/stage8_d1_by_window.ndjson | \
  sort -u
  # 预期输出: WF_PERMISSION_DENIED（仅一行）

  jq -r '.audit_completeness | to_entries[] | "\(.key)=\(.value)"' \
  docs/workflow/task-d83517e0/evidence-stage8/raw/stage8_d1_by_window.ndjson | head -1
  # 预期输出: actor=688 workflow_id=688 archive_id=688 trace_id=688
  ```

---

## 证据保留策略

### Raw 文件保留期
- **保留期**: 90 天（覆盖 3 个月回溯窗口）
- **清理策略**: 自动清理脚本（待补充）
- **清理脚本路径**: `scripts/evidence_cleanup.sh`（待实现）

### 聚合报告保留期
- **保留期**: 永久保留
- **归档位置**: `docs/workflow/task-d83517e0/evidence-stage*/`
- **用途**: 审计基线与历史追溯

### 索引文件保留期
- **保留期**: 永久保留
- **归档位置**: `docs/workflow/task-d83517e0/evidence-stage9-archive-index.md`（本文档）
- **用途**: 证据映射与复算入口

---

## 第三方复现指南

### 前置条件
1. 克隆仓库并切换到契约冻结版本：
   ```bash
   git clone <repo_url>
   cd Colony
   git checkout a0ca54bbfd3c5ba53c667e22b47730344721ae44
   ```

2. 安装依赖：
   ```bash
   npm install
   ```

3. 确保 Temporal 服务运行：
   ```bash
   temporal server start-dev
   ```

### 复现步骤
1. 选择要复现的断言（如 A1-SYNC-DRIFT）
2. 定位对应的 Raw 文件路径
3. 执行复算命令
4. 对比输出与预期值

### 示例：复现 Stage 8 四档并发
```bash
cd /Users/casu/Documents/Colony
for tier in 12 24 48 64; do
  echo "=== Tier $tier ==="
  total=$(jq -s 'length' docs/workflow/task-d83517e0/evidence-stage8/raw/stage8_tier_${tier}_responses.ndjson)
  ok=$(jq -r 'select(.ok == true)' docs/workflow/task-d83517e0/evidence-stage8/raw/stage8_tier_${tier}_responses.ndjson | wc -l)
  fail=$((total - ok))
  echo "total=$total ok=$ok fail=$fail"
  jq -r '.duration_ms' docs/workflow/task-d83517e0/evidence-stage8/raw/stage8_tier_${tier}_responses.ndjson | \
  sort -n | awk '{a[NR]=$1} END {printf "p95=%d p99=%d max=%d\n", a[int(NR*0.95)], a[int(NR*0.99)], a[NR]}'
done
```

---

## 联系方式

如对证据复现有疑问，请联系：
- **开发负责人**: developer
- **QA 负责人**: qa_lead
- **架构负责人**: architect
