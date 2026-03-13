// @ts-nocheck
// ── Colony: LLM Provider Types ───────────────────────────
// Standardized interfaces for LLM providers (CLI and API).

import type { SupportedCLI, InvokeOptions, ToolUseEvent } from '../types.js';

export interface LLMCapabilities {
  /** Provider supports streaming token output. */
  streaming: boolean;
  /** Provider supports tool usage (function calling). */
  toolUse: boolean;
  /** Provider supports file/image attachments. */
  attachments: boolean;
  /** Provider supports resuming existing sessions. */
  sessionResume: boolean;
  /** Whether the provider has the necessary authentication token for full capabilities (e.g. Claude attachments). */
  hasToken?: boolean;
}

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead?: number;
  cacheCreation?: number;
}

export interface Attachment {
  type: string;
  url: string; // Base64 or URL
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall extends ToolUseEvent {
  // Inherits name: string and input: Record<string, unknown>
  id?: string;
}

export interface LLMRequest {
  prompt: string;
  sessionId?: string;
  sessionName?: string;
  attachments?: Attachment[];
  tools?: ToolDefinition[];
  options?: InvokeOptions;
}

export interface LLMResponse {
  text: string;
  sessionId: string | null;
  tokenUsage?: TokenUsage;
  toolCalls: ToolCall[];
  raw?: any; // For provider-specific debug data
}

/**
 * Interface for all LLM providers (CLI-based or API-based).
 */
export interface ILLMProvider {
  /** Unique name of the provider (e.g., 'claude', 'gemini', 'openai'). */
  readonly name: string;
  /** Capabilities supported by this specific provider. */
  readonly capabilities: LLMCapabilities;

  /**
   * Invokes the LLM with the standardized request.
   */
  invoke(request: LLMRequest): Promise<LLMResponse>;

  /**
   * Performs a health check on the provider.
   * For CLI, it might verify the binary exists. For API, it might ping a status endpoint.
   */
  healthCheck(): Promise<boolean>;
}

export interface ProviderRegistry {
  register(name: string, provider: ILLMProvider): void;
  get(name: string): ILLMProvider | undefined;
  list(): string[];
}
