# Stage 6 实施结果（OpenClaw 外部 Agent 双向通信）

## 1. 本轮已完成
- 新增 OpenClaw 集成基础模块：
  - `src/integrations/openclaw/config.ts`
  - `src/integrations/openclaw/types.ts`
  - `src/integrations/openclaw/OpenClawClient.ts`
  - `src/integrations/openclaw/sessionMappingStore.ts`
  - `src/integrations/openclaw/idempotencyStore.ts`
  - `src/integrations/openclaw/signature.ts`
  - `src/integrations/openclaw/eventTranslator.ts`
  - `src/integrations/openclaw/OpenClawBridge.ts`
- 新增入站 webhook 路由：
  - `src/server/routes/openclawIntegration.ts`
  - 路径 `POST /api/integrations/openclaw/events`
  - 覆盖签名校验、时间窗、幂等、session mapping、traceId 跨房间防护、未知事件 202 安全忽略
- 集成到服务启动路径：
  - `src/server/index.ts`
  - `OPENCLAW_ENABLED` 启用时挂载入站路由并启动出站桥接
  - 未启用时无行为变更

## 2. 单测覆盖（已编写）
- `src/tests/unit/openclaw/config.test.ts`
- `src/tests/unit/openclaw/OpenClawClient.test.ts`
- `src/tests/unit/openclaw/sessionMappingStore.test.ts`
- `src/tests/unit/openclaw/idempotencyStore.test.ts`
- `src/tests/unit/openclaw/OpenClawBridge.test.ts`
- `src/tests/unit/openclaw/openclawIntegrationRoute.test.ts`

覆盖矩阵：
- 正常：run.started 事件处理、出站成功
- 异常：签名失败、时间窗过期、上游 5xx、无效 JSON、超时
- 边界/安全：重复 eventId、未知 eventType=202、traceId 跨房间注入、session mapping 缺失
- 配置：timeout 非法触发显式失败

## 3. 当前阻塞
- 本地环境缺少依赖，无法执行自动化验证：
  - `npm run build:server` 失败：`tsc: command not found`
  - `npx vitest run ...` 失败：`Cannot find module 'vitest/config'`

## 4. 风险说明
- 由于依赖缺失，本轮为“代码完成 + 用例落盘”，未能在当前环境给出可执行测试日志。
- 建议在安装依赖后立即执行：
  - `npm install`
  - `npm run build:server`
  - `npm run test -- src/tests/unit/openclaw/*.test.ts`

## 5. 边界与接口契约（修订）
- 路由边界：
  - OpenClaw 是“可加入会话的外部特殊 agent”，不是房间全量消息镜像目标。
  - 仅当消息 `mentions` 命中 OpenClaw 稳定 `agentId` 时，Colony 才执行出站路由。
  - `OPENCLAW_ROOM_IDS` 只用于白名单准入，不代表全量同步。
- Colony 对 OpenClaw 仅提供桥接能力：
  - `get-messages`：供 OpenClaw 按需拉取会话消息。
  - `send-message`：供 OpenClaw 主动回写消息到 Colony。
- `send-message` 契约要求：
  - 必须携带稳定 `roomId`，否则回写消息无法稳定路由到目标会话。
  - 若缺少 `roomId`，服务端应拒绝请求并返回可诊断错误。
- mention 匹配要求：
  - 优先使用稳定 `agentId`，禁止仅依赖显示名/别名做路由判定，避免改名导致隐性故障。
