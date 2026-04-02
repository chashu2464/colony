# M2.1 Stage 0/1 架构冻结文档（Phase 2+）

- Task lineage: `fd3046b5` (M2 Phase 1 已完成)
- Freeze scope: `stage->board 自动同步` + `事件归档` + `跨归档分页`
- Freeze date: 2026-04-01
- Owner: architect

## 0. 任务分类门禁

- 分类：**新功能扩展**（非文档小修/非单文件小修/非纯 bug 修复）
- 工作流：**dev-workflow**
- WHY：涉及新契约、新数据模型、调度与归档链路，属于跨模块增量能力。

## 1. 冻结目标与边界

### 1.1 本次必须落地
1. stage->board 自动同步（分钟级）
2. 事件归档（冷热分层）
3. 跨归档分页（统一游标）

### 1.2 本次不做
1. 秒级实时同步
2. 归档策略多租户差异化配置
3. 非必要的协议兼容分支

WHY：先交付最小可验证闭环，控制回归面。

## 2. 接口契约冻结

## 2.1 `board.sync`（内部调度触发）
- 输入：`workflow_id`, `source_stage_event_id`, `action`, `triggered_at`
- 语义：把 stage 变化幂等投影到 board 视图
- 幂等键：`workflow_id + source_stage_event_id + action`
- 失败策略：指数退避 `1m/2m/4m`，上限 `15m`

WHY：确保重试与并发下不重复写入。

## 2.2 `board.events`（跨层查询）
- 维持既有：`since_event_id`, `limit<=200`
- 新增游标：`cursor_version`, `layer`, `event_id`, `ts`
- 响应保证：游标单调前进、去重、无漏读

WHY：跨在线层/归档层查询必须保持连续语义。

## 2.3 兼容与错误语义
- 保持 fail-closed：`BOARD_VALIDATION_ERROR` / `BOARD_CARD_NOT_FOUND` / `WF_PERMISSION_DENIED` / `BOARD_DISABLED`
- v1 维持 `BOARD_DISABLED`

WHY：不破坏 Phase 1 已冻结语义。

## 3. 数据模型冻结

## 3.1 在线事件层（hot）
- 主键：`event_id`
- 字段：`workflow_id`, `ts(ms)`, `type`, `payload`, `actor`, `idempotency_key`

## 3.2 归档事件层（archive）
- 主键：`archive_id + event_id`
- 字段：同 hot（`ts` 统一毫秒精度）
- 鉴权：与在线层同等强度（owner-only 不降低）

## 3.3 游标模型
- 结构：`{ version, layer, event_id, ts }`
- `version` 当前固定：`v1`

WHY：显式版本化保证后续演进可控。

## 4. 调度/执行频率可行性门槛（冻结）

1. 同步频率：默认每 `1m`
2. 调度漂移：`p99 < 30s`
3. 查询保护：归档运行时 `board.events` 的 `p95` 延迟增幅 `< 10%`
4. 堆积恢复：连续失败 `15m` 后，恢复 `30m` 内清空待处理

WHY：分钟级目标下的最小可运营门槛。

## 5. 归档策略冻结

1. 触发双阈值：`count >= 10000` 或 `age >= 7d`（满足任一）
2. 触发与执行分离（不阻塞在线查询）
3. 跨归档分页必须走统一游标逻辑

WHY：避免单阈值抖动与查询主链路阻塞。

## 6. 架构风险与红线

## 6.1 红线（必须满足）
1. 不允许跨层漏读/重读
2. 不允许归档层鉴权弱于在线层

## 6.2 主要风险
1. 时间精度不一致导致分页错位
2. 并发重试导致重复写入
3. 归档窗口与查询高峰冲突

WHY：三项均会直接破坏“可追溯可审计”。

## 7. 回滚策略冻结

1. 开关级回滚：关闭跨归档查询，回退到 hot-only 读取
2. 任务级回滚：暂停归档作业，仅保留同步投影
3. 协议级回滚：保留 `cursor_version=v1`，禁止引入未验证版本

WHY：保证故障时先保可用，再恢复增强能力。

## 8. Stage 1 -> Stage 2 交接门槛

开发可启动条件（全部满足）：
1. 本冻结文档已发布
2. Stage 1->2 正式交接已发出
3. QA 验证入口已同步

---

审计声明：本文档为 M2.1 的唯一冻结基线，后续实现与测试以此为准。