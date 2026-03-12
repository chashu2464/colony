import { registry } from './ProviderRegistry.js';
import { ClaudeProvider } from './providers/ClaudeProvider.js';
import { GeminiProvider } from './providers/GeminiProvider.js';
import { CodexProvider } from './providers/CodexProvider.js';

// Register built-in providers
registry.register('claude', new ClaudeProvider());
registry.register('gemini', new GeminiProvider());
registry.register('codex', new CodexProvider());

export * from './types.js';
export { registry } from './ProviderRegistry.js';
export { BaseCLIProvider } from './BaseCLIProvider.js';
