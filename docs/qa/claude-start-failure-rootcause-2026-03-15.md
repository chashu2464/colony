# QA Incident Report: Claude 启动失败根因分析（2026-03-15）

## 结论摘要
- **现象**: 架构师代理拉起 `claude` 连续 3 次失败，日志仅显示 `claude exited with code 1`，随后回退到 `gemini`。
- **根因**: Colony 在 Agent 调用中强制注入了隔离配置目录：
  - `XDG_CONFIG_HOME=.data/sessions/<roomId>`
  - `CLAUDE_CONFIG_DIR=.data/sessions/<roomId>`
  该目录下未完成 Claude 登录态，导致 CLI 返回 `Not logged in · Please run /login` 并 exit code 1。
- **为何“命令行直接 claude 可用”会与代理失败并存**:
  - 用户在普通终端通常使用默认配置目录（`~/.claude` / 默认 XDG 路径）。
  - 代理进程使用的是房间隔离目录（每房间一套配置），两者认证态不同。

## 证据链
1. 运行日志（`logs/colony-2026-03-15.log`）
   - 05:57:01~05:57:39：`claude` 三次调用均 `exited with code 1`，错误文本为空。
   - 随后触发 `Model switched from claude to gemini`。
2. 代码路径
   - `src/agent/Agent.ts`：每次调用注入 `XDG_CONFIG_HOME` 和 `CLAUDE_CONFIG_DIR` 到 `sessionConfigDir`。
   - `src/llm/BaseCLIProvider.ts`：非 0 退出时仅拼接 `stderr` + 部分 JSON error 字段；对 `result.is_error=true` 未提取，导致日志“空错误”。
3. 本地复现实验
   - 命令：`CLAUDE_CONFIG_DIR=/tmp/colony-claude-empty claude -p "Reply exactly: OK" --output-format stream-json --verbose`
   - 结果：返回 JSON 事件含 `Not logged in · Please run /login`，进程 exit code=1。

## Bug 定级
- **BUG-ARCH-CLD-001**
- **严重级别**: P1（主模型不可用，触发降级并丢失原 CLI 会话上下文）

## P1 归零三问
1. **修复内容是什么**
   - 方案 A（推荐）: 认证配置与会话配置分离。保留 session 隔离，但 Claude 认证从稳定的共享路径读取（只读），避免每房间重新登录。
   - 方案 B: 启动前增加 Claude auth preflight（检测 `claude -p` 健康响应是否可用），失败时输出明确错误并指引登录。
   - 方案 C: 增强错误解析，识别 `result.is_error=true` 与 `result` 字段，避免空错误。
2. **引入原因是什么**
   - 为了会话隔离将 `CLAUDE_CONFIG_DIR` 全量重定向到房间目录，但未同步设计“认证态继承/共享”策略。
3. **归因路径是什么**
   - 架构决策缺口（隔离策略只覆盖 session，不覆盖 auth 兼容）
   - 实现缺口（错误提取不完整）
   - 测试缺口（未覆盖“隔离目录无登录态 + 主模型调用”异常路径）

## 安全与可用性评估
- **可用性风险**: 高。主模型反复失败导致回退模型响应行为偏差、上下文链中断。
- **安全风险**: 中。若为修复直接复制 token 到各房间目录，易扩大敏感凭据暴露面。
- **建议**:
  - 采用“共享认证、隔离会话”架构，认证信息只读引用，不在 room 目录复制明文凭据。
  - 房间目录权限强制 `0700`，敏感日志脱敏。

## Given-When-Then 测试用例（覆盖正常/异常/边界）
1. 正常流程（共享认证 + 房间隔离会话）
   - Given 全局 Claude 已登录，房间目录无独立 token
   - When 代理调用 `claude -p ... --resume ...`
   - Then 调用成功返回文本，且会话 ID 持续可恢复
2. 异常流程（未登录）
   - Given 全局未登录且房间目录无 token
   - When 代理调用 `claude -p`
   - Then 返回明确错误 `Not logged in`，并输出登录指引，不应出现空错误
3. 异常流程（错误解析）
   - Given CLI 返回 `result.is_error=true` 且 stderr 为空
   - When BaseCLIProvider 处理退出码非 0
   - Then 错误消息应包含 `result` 文本，不得为空字符串
