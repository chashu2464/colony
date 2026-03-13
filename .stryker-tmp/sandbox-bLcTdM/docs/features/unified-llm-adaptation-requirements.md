# Unified LLM Adaptation Layer Requirements

## 1. Background & Goals
Currently, Colony interacts with LLMs through three distinct CLI tools (Claude, Gemini, Codex). Each has its own argument structure, output format (streamed JSON), and session management logic. This logic is currently hardcoded in `CLIInvoker.ts`, making it difficult to maintain, test, and extend.

The goal is to introduce a unified abstraction layer (`ILLMProvider`) to:
- **Decouple** core logic from specific CLI/API implementations.
- **Standardize** request/response formats.
- **Enable Hot-swapping** and intelligent routing between providers.
- **Support Future APIs** (e.g., direct REST API calls to OpenAI/Anthropic/DeepSeek) and local LLMs (Ollama).

## 2. Core Requirements
- **Unified Interface**: Define a consistent interface for all LLM providers.
- **Capability Detection**: Allow providers to declare supported features (streaming, tool use, attachments).
- **Session Management**: Standardize how sessions are resumed or initialized across different providers.
- **Streaming Support**: Ensure all providers can deliver real-time token output.
- **Tool Call Standardization**: Map provider-specific tool call formats to a common Colony standard.
- **Attachment Handling**: Abstract how files/images are passed to the model.

## 3. Key Interfaces (Draft)

### ILLMProvider
```typescript
interface ILLMProvider {
  readonly name: string;
  readonly capabilities: LLMCapabilities;
  invoke(request: LLMRequest): Promise<LLMResponse>;
  healthCheck(): Promise<boolean>;
}
```

### LLMCapabilities
```typescript
interface LLMCapabilities {
  streaming: boolean;
  toolUse: boolean;
  attachments: boolean;
  sessionResume: boolean;
}
```

### LLMRequest
```typescript
interface LLMRequest {
  prompt: string;
  sessionId?: string;
  sessionName?: string;
  attachments?: Attachment[];
  tools?: ToolDefinition[];
  options?: InvokeOptions;
}
```

### LLMResponse
```typescript
interface LLMResponse {
  text: string;
  sessionId: string | null;
  tokenUsage?: TokenUsage;
  toolCalls: ToolCall[];
}
```

## 4. Implementation Strategy
1. **Types Definition**: Define core interfaces in `src/llm/types.ts`.
2. **Refactor CLIInvoker**: Break down the hardcoded `CLI_CONFIG` into separate provider implementations.
3. **Provider Registry**: Create a mechanism to register and retrieve providers by name.
4. **Router Integration**: Update `ModelRouter.ts` to use the new `ILLMProvider` interface instead of calling `CLIInvoker.invoke` directly.
