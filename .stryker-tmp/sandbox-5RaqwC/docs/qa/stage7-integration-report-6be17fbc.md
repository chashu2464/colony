# Stage 7 Integration Testing Report

- Task: `unified-llm-adaptation-layer`
- Task ID: `6be17fbc`
- Stage: `7 - Integration Testing`
- QA Role: `qa_lead` (independent review)
- Date: `2026-03-12`

## Scope
Validate Phase 2 provider-based refactor for:
- Real CLI invocation (`claude`, `gemini`, `codex`)
- Session resume behavior
- Attachment path behavior
- Concurrency limiter behavior
- Error-path behavior (unknown provider, aborted signal)
- Security architecture review (authentication, authorization, data protection, communication)

## Test Evidence (Executed)

### 1) Build & unit regression
- Command: `npm run build:server`
- Result: PASS
- Command: `npm run test -- src/tests/unit/LLMProviders.test.ts`
- Result: PASS (4/4)

### 2) Real CLI smoke (integration)
- Command: invoke each provider with prompt `Reply exactly: QA_OK`
- Result:
  - `claude`: PASS, returned `QA_OK`
  - `gemini`: PASS, returned `QA_OK`
  - `codex`: PASS, returned `QA_OK`

### 3) Session resume
- Case: same `sessionName=qa_stage7_session` called twice on `claude`
- Result: PASS
  - Call#1 sessionId: `c8740c22-8101-47b9-808f-774915366e21`
  - Call#2 sessionId: `c8740c22-8101-47b9-808f-774915366e21` (same)

### 4) Attachments
- `codex` with base64 image attachment: PASS (`ATTACH_OK`)
- `gemini` with attachment: PASS (graceful skip warning + normal response)
- `claude` with attachment: FAIL
  - Error: `Session token required for file downloads. CLAUDE_CODE_SESSION_ACCESS_TOKEN must be set.`

### 5) Concurrency limiter
- Env: `COLONY_MAX_CLI_CONCURRENCY=1`
- Baseline single invoke (`gemini`): `10853 ms`
- Two concurrent invokes (`gemini`): `23473 ms`
- Ratio: `2.16x` (queueing observed)
- Result: PASS

### 6) Error path
- Unknown provider `invoke('notreal', ...)`: expected error observed
- Aborted signal before slot acquisition: expected abort error observed
- Result: PASS

### 7) Re-test round (after developer fixes)
- Command: `npm run build:server`
- Result: PASS
- Command: `npm run test -- src/tests/unit/LLMProviders.test.ts`
- Result: PASS (8/8)
- Command: real invocation regression for safety toggles
- Result:
  - `claude` + attachment without token: PASS (fails fast with clear preflight error)
  - `codex` default mode: PASS (normal response without forcing dangerous flag)
  - `codex` opt-in bypass mode: PASS (works when explicitly enabled)
  - `claude` default mode: PASS
  - `claude` opt-in skip-permissions mode: PASS
- Command: controlled concurrency reproduction (provider singleton + queued invocations with mixed `security` options)
- Result: FAIL (security option cross-request contamination reproduced)

### 8) Re-test round #2 (after BUG-SEC-002 claim)
- Command: `npm run build:server`
- Result: FAIL
  - `src/llm/BaseCLIProvider.ts(71,102): error TS2304: Cannot find name 'InvokeOptions'.`
- Command: `npm run test -- src/tests/unit/LLMProviders.test.ts`
- Result: PASS (9/9)
- QA verdict:
  - Stage 7 remains blocked because TypeScript compile gate fails.
  - Unit tests passing does not override integration compile failure.

### 9) Re-test round #3 (after BUG-INT-002 fix)
- Command: `npm run build:server`
- Result: PASS
- Command: `npm run test -- src/tests/unit/LLMProviders.test.ts`
- Result: PASS (9/9)
- Command: controlled concurrency reproduction (same provider singleton, mixed security options)
- Result: PASS
  - Call B (default options) no longer includes dangerous flag
  - Call C (explicit bypass) includes dangerous flag as expected
- Command: real CLI smoke regression (`claude/gemini/codex` with `invoke`)
- Result: PASS (`QA_SMOKE` returned by all three providers)
- QA verdict:
  - BUG-INT-002 fixed
  - BUG-SEC-002 fixed
  - Stage 7 gate can be approved

## Given-When-Then Test Cases

### Normal flow
1. Given `claude/gemini/codex` executables are available in PATH
   When calling `invoke(provider, "Reply exactly: QA_OK")`
   Then each provider returns non-empty text and exits without `InvokeError`

2. Given existing session mapping for `sessionName`
   When invoking same provider twice with same `sessionName`
   Then second invocation resumes prior sessionId

### Exception flow
3. Given provider key not registered
   When calling `invoke('notreal', ...)`
   Then system raises clear provider-not-registered error

4. Given `AbortSignal` already aborted
   When invocation attempts to acquire CLI slot
   Then call fails fast with abort error and no hanging process

### Boundary conditions
5. Given `COLONY_MAX_CLI_CONCURRENCY=1`
   When two requests are fired concurrently
   Then second request is queued and total duration is approximately serialized

6. Given provider does not support attachments (`gemini`)
   When attachments are supplied
   Then request completes without crash and logs skip warning

## Defects

