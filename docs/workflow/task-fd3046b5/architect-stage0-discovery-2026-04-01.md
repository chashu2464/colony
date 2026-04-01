# M2: workflow-board 告示牌模式落地 - Stage 0 Discovery

- Task ID: `fd3046b5`
- Stage: 0 (Discovery)
- Date: `2026-04-01`
- Owner: architect
- Workflow Version: `v2`

## 1) 目标与范围

### 1.1 核心目标
让多 Agent 协作"看得见、查得到、回得去"——通过告示牌模式实现协作状态的可观测性。

### 1.2 范围边界（IN）
- ✅ 实现 `BoardSnapshot` 数据模型（当前态快照）
- ✅ 实现 `BoardEvent` 数据模型（事件流）
- ✅ 实现三类查询契约：`board.get`、`board.events`、`board.blockers`
- ✅ 阻塞项强约束：`board.blocked[]` 必填 `block_reason`（机读）和 `owner`
- ✅ 证据链接聚合视图（按阶段归档）
- ✅ 支持分页回放，不丢序号

### 1.3 范围边界（OUT）
- ❌ 跨房间任务委派（属于 M3）
- ❌ 灰度切换与回退策略（属于 M4）
- ❌ 实时推送通知（当前仅支持查询）
- ❌ 告示牌 UI 可视化（仅实现数据层）

## 2) 约束条件

### 2.1 技术约束
- 必须与 M1 已落地的 v2 状态机兼容
- 必须复用现有 `.data/workflows/*.json` 存储结构
- 查询延迟目标：< 100ms（单次查询）
- 事件存储：append-only，不可修改历史

### 2.2 兼容性约束
- v1 workflow 任务不强制启用 board 模式
- v2 workflow 任务默认启用 board 模式
- 必须支持 v1/v2 并存查询

### 2.3 运维约束
- 不引入新的外部依赖（数据库、消息队列等）
- 状态文件大小增长可控（单任务 < 1MB）
- 支持手动修复损坏的 board 状态

## 3) 成功标准（验收口径）

### 3.1 功能验收
- [ ] `board.get` 可在 1 次查询内返回：task_id, stage_name, owner, todo[], in_progress[], blocked[], done[]
- [ ] `board.events` 可按时间顺序返回事件流，支持分页（limit + offset）
- [ ] `board.blockers` 可返回所有阻塞项，每项包含 block_reason（机读）+ owner + created_at
- [ ] 阻塞项创建时若缺失 block_reason 或 owner，返回验证错误

### 3.2 质量验收
- [ ] 一次查询可见当前关键信息命中率 = 100%
- [ ] 事件可追溯完整率 = 100%（每个 stage change 可追到 event + evidence）
- [ ] 分页回放正确率 = 100%（无丢序、无重复）
- [ ] 并发写入安全性：多 agent 同时更新 board 不丢失数据

### 3.3 性能验收
- [ ] `board.get` 查询延迟 < 100ms（P95）
- [ ] `board.events` 分页查询延迟 < 200ms（P95）
- [ ] 单任务状态文件大小 < 1MB（100 个事件以内）

## 4) 关键风险

### R1: Board 状态失真
- **描述**：board.blocked[] 与实际阻塞状态不一致
- **影响**：协作方无法准确定位阻塞点
- **缓解**：blocked 项必须带机读 `block_reason`，并与审计日志关联

### R2: 事件流膨胀
- **描述**：长期运行任务的事件流过大，影响查询性能
- **影响**：分页查询变慢，状态文件超过 1MB
- **缓解**：设计事件归档机制（超过 100 个事件后归档到独立文件）

### R3: 并发写冲突
- **描述**：多 agent 同时更新 board 导致数据丢失
- **影响**：board 状态不完整或损坏
- **缓解**：复用 M1 的 lock 机制，确保原子写入

## 5) 依赖关系

### 5.1 前置依赖
- ✅ M1 已完成：v2 状态机、5 阶段映射、终态保护
- ✅ 现有 lock 机制可用（handler.sh 的 mkdir-based locking）

### 5.2 后续依赖
- M3（跨房间消息桥）依赖 M2 的事件流模型
- M4（灰度切换）依赖 M2 的可观测指标

## 6) 下一步行动

1. 进入 Stage 1 (Design)，设计详细的数据模型与 API 契约
2. 定义 `BoardSnapshot`、`BoardEvent`、`BoardBlocker` 的 JSON schema
3. 设计三类查询的请求/响应格式
4. 评估存储策略：是否需要独立的事件文件

## 7) 参考文档

- M1-M4 蓝图：`docs/workflow/task-2f6c911d/architect-design-2026-03-31.md`
- M1 实施记录：`docs/workflow/task-2f6c911d/`
- 现有 workflow handler：`skills/dev-workflow/scripts/handler.sh`
