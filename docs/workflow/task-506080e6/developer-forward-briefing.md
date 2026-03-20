# Stage 3 Forward Briefing（Developer -> QA）

## 1. 目标与定位
- 本任务定位为“外部系统桥接”，不是 Colony 内部 agent/provider 改造。
- OpenClaw 被视为系统外独立 agent 个体；Colony 仅负责双向通信通道。
- 核心目标：稳定通信、可追踪、可回放审计、低侵入零回归。

## 2. 实现意图（供 QA 校验）
- 出站链路：Colony 房间消息在命中桥接条件时，经 `OpenClawClient` 转发到 OpenClaw。
- 入站链路：OpenClaw 通过 `POST /api/integrations/openclaw/events` 回灌事件。
- 会话路由：通过 `sessionKey -> roomId/traceId/externalAgentId` 映射定位目标房间。
- 协议转换：仅处理冻结事件 `run.started` / `message.completed` / `run.failed`。

## 3. 明确不做（必须验证未混入）
- 不接入 `ModelRouter`、`ProviderRegistry`、`ILLMProvider`。
- 不解析、不执行 OpenClaw `tool_call` / `function_call`。
- 不实现 `message.delta` 或高频流式事件。
- 不允许静默降级到其他接口或内部模型路径。

## 4. 安全与一致性边界
- 入站必须具备：鉴权/验签、时间窗校验、`eventId` 幂等。
- `sessionKey` 映射缺失必须失败可观测，不允许写默认房间。
- 同一 `traceId` 跨房间写入尝试必须拒绝并记安全日志。
- 未知 `eventType` 必须安全忽略并保留审计日志。

## 5. QA 关注的高风险回归点
- 现有内部 agent 与 LLM/provider 路径是否零行为变化。
- webhook 异常（签名失败、重复事件、过期时间戳）是否引发服务崩溃。
- 幂等与映射校验失败时是否产生重复消息或串房。
- OpenClaw 上游 5xx/超时时是否正确失败并保留可追踪日志。

## 6. 推荐测试矩阵（Stage 5 必覆盖）
- 正常链路：出站成功 + 入站 3 类事件成功落房间。
- 安全异常：签名失败、时间窗过期、payload 不合法。
- 幂等异常：重复 `eventId` 重放。
- 路由异常：`sessionKey` 缺失、`traceId` 跨房间。
- 协议演进：未知 `eventType` 安全忽略。
- 回归保护：未启用 OpenClaw 的房间功能无行为变化。

## 7. 交付依据
- `docs/workflow/task-506080e6/architect-design.md`
- `docs/workflow/task-506080e6/architect-ir.md`
- `docs/workflow/task-506080e6/developer-implementation-tasklist.md`
