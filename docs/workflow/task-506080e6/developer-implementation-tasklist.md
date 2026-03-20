# OpenClaw 双向集成实施任务单（开发）

## 0. 锁定决策（来自架构评审）
- OpenClaw 视为系统外部接入的 agent 个体，不融入 Colony 内部 agent/runtime。
- 当前目标是“可通信”，不是把 OpenClaw 接入 `ModelRouter` 作为模型 provider。
- 首版不解析、不执行 OpenClaw 的 `tool_call` / `function_call`。
- 入站事件第一版冻结 3 类：`run.started`、`message.completed`、`run.failed`。
- 第一版禁止引入 `message.delta`。

## 1. 分阶段实施与文件级改造点

### P1 外部 Agent 出站桥接
目标：打通 Colony -> OpenClaw 的消息发送主链路。

拟改造文件：
- `src/integrations/openclaw/OpenClawClient.ts`（新增）
  - 组装出站请求：文本消息、`traceId`、`sessionKey`、发送方标识。
  - 调用 OpenClaw 对外接口。
  - 处理正常响应、5xx、超时、无效响应。
- `src/integrations/openclaw/sessionMappingStore.ts`（新增）
  - `sessionKey -> roomId/traceId/externalAgentId` 映射。
- `src/server/routes/openclawBridge.ts` 或现有房间消息发送链路相关文件
  - 在房间消息出站时触发 OpenClaw 桥接。
- `src/config/types.ts` / `src/config/index.ts`
  - 增加 `OPENCLAW_BASE_URL`、`OPENCLAW_API_KEY`、`OPENCLAW_AGENT_ID`、`OPENCLAW_TIMEOUT_MS`。

测试文件：
- `src/integrations/openclaw/__tests__/OpenClawClient.test.ts`
  - 正常返回、5xx、超时、无效 JSON。
- `src/integrations/openclaw/__tests__/sessionMappingStore.test.ts`

### P2 入站事件接入（Webhook）
目标：OpenClaw -> Colony 的安全可幂等回灌。

拟改造文件：
- `src/server/routes/openclawIntegration.ts`（新增）
  - `POST /api/integrations/openclaw/events`
  - 验签（`Authorization` 或 HMAC + `X-Timestamp`）
  - 幂等（`eventId` 去重）
  - 事件分发（3 类冻结事件）
- `src/server/index.ts`
  - 挂载 integration 路由与 payload 限流。
- `src/integrations/openclaw/sessionMappingStore.ts`
  - 查询 `sessionKey -> roomId/traceId/externalAgentId` 映射。
- `src/integrations/openclaw/eventTranslator.ts`（新增）
  - OpenClaw 事件转 Colony message/status。
- `src/integrations/openclaw/idempotencyStore.ts`（新增）
  - `eventId` 去重记录（首版可内存 + TTL）。

## 2. 接口契约草案（P2）
请求体公共字段：`eventId`、`sessionKey`、`traceId`、`eventType`、`timestamp`、`payload`。

事件约束：
- 未知 `eventType`：记录审计日志并 `202 Accepted` 安全忽略。
- 同 `traceId` 跨房间写入：拒绝并记录安全审计。
- `payload` 首版仅承载文本消息与运行状态，不承载工具调用语义。

## 3. 配置模型草案
- `OPENCLAW_BASE_URL`：Gateway/接口地址。
- `OPENCLAW_API_KEY`：出站鉴权。
- `OPENCLAW_AGENT_ID`：默认外部 agent ID。
- `OPENCLAW_TIMEOUT_MS`：请求超时。
- `OPENCLAW_WEBHOOK_SECRET`：入站签名校验。
- `OPENCLAW_ALLOWED_SKEW_MS`：时间窗。

## 4. 单测清单（分支矩阵）
- 出站：正常、5xx、超时、无效响应。
- 入站安全：签名失败、时间窗过期、payload 超限。
- 幂等：重复 `eventId`。
- 映射：`sessionKey` 缺失、`traceId` 跨房间写入。
- 协议演进：未知 `eventType` 安全忽略。
- 消息桥接：`run.started`、`message.completed`、`run.failed` 正常转换。

## 5. 集成验收标准
- Colony 可向 OpenClaw 外部 agent 发送一次完整消息。
- OpenClaw 回复可通过 webhook 正确落入指定房间。
- webhook 入口满足：鉴权、幂等、防重放、审计可追踪。
- 3 类冻结事件均可正确落房间并广播给前端。
- 任一安全或映射失败不导致服务崩溃，且有可检索日志。
- 首版实现中不存在 `tool_call` 解析、执行或闭环逻辑。

## 6. 执行顺序
- 严格按 `P1 出站桥接 -> P2 入站回调` 集成验证。
- 设计/测试可并行准备，但代码合入遵循依赖顺序。