### BUG-INT-001 (P1) - Claude attachment flow unavailable in integration env
- Severity: P1
- File/Area: `src/llm/providers/ClaudeProvider.ts`, integration runtime config
- Repro steps:
  1. Prepare base64 image attachment (data URL)
  2. Call `invoke('claude', 'Reply exactly: ATTACH_OK', { attachments: [...] })`
  3. Observe process exits with code 1
- Actual:
  - `Error: Session token required for file downloads. CLAUDE_CODE_SESSION_ACCESS_TOKEN must be set.`
- Expected:
  - Claude provider should handle attachment invocation successfully in Stage 7 integration scope

P0/P1 triad:
- 修复内容: 在运行环境注入并校验 `CLAUDE_CODE_SESSION_ACCESS_TOKEN`，并在 provider 启动前做前置能力探测/降级提示
- 引入原因: 适配层重构后覆盖了附件路径，但环境前置条件未纳入集成门禁
- 归因路径: Stage 6 开发验证关注了通用调用成功，未对 Claude 附件专属认证依赖建立强制 CI 检查
- Re-test status: FIXED (now fails fast with explicit preflight error, no downstream CLI opaque failure)

### BUG-SEC-001 (P1) - High-risk runtime flags bypass guardrails
- Severity: P1 (security)
- File/Area:
  - `src/llm/providers/ClaudeProvider.ts` line with `--dangerously-skip-permissions`
  - `src/llm/providers/CodexProvider.ts` line with `--dangerously-bypass-approvals-and-sandbox`
- Risk:
  - Authorization/sandbox controls are force-disabled by default for every invocation, expanding blast radius if prompt/tool chain is abused
- Recommendation:
  - Gate dangerous flags behind explicit env toggle (`COLONY_ALLOW_DANGEROUS_CLI_FLAGS=true`)
  - Default to safe mode in production
  - Add audit log field marking dangerous-mode invocation

P0/P1 triad:
- 修复内容: 将危险参数改为可配置且默认关闭；生产环境强制拒绝开启
- 引入原因: 为提升开发效率将“快速执行”参数固化进 provider 默认参数
- 归因路径: 缺少安全架构门禁（认证/授权策略）导致默认策略偏向便利而非最小权限
- Re-test status: PARTIALLY FIXED (default dangerous flags are off, but see BUG-SEC-002 for concurrency contamination)
- Re-test status: FIXED (default-off and request-level isolation validated in re-test #3)

### BUG-SEC-002 (P1) - Request-level security options are shared across concurrent invocations
- Severity: P1 (security + correctness)
- File/Area:
  - `src/llm/providers/ClaudeProvider.ts` (`currentOptions` mutable instance field + overridden `invoke`)
  - `src/llm/providers/CodexProvider.ts` (`currentOptions` mutable instance field + overridden `invoke`)
- Repro steps:
  1. Set `COLONY_MAX_CLI_CONCURRENCY=1`
  2. Use one provider singleton instance (`new CodexProvider()`), start three concurrent invokes in order:
     - A: `{ options: {} }` (long-running to occupy slot)
     - B: `{ options: {} }` (queued)
     - C: `{ options: { security: { bypassSandbox: true } } }` (queued, starts after B submission)
  3. Observe second call B argument list unexpectedly includes dangerous flag.
- Actual:
  - B (which did not request bypass) still receives `--dangerously-bypass-approvals-and-sandbox`
- Expected:
  - Security flags must be strictly request-scoped and isolated per invocation
- Risk:
  - Privilege escalation across concurrent requests; one caller can unintentionally/indirectly relax another call's sandbox policy

P0/P1 triad:
- 修复内容: 移除 provider 实例级 `currentOptions` 共享状态；将 `options` 显式传入 `buildArgs` 或改为纯函数参数传递
- 引入原因: 为了最小改动复用 BaseCLIProvider 抽象，采用了“实例字段暂存请求选项”策略
- 归因路径: 并发模型未纳入接口设计约束，缺少“同实例并发调用隔离”测试用例
- Re-test status: FIXED (explicit request-scoped options in `buildArgs(..., options)` verified under concurrency)

## Security Architecture Review

### Authentication
- Positive: provider existence and binary availability checked
- Positive: Claude attachment token preflight check now fails fast with explicit guidance

### Authorization
- Positive: dangerous bypass flags are no longer default-enabled
- Positive: request-level security policy isolation validated under concurrent invocation

### Data protection
- Positive: temporary attachment files are cleaned in `finally`
- Gap: no file size quota / input size guard for base64 attachments (potential disk/memory DoS)

### Communication/Process security
- Positive: process stdout parsed line-by-line JSON; stderr captured for diagnostics
- Gap: `which ${this.name}` via shell string could become injection-prone if provider names become externally extensible in future

## Gate Statement (Stage 7)
Gate status: **APPROVED**

Validated scenarios:
- Real invocation for all 3 providers (no attachment)
- Session resume
- Concurrency queueing
- Exception paths (unknown provider, abort)
- Attachment behavior for codex/gemini

Blocking risks:
- None

Residual non-blocking risks:
- No explicit attachment payload size limits (DoS exposure)
- `which ${this.name}` shell construction should remain bounded to trusted provider names

Decision:
- Stage 7 passed. Ready to advance to Stage 8 (Go-Live Review).