4. 边界条件（并发房间）
   - Given 两个房间并发调用 Claude
   - When 一方触发登录失效，一方保持可用
   - Then 失败应被精确归因到房间上下文，不能污染其他房间会话
5. 边界条件（模型回退）
   - Given 主模型 Claude 启动失败，fallback Gemini 可用
   - When 触发回退
   - Then 系统需记录“上下文可能丢失”告警并在用户可见消息中说明

## 阶段门禁声明（本次分析）
- **已验证场景**:
  - 日志证据链存在且可复现
  - 环境变量注入路径与失败现象一致
  - 隔离配置目录下未登录可稳定复现 exit code 1
- **遗留风险**:
  - 尚未合入代码修复（当前仅定位根因）
  - 未完成自动化回归（需开发实现后执行）

## 修复实施记录（2026-03-15 14:45 CST）

### 已实施变更
1. `src/agent/Agent.ts`
   - 新增 `resolveClaudeConfigDir(sessionConfigDir)`：
     - 优先使用 `COLONY_CLAUDE_AUTH_CONFIG_DIR`（显式覆盖）
     - 若继承到的 `CLAUDE_CONFIG_DIR` 不是 room 隔离目录，则沿用
     - 若继承到 room 隔离目录，则回退到 `os.homedir()`，避免使用未登录的房间目录
   - 调用模型时：
     - 继续使用 `XDG_CONFIG_HOME=sessionConfigDir`（会话隔离保留）
     - 改为 `CLAUDE_CONFIG_DIR=claudeConfigDir`（认证与会话分离）
   - `CLAUDE_CODE_SESSION_ACCESS_TOKEN` 只在有值时注入，避免传空字符串。

2. `src/llm/BaseCLIProvider.ts`
   - 增强错误提取：新增对 JSON 流里 `result.is_error=true` 且 `result` 为字符串的提取。
   - 非 0 退出时错误信息拼接从 `stderr` 扩展为 `stderr + cliErrorMsg + textChunks`，避免“空错误”。

3. `src/tests/unit/LLMProviders.test.ts`
   - 新增单测 `should surface structured result errors when CLI exits non-zero`，验证 `result.is_error` 可见于抛错信息。

### 验证结果
- `npm run test -- src/tests/unit/LLMProviders.test.ts`：通过
- `npm run build:server`：通过

## 阶段门禁声明（修复后）
- **已验证场景**:
  - Given `result.is_error=true` 且退出码非 0，When BaseCLIProvider 处理进程结束，Then 错误信息包含结构化 `result` 文本
  - Given 需要 room 会话隔离，When Agent 组装环境变量，Then `XDG_CONFIG_HOME` 仍指向 room 目录
  - Given 继承到 room 隔离 `CLAUDE_CONFIG_DIR`，When Agent 组装环境变量，Then 自动回退到共享认证目录（默认 `HOME`）
- **遗留风险**:
  - 当前环境的 Claude 全局登录态本机仍为未登录，无法在本机直接完成“登录成功路径”端到端验证
  - 尚未新增 Agent 级单测直接断言 `CLAUDE_CONFIG_DIR` 的选择逻辑（建议后续补充）

## 日志复检补充（2026-03-15 15:12 CST）

### 新发现
1. 架构师代理在 `2026-03-15T06:52:58Z` 到 `2026-03-15T06:53:36Z` 连续 3 次调用 Claude 失败，错误为：
   - `claude exited with code 1: authentication_failed`
2. 随后回退到 Gemini，但 Gemini 出现 quota/rate-limit（429）后再次回退 Claude，仍为 `authentication_failed`。

### 关键证据
- 日志：`logs/colony-2026-03-15.log`（约第 6272-6284 行、7541-7553 行）
- 代码：`src/agent/Agent.ts`
  - `resolveClaudeConfigDir()` 最终 fallback 为 `os.homedir()`（第 240 行），并通过 `CLAUDE_CONFIG_DIR` 注入子进程（第 358 行）。

### 风险评估（新增）
- **P1 可用性风险**：当 `CLAUDE_CONFIG_DIR` 被显式设置为 `HOME` 根目录而非 Claude 实际配置目录时，即使机器上存在其他登录态，也可能导致代理认证失败。
- **链路级退化风险**：主模型失败 + fallback 配额不足会导致架构师/开发者连续不可用。

