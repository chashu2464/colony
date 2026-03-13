// @ts-nocheck
// ── Colony: Provider Registry ────────────────────────────
// Registry for LLM providers, supporting both CLI and API implementations.

import { ILLMProvider } from './types.js';
import { Logger } from '../utils/Logger.js';

const log = new Logger('ProviderRegistry');

class DefaultProviderRegistry {
  private providers = new Map<string, ILLMProvider>();

  register(name: string, provider: ILLMProvider): void {
    if (this.providers.has(name)) {
      log.warn(`Provider "${name}" already registered. Overwriting...`);
    }
    this.providers.set(name, provider);
    log.debug(`Provider "${name}" registered.`);
  }

  get(name: string): ILLMProvider | undefined {
    return this.providers.get(name);
  }

  list(): string[] {
    return Array.from(this.providers.keys());
  }
}

export const registry = new DefaultProviderRegistry();
