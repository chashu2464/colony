import type { AgentConfig } from '../types.js';
import type { ShortTermMemory } from './ShortTermMemory.js';
import type { LongTermMemory } from './types.js';
import type { SkillManager } from '../agent/skills/SkillManager.js';
import type { ContextAssembler as IContextAssembler, AssembleOptions, TokenBudget } from './types.js';
export declare class ContextAssembler implements IContextAssembler {
    private agentConfigs;
    private shortTermMemory;
    private longTermMemory?;
    private skillManagers;
    constructor(shortTermMemory: ShortTermMemory, longTermMemory?: LongTermMemory);
    /**
     * Register an agent's configuration.
     */
    registerAgent(config: AgentConfig, skillManager: SkillManager): void;
    /**
     * Assemble a complete prompt for an agent.
     */
    assemble(options: AssembleOptions): Promise<string>;
    private buildIdentitySection;
    private buildRulesSection;
    private buildParticipantsSection;
    private buildGuidelinesSection;
    private buildHistorySection;
    private buildCurrentMessageSection;
    private buildLongTermSection;
    /**
     * Apply token budget constraints to sections.
     * Strategy:
     * 1. Always include highest priority sections (identity, current message)
     * 2. Include other sections in priority order until budget is exhausted
     * 3. Truncate low-priority sections if needed
     */
    private applyTokenBudget;
    /**
     * Truncate a section to fit within token limit.
     */
    private truncateSection;
    /**
     * Calculate recommended token budget allocation.
     */
    calculateBudget(totalBudget: number): TokenBudget;
}