### 建议修复
1. 将 `resolveClaudeConfigDir()` 默认回退从 `os.homedir()` 改为明确的 Claude 配置目录（例如 `path.join(os.homedir(), '.claude')`，或优先读取经过验证的 auth dir）。
2. 增加 Agent 级单测：
   - Given 未设置 `COLONY_CLAUDE_AUTH_CONFIG_DIR` 且继承到 room-scoped `CLAUDE_CONFIG_DIR`
   - When 计算 `claudeConfigDir`
   - Then 回退路径应为 Claude 配置目录而非 `HOME` 根目录
3. 启动前增加健康检查：
   - `claude -p "Reply exactly: OK"` 失败时直接标注 `authentication_failed`，并提示执行登录或配置 `COLONY_CLAUDE_AUTH_CONFIG_DIR`。

### 复测门禁声明（本轮）
- **已验证场景**:
  - Given 用户在 `2026-03-15 14:52:56 CST` 触发 `@架构师 test`，When 代理实际执行，Then Claude 连续三次 `authentication_failed`，链路可复现
  - Given fallback 到 Gemini，When quota 耗尽，Then 出现 `rateLimitExceeded/RESOURCE_EXHAUSTED` 并回退失败
- **遗留风险**:
  - 目前未完成“修复后再重启服务”的验证
  - 本机当前 `claude` 命令在默认环境下仍提示 `Not logged in · Please run /login`

## 二次修复与验证补充（2026-03-15 17:44 CST）

### 修复内容（增量）
1. `src/agent/Agent.ts`
   - 修复 `resolveClaudeConfigDir()` 对相对路径的误判：
     - 旧逻辑仅按字符串前缀比较，`.data/sessions/<roomId>`（相对路径）不会被识别为 room-scoped。
     - 新逻辑统一 `path.resolve()` 后再判定，覆盖绝对/相对路径。
   - 默认回退目录从 `HOME` 根目录改为 `~/.claude`，避免将 `CLAUDE_CONFIG_DIR` 指向非 Claude 配置目录。

2. `src/tests/unit/Agent.test.ts`（新增）
   - 新增 5 个单测，覆盖：
     - 显式 `COLONY_CLAUDE_AUTH_CONFIG_DIR` 覆盖优先级
     - 非 room-scoped 的 `CLAUDE_CONFIG_DIR` 继承
     - 绝对路径 room-scoped 识别
     - 相对路径 room-scoped 识别（本次关键修复）
     - 无覆盖时默认回退到 `~/.claude`

### P1 归零三问（本次）
1. **修复内容**
   - 修正 room-scoped 路径识别（支持相对路径）并将默认认证目录回退到 `~/.claude`。
2. **引入原因**
   - 早期实现将路径判定简化为字符串比对，未对相对路径做归一化，导致隔离目录误判。
3. **归因路径**
   - 设计层：隔离策略从“目录约束”扩展为“路径归一化”需求时未同步更新验收标准。
   - 实现层：未统一使用 `path.resolve()` 做路径判等。
   - 测试层：缺失“相对路径 room-scoped”异常用例。

### 验证证据
- 命令：`npm test -- src/tests/unit/Agent.test.ts src/tests/unit/LLMProviders.test.ts`
  - 结果：`4 passed / 33 passed`
- 命令：`npm run build:server`
  - 结果：通过

### 门禁声明（本次补充）
- **已验证场景**:
  - Given `CLAUDE_CONFIG_DIR=.data/sessions/room-1`，When Agent 解析配置目录，Then 识别为 room-scoped 并回退 `~/.claude`
  - Given `CLAUDE_CONFIG_DIR=/tmp/shared-claude-auth`，When Agent 解析配置目录，Then 保留共享目录
  - Given CLI 返回结构化错误 `result.is_error=true`，When 进程非 0 退出，Then 日志错误文案可见且可定位
- **遗留风险**:
  - 尚未执行“重启服务后，房间内 @架构师 在线端到端回归”
  - 若宿主机 `~/.claude` 无有效登录态，仍会出现 `authentication_failed`，需要运维侧完成 `claude login` 或设置 `COLONY_CLAUDE_AUTH_CONFIG_DIR`
