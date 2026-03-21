# Stage 7 集成测试报告（QA）

任务ID：506080e6  
阶段：Stage 7 - Integration Testing  
执行时间：2026-03-21

## 1. 测试范围与基线
- 基线约束：OpenClaw 作为外部 agent，仅验证消息/事件互通。
- 不做项：不解析/执行 toolcall，不引入 delta 事件。
- 入站事件范围：`run.started` / `message.completed` / `run.failed`。
- 安全门禁：签名校验、时间窗校验、幂等去重、防串房(traceId-room 绑定)、未知事件安全忽略。

## 2. 执行证据
执行命令：
- `npm run build:server`
- `npm run test -- src/tests/unit/openclaw/*.test.ts`

结果摘要：
- 构建：通过（tsc 成功）。
- OpenClaw 相关测试：通过（12 files, 36 tests 全部通过）。
- 关键分支验证：
  - 正常链路：通过（run.started、message.completed、run.failed 覆盖）。
  - 异常链路：通过（签名失败、时间窗过期、上游 5xx、invalid JSON、超时）。
  - 边界/安全：通过（重复 eventId、未知 eventType=202、安全拒绝 traceId 跨房间注入、session mapping 缺失）。

## 3. Given-When-Then 集成结论（抽样）
1) Given 合法签名与已映射 sessionKey，When 入站 `run.started`，Then 返回 200 且消息落到目标 room。  
2) Given 非法签名，When 请求入站 webhook，Then 返回 401 + `SIGNATURE_INVALID`。  
3) Given 事件时间戳超出 `OPENCLAW_ALLOWED_SKEW_MS`，When 请求入站 webhook，Then 返回 401 + `TIMESTAMP_EXPIRED`。  
4) Given 同一 `eventId` 重复到达，When 第二次请求入站 webhook，Then 返回 200 + `duplicate_ignored`。  
5) Given 未支持 `eventType`，When 请求入站 webhook，Then 返回 202 + `ignored_unknown_event`。  
6) Given 同一 `traceId` 尝试跨 room 写入，When 请求入站 webhook，Then 返回 409 + `TRACE_ROOM_MISMATCH`。

## 4. 安全审查结论（OWASP 视角）
- 身份与完整性：HMAC + `timingSafeEqual`，可抵御常规签名伪造。  
- 重放防护：时间窗 + eventId 幂等去重（内存态）。  
- 访问边界：session mapping 与 trace-room 绑定阻断跨房间注入。  
- 输入处理：原始 JSON body + 字段类型校验，未知事件安全忽略。

## 5. 缺陷结论
- 本轮未发现可复现的 P0/P1 功能缺陷。  
- 发现风险（非阻塞）：
  1. 幂等与映射存储为进程内内存，服务重启后状态丢失；在多实例部署下需统一存储以避免重复消费风险。
  2. 本轮为定向 OpenClaw 路径验证，尚未完成真实中频压测（仅完成逻辑/单测层验证）。

## 6. Stage 7 门禁声明
门禁结论：**条件通过（可推进 Stage 8）**。

已验证场景：
- 正常/异常/边界/安全全分支矩阵（含签名、时间窗、幂等、防串房、未知事件、上游异常）。
- 构建可通过，OpenClaw 定向测试可重复通过。

遗留风险：
- 中频性能门槛需在目标部署环境补齐实测数据。
- 多实例/重启场景下的幂等一致性需在后续版本引入持久化方案。

WHY：当前版本目标是“外部 agent 通信闭环 + 不影响现有功能”，核心门禁已满足；遗留项不阻断本次进入 Stage 8 的交付评审。
