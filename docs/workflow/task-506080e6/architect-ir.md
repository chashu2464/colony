# OpenClaw 双向集成 IR 文档（架构师）

## 1. 任务分类
- 分类：新功能 / 外部系统集成
- 当前阶段：Stage 1 - Initial Requirements
- 目标：固化 OpenClaw 作为“系统外部 agent 个体”接入 Colony 的核心架构、边界、接口契约与验收标准，作为后续详细设计与实施输入。

## 2. 核心架构

### 2.1 架构结论
采用“外部 Agent 桥接”架构：
1. Colony -> OpenClaw：通过 OpenClaw 对外接口发送消息或会话事件。
2. OpenClaw -> Colony：通过 Colony 新增 webhook 集成入口回灌消息或运行状态。
3. 中间增加 session mapping 与 event translation 层，保证房间路由、幂等与审计可控。

### 2.2 锁定决策
1. OpenClaw 视为系统外部接入的 agent 个体，不融入 Colony 内部 agent/runtime。
   理由：用户已明确要求“可通信即可”，不需要把 OpenClaw 并入 Colony agent 体系。
2. 首版不做 `ModelRouter` provider 化改造。
   理由：当前目标是外部 agent 通信，不是把 OpenClaw 当作 Colony 的模型提供方。
3. 首版不解析、不执行 OpenClaw 的 `tool_call` / `function_call`。
   理由：工具调用不在当前范围内，避免额外协议耦合。
4. 入站事件首版冻结为 3 类：`run.started`、`message.completed`、`run.failed`。
   理由：覆盖最小通信闭环，足以实现外部 agent 收发消息与状态同步。
5. 第一版不引入 `message.delta`。
   理由：避免高频流式事件冲击当前单体 HTTP + 内存广播架构。

## 3. 范围

### 3.1 In Scope
- 新增 OpenClaw 出站桥接客户端，用于把 Colony 房间消息发送到外部 OpenClaw agent。
- 新增入站 webhook 路由、验签、幂等、session mapping、事件翻译。
- 将 3 类冻结事件落到 Colony 房间并通过现有 WebSocket 广播。
- 明确配置模型、测试矩阵与集成验收标准。

### 3.2 Out of Scope
- Provider 化底座改造。
- 将 OpenClaw 作为 `ILLMProvider` 接入 `ModelRouter`。
- token 级实时 webhook / `message.delta`。
- 工具调用解析、执行、闭环。
- 自动静默 fallback。

## 4. 关键需求

### 4.1 出站通信需求
- Colony 能把房间消息发送给 OpenClaw 外部 agent。
- 请求需携带可追踪上下文：至少包含 `traceId`、`sessionKey`、发送方标识。
- 请求模型必须保持“消息桥接”语义，而不是内部 LLM invoke 语义。

### 4.2 入站事件需求
- Colony 提供受保护的 HTTP webhook 入口。
- 入站请求必须通过鉴权/验签、时间窗校验、幂等校验。
- 事件必须通过 `sessionKey` 或映射关系落入正确 room。
- 未知事件类型必须安全忽略并产生日志。

### 4.3 会话绑定需求
- 必须维护 `sessionKey -> roomId/traceId/externalAgentId` 映射。
- 禁止同一 `traceId` 跨房间写入。
- 映射缺失时必须失败可观测，不允许写入默认房间。

## 5. 接口契约（核心版）

### 5.1 入站公共字段
```json
{
  "eventId": "evt_xxx",
  "sessionKey": "session_xxx",
  "traceId": "trace_xxx",
  "eventType": "message.completed",
  "timestamp": "2026-03-20T12:00:00Z",
  "payload": {}
}
```

### 5.2 契约约束
- `eventId`：全局唯一，用于幂等。
- `sessionKey`：必须可映射到 Colony room。
- `traceId`：同一链路追踪标识，不允许跨房间漂移。
- `eventType`：仅允许冻结事件集；未知值安全忽略。
- `timestamp`：必须通过允许时间窗校验。
- `payload`：首版只承载文本消息与运行状态，不承载 tool 调用语义。

## 6. 配置模型（核心版）
- `OPENCLAW_BASE_URL`
- `OPENCLAW_API_KEY`
- `OPENCLAW_AGENT_ID`
- `OPENCLAW_TIMEOUT_MS`
- `OPENCLAW_WEBHOOK_SECRET`
- `OPENCLAW_ALLOWED_SKEW_MS`

## 7. 基础设施可行性检查

### 7.1 当前能力
- Colony 当前已有 Express HTTP 服务。
- 已有 WebSocket 广播链路。
- 已有房间与消息总线，可承接低到中频事件落库/广播。

### 7.2 结论
- 可支撑首版 webhook 集成与 3 类冻结事件。
- 不建议首版承接高频流式 delta 或海量事件风暴。

## 8. 主要风险
1. 若仍沿用 provider 化方案，会引入不必要的 LLM 接入改造，偏离用户目标。
2. 若 webhook 绕过 session mapping，将造成串房风险。
3. 若未来又临时加入 tool 解析，会导致协议边界重新膨胀。
4. 若把 OpenClaw 当成 Colony 内部 agent 实现，会增加生命周期与调度耦合。

## 9. 验收标准
1. Colony 能向 OpenClaw 外部 agent 发送一次完整消息，并收到对应回复。
2. webhook 入口具备鉴权、时间窗校验、幂等、防重放与审计日志。
3. 3 类冻结事件均可被正确接收、转换并落入正确房间。
4. OpenClaw 回复能作为外部 agent 消息显示在 Colony 房间中。
5. 未知 `eventType`、重复 `eventId`、映射缺失、签名失败均不会导致服务崩溃。
6. 同一 `traceId` 跨房间写入尝试会被拒绝并留下安全日志。
7. 首版实现中不存在 `tool_call` 解析、执行或闭环逻辑。

## 10. 下一步
- 本文档确认后，进入详细设计细化：桥接客户端、入站字段明细、事件转换规则、单测矩阵。
- 开发实施顺序调整为：`P1 出站桥接 -> P2 入站回调`。
