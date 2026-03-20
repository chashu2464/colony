# QA Stage 4 Reverse Briefing (Draft)

## 1) QA 反向复述（与当前锁定设计一致）

- 集成形态：OpenClaw 作为系统外部 agent 个体接入；Colony 与 OpenClaw 仅做消息/事件互通。
- 入站唯一核心接口：`POST /api/integrations/openclaw/events`。
- 冻结事件集：`run.started`、`message.completed`、`run.failed`。
- 顶层必填：`eventId`、`sessionKey`、`traceId`、`eventType`、`timestamp`、`payload`。
- 明确不做：`toolcall/function_call` 解析与执行、`message.delta`。
- 安全红线：验签、时间窗校验、防重放、幂等去重、防串房、审计可追溯。

## 2) Given-When-Then 测试用例（全分支）

### A. 正常流程

#### TC-A1 `run.started` 正常入站
- Given：存在有效 `sessionKey -> roomId` 映射，签名合法，时间窗合法，`eventId` 未出现。
- When：发送 `eventType=run.started` 事件。
- Then：返回成功（2xx），事件被记录审计日志，房间状态更新为运行中，不产生默认房间写入。

#### TC-A2 `message.completed` 文本消息回灌
- Given：映射存在且合法，签名/时间窗均通过，`payload` 为文本消息。
- When：发送 `eventType=message.completed`。
- Then：消息写入目标房间并可被下游消费（MessageBus/WebSocket），审计日志包含 `eventId/traceId/roomId`。

#### TC-A3 `run.failed` 失败态可观测
- Given：映射存在，签名合法，时间窗合法。
- When：发送 `eventType=run.failed`，携带错误信息。
- Then：返回成功（2xx），房间状态更新为失败态，错误信息可观测并可追踪至 `traceId`。

### B. 异常流程

#### TC-B1 签名失败
- Given：请求体被篡改或 `OPENCLAW_WEBHOOK_SECRET` 不匹配。
- When：发送任意冻结事件。
- Then：请求被拒绝（4xx），不写房间、不写业务事件，仅记录安全审计日志。

#### TC-B2 时间窗过期（重放防护）
- Given：`timestamp` 超过 `OPENCLAW_ALLOWED_SKEW_MS`。
- When：发送合法签名请求。
- Then：请求被拒绝（4xx），不写房间，记录重放风险日志。

#### TC-B3 `sessionKey` 映射缺失
- Given：`sessionKey` 不存在映射。
- When：发送合法请求。
- Then：失败可观测（4xx/5xx 取实现约定），严禁写入默认房间，审计中标记 mapping_miss。

#### TC-B4 上游 5xx/超时（出站链路）
- Given：OpenClaw API 返回 5xx 或超时。
- When：Colony 发起出站调用。
- Then：失败信息可观测并带 traceId；不触发错误的成功态；重试策略符合配置约束。

### C. 边界与安全

#### TC-C1 重复 `eventId` 幂等
- Given：同一 `eventId` 已处理完成。
- When：重复发送相同事件。
- Then：不重复落库/落房间，返回幂等成功语义（2xx/约定状态），审计标记 duplicate_ignored。

#### TC-C2 未知 `eventType`
- Given：事件类型不在冻结集合。
- When：发送 `eventType=unknown.xxx`。
- Then：`202 Accepted` 安全忽略，不写业务数据，记录审计日志（包含原始 eventType）。

#### TC-C3 `traceId` 跨房间注入
- Given：同一 `traceId` 已绑定 roomA。
- When：携带相同 `traceId` 但 `sessionKey` 指向 roomB 发起写入。
- Then：必须拒绝并记录安全日志，禁止跨房间污染。

#### TC-C4 payload 边界（超长/非法结构）
- Given：`payload` 超过限制或结构缺失关键字段。
- When：发送 `message.completed`。
- Then：请求被拒绝或安全忽略（按契约），不得导致服务异常，不得污染房间数据。

