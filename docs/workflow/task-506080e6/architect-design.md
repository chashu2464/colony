# OpenClaw 外部 Agent 桥接设计文档（架构师）

## 1. 设计目标
- 将 OpenClaw 作为系统外部独立 agent 接入 Colony。
- 实现 Colony -> OpenClaw 的消息出站桥接。
- 实现 OpenClaw -> Colony 的 webhook 入站回灌。
- 保证现有 Colony 内部 agent、ModelRouter、LLM provider 逻辑不受影响。

## 2. 核心架构

### 2.1 架构结论
采用“外部 Agent 桥接 + 入站回调”架构：
1. 出站桥接层：监听或挂接 Colony 房间消息发送链路，将指定消息转发给 OpenClaw。
2. 入站回调层：通过 webhook 接收 OpenClaw 的运行状态或消息结果。
3. 会话映射层：负责 `sessionKey -> roomId/traceId/externalAgentId` 定位。
4. 事件转换层：将 OpenClaw 事件转换为 Colony room message / status event。

### 2.2 设计边界
- 不接入 `ModelRouter`。
- 不实现 `ILLMProvider`。
- 不解析 `tool_call` / `function_call`。
- 不引入 `message.delta`。
- 不改变现有内部 agent 生命周期与调度逻辑。

## 3. 组件设计

## 3.1 OpenClawClient
**一句话理由**：把所有 OpenClaw 出站通信封装到单一客户端，避免污染现有消息与 server 逻辑。

职责：
- 读取 OpenClaw 配置。
- 组装出站请求。
- 发送 HTTP 请求。
- 标准化网络错误、超时、上游 5xx 错误。

建议数据模型：
```ts
interface OpenClawOutboundRequest {
  sessionKey: string;
  traceId: string;
  externalAgentId: string;
  senderId: string;
  content: string;
  timestamp: string;
}
```

## 3.2 SessionMappingStore
**一句话理由**：双系统通信必须依赖稳定映射，不能靠消息内容或 prompt 推断路由。

职责：
- 创建映射
- 查询映射
- 校验 `traceId` 与 room 一致性
- 支持首版内存存储与 TTL 清理

建议数据模型：
```ts
interface OpenClawSessionMapping {
  sessionKey: string;
  roomId: string;
  traceId: string;
  externalAgentId: string;
  createdAt: string;
  updatedAt: string;
}
```

## 3.3 OpenClaw Integration Route
**一句话理由**：把所有 OpenClaw 入站流量收敛到单一可信入口，便于鉴权、幂等与审计。

入口：
- `POST /api/integrations/openclaw/events`

职责：
- 验签 / 鉴权
- 校验时间窗
- 检查 payload 大小
- 幂等去重
- 调用 event translator
- 写入房间消息或状态事件

## 3.4 EventTranslator
**一句话理由**：外部系统事件格式与 Colony 内部消息格式需要隔离，避免协议细节扩散到业务层。

冻结事件集：
1. `run.started`
2. `message.completed`
3. `run.failed`

建议事件模型：
```ts
interface OpenClawInboundEvent {
  eventId: string;
  sessionKey: string;
  traceId: string;
  eventType: 'run.started' | 'message.completed' | 'run.failed';
  timestamp: string;
  payload: Record<string, unknown>;
}
```

转换规则：
- `run.started` -> Colony 状态事件或系统消息
- `message.completed` -> Colony 普通消息
- `run.failed` -> Colony 错误状态消息或失败事件

## 3.5 IdempotencyStore
**一句话理由**：webhook 场景天然可能重试，没有幂等会导致重复消息和状态污染。

职责：
- 记录已处理 `eventId`
- TTL 清理
- 支持快速 exists/check-and-set 语义

## 4. 时序设计

### 4.1 出站消息时序
1. 用户或系统向某个 room 发送消息。
2. 桥接入口判断该 room 是否配置了 OpenClaw 外部 agent。
3. 若配置存在，则创建/更新 `sessionKey` 映射。
4. `OpenClawClient` 将消息发送给 OpenClaw。
5. 记录 traceId、sessionKey、externalAgentId 审计日志。

### 4.2 入站消息时序
1. OpenClaw 向 `/api/integrations/openclaw/events` 发送 webhook。
2. 服务完成鉴权、时间窗校验、payload 限流。
3. `IdempotencyStore` 去重。
4. `SessionMappingStore` 根据 `sessionKey` 查找 room。
5. `EventTranslator` 转换事件。
6. 写入 ChatRoom / MessageBus。
7. 前端通过现有 WebSocket 收到更新。

## 5. 文件级改造点
- `src/integrations/openclaw/OpenClawClient.ts`（新增）
- `src/integrations/openclaw/sessionMappingStore.ts`（新增）
- `src/integrations/openclaw/eventTranslator.ts`（新增）
- `src/integrations/openclaw/idempotencyStore.ts`（新增）
- `src/server/routes/openclawIntegration.ts`（新增）
- `src/server/index.ts`（挂载路由与限流）
- `src/config/types.ts` / `src/config/index.ts`（新增配置）
- `src/server/routes/openclawBridge.ts` 或现有房间消息发送链路（挂接出站桥接）

## 6. 配置模型
```ts
interface OpenClawBridgeConfig {
  baseUrl: string;
  apiKey: string;
  agentId: string;
  timeoutMs: number;
  webhookSecret: string;
  allowedSkewMs: number;
}
```

环境变量：
- `OPENCLAW_BASE_URL`
- `OPENCLAW_API_KEY`
- `OPENCLAW_AGENT_ID`
- `OPENCLAW_TIMEOUT_MS`
- `OPENCLAW_WEBHOOK_SECRET`
- `OPENCLAW_ALLOWED_SKEW_MS`

## 7. 安全设计
1. 鉴权：Bearer 或 HMAC 二选一，优先 HMAC。
2. 时间窗校验：默认 5 分钟窗口。
3. 幂等：`eventId` 去重。
4. 串房防护：同一 `traceId` 不允许跨房间写入。
5. payload 限制：沿用现有 Express JSON limit，并对该路由增加更严格限制。
6. 审计：记录 `eventId`、`traceId`、`sessionKey`、`roomId`、`eventType`。

## 8. 兼容性与回归控制
- 首版不修改 `ModelRouter`、`ProviderRegistry`、`llm` provider 体系。
- 新能力仅在显式启用 OpenClaw bridge 配置的房间/路径生效。
- 未启用 OpenClaw 的现有功能路径应保持零行为变化。

## 9. 验收标准
1. Colony 能向 OpenClaw 外部 agent 发送一次完整文本消息。
2. OpenClaw 能通过 webhook 将结果回灌到正确 room。
3. 3 类冻结事件均能被正确处理。
4. 鉴权失败、时间窗过期、重复事件、映射缺失时服务不崩溃且有日志。
5. 现有内部 agent、ModelRouter、provider 相关功能无回归。
6. 首版实现不包含 tool call 解析、执行或闭环逻辑。

## 10. 备选方案与权衡

### 方案 A：外部 Agent 桥接（推荐）
- 优点：侵入最小、边界清晰、回归风险最低。
- 缺点：无法复用内部 LLM/provider 统一层。

### 方案 B：Provider 化接入（不推荐）
- 优点：可复用 LLM 统一抽象。
- 缺点：与当前“独立系统交互”目标不一致，改造面过大。

### 方案 C：内部 Agent 适配（不推荐）
- 优点：从 UI 看更统一。
- 缺点：生命周期、调度、工具执行都会耦合，风险最高。