#### TC-C5 配置边界校验
- Given：`OPENCLAW_BASE_URL` 非法、`OPENCLAW_TIMEOUT_MS<=0`、`OPENCLAW_ALLOWED_SKEW_MS<0`。
- When：服务启动或首次调用。
- Then：配置校验失败并显式报错，禁止静默降级。

## 3) 安全审查清单（OWASP 定向）

- A01 Broken Access Control：webhook 写入必须经过 session mapping 与 trace 绑定校验。
- A02 Cryptographic Failures：签名算法、密钥管理、时间窗校验必须启用。
- A03 Injection：日志写入与消息拼装要做转义/结构化，避免日志注入。
- A09 Security Logging and Monitoring Failures：安全事件必须带 `eventId/traceId/sessionKey/roomId` 可追踪字段。
- A10 SSRF（扩展关注）：`OPENCLAW_BASE_URL` 需限制协议与主机白名单策略（若实现支持）。

## 4) 性能与稳定性验收阈值（首版）

- 事件处理延迟：P95 < 300ms（不含外部网络波动，按本地环境基线）。
- 幂等存储命中：重复事件不产生二次写入。
- 失败可恢复：签名失败/映射缺失/未知事件不会导致进程崩溃或队列阻塞。
- 并发基线：中频事件压测下错误率为 0（业务拒绝类除外，需可观测）。

## 5) P0/P1 缺陷归零模板

每个 P0/P1 缺陷关闭前必须补齐：
1. 修复内容：改了什么、影响范围是什么。
2. 引入原因：为何会引入该缺陷（设计、实现、配置、测试遗漏）。
3. 归因路径：需求->设计->代码->测试哪一环失守，如何防再发（用例/门禁/监控补强）。

## 6) Stage 4 门禁声明（初稿）

### 门禁结论（草案）
- 当前为 Stage 4 反向复述门禁，结论：**条件性通过（待开发侧按同矩阵补齐自测与证据）**。

### 已验证的设计一致性场景
- 接口与字段：`/api/integrations/openclaw/events` + 顶层 6 必填字段。
- 事件范围：冻结 3 类事件，不含 toolcall 与 delta。
- 安全策略：签名、时间窗、幂等、mapping、防串房、审计均已纳入门禁条款。
- 异常分支：签名失败、过期、重复、映射缺失、未知事件、跨房间注入、上游超时/5xx 均有用例。

### 遗留风险
- 具体状态码与错误码尚待实现落地统一（如 mapping miss/duplicate 语义码）。
- 性能阈值需在实现完成后通过压测实测确认。
- 审计日志字段完整性需在代码级别核查（防字段缺失导致追踪断链）。

### 阶段出口条件
- 开发提交自测证据覆盖上述全分支矩阵。
- QA 复测通过并无新增 P0/P1。
- 若出现 API 契约变更或范围外需求（toolcall/delta），必须回架构重审。

## 7) Stage 4 门禁评审结论（更新）

### 评审输入
- `docs/workflow/task-506080e6/developer-implementation-tasklist.md`（已补第 7/8 节）

### 结论
- **Stage 4 门禁：通过（可进入后续编码阶段）**。

### 通过依据（已验证场景）
- 开发侧已将 QA 要求的全分支矩阵落成“自测点+证据要求”，覆盖正常/异常/边界/配置边界。
- 已固化 Stage 6 顺序约束 `S1->S6`，并把“先安全外壳后事件分发、先错误语义统一后提测”写入执行基线。
- 与锁定范围一致：仅 3 类事件、无 toolcall 解析执行、无 delta、外部 agent 接入模式。

### 遗留风险（进入 Stage 6 后持续跟踪）
- `S5` 错误码与错误体需在实现时最终冻结，避免测试口径漂移。
- 审计字段完整性需在真实日志中抽样核验（`eventId/traceId/sessionKey/roomId`）。
- 性能阈值需要实测数据支撑（中频事件压测）。

### 后续 QA 门禁要求
- Stage 6 提测必须携带第 7 节定义的逐项证据；缺任何高风险分支证据则不予通过。
- 若出现范围变更（toolcall/delta/API 契约变化），立即退回架构重审。
