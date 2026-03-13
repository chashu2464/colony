// @ts-nocheck
// ── Colony: Agent Registry ───────────────────────────────
// Manages all active agents, creates agents from configs.

import { Logger } from '../utils/Logger.js';
import { Agent } from './Agent.js';
import { loadAllAgentConfigs, loadAgentConfig } from './AgentConfig.js';
import { ModelRouter } from '../llm/ModelRouter.js';
import { ContextAssembler } from '../memory/ContextAssembler.js';
import { ShortTermMemory } from '../memory/ShortTermMemory.js';
import { ChatRoomManager } from '../conversation/ChatRoomManager.js'; // Added import
import { SkillManager } from './skills/SkillManager.js';
import { verifyCLI } from '../llm/CLIInvoker.js';
import type { AgentConfig, AgentStatus, SupportedCLI } from '../types.js';

const log = new Logger('AgentRegistry');

export class AgentRegistry {
    private agents = new Map<string, Agent>();
    private modelRouter: ModelRouter;
    private contextAssembler: ContextAssembler;
    private shortTermMemory: ShortTermMemory;
    private chatRoomManager: ChatRoomManager;
    private skillManager: SkillManager;

    constructor(
        modelRouter: ModelRouter,
        contextAssembler: ContextAssembler,
        shortTermMemory: ShortTermMemory,
        chatRoomManager: ChatRoomManager,
        skillManager: SkillManager
    ) {
        this.modelRouter = modelRouter;
        this.contextAssembler = contextAssembler;
        this.shortTermMemory = shortTermMemory;
        this.chatRoomManager = chatRoomManager;
        this.skillManager = skillManager;
    }

    /**
     * Create and register an agent from a config object.
     */
    createAgent(config: AgentConfig): Agent {
        if (this.agents.has(config.id)) {
            log.warn(`Agent "${config.id}" already exists — replacing`);
        }
        const agent = new Agent(
            config,
            this.modelRouter,
            this.contextAssembler,
            this.shortTermMemory,
            this.chatRoomManager,
            this.skillManager
        );
        this.agents.set(config.id, agent);
        log.info(`Created agent: ${config.id} (${config.name})`);
        return agent;
    }

    /**
     * Load agents from a config directory.
     */
    loadFromDirectory(dirPath: string): Agent[] {
        const configs = loadAllAgentConfigs(dirPath);
        return configs.map(c => this.createAgent(c));
    }

    /**
     * Load a single agent from a YAML file.
     */
    loadFromFile(filePath: string): Agent {
        const config = loadAgentConfig(filePath);
        return this.createAgent(config);
    }

    /**
     * Get an agent by ID.
     */
    get(id: string): Agent | undefined {
        return this.agents.get(id);
    }

    /**
     * Get an agent by ID or name (case-insensitive).
     */
    getByIdOrName(idOrName: string): Agent | undefined {
        const byId = this.get(idOrName);
        if (byId) return byId;

        const target = idOrName.toLowerCase();
        return this.getAll().find(a => a.name.toLowerCase() === target || a.id.toLowerCase() === target);
    }

    /**
     * Get all registered agents.
     */
    getAll(): Agent[] {
        return Array.from(this.agents.values());
    }

    /**
     * Get a summary of all agents and their status.
     */
    getStatusSummary(): Array<{ id: string; name: string; description?: string; status: AgentStatus; model: string }> {
        return this.getAll().map(a => ({
            id: a.id,
            name: a.name,
            description: a.config.description,
            status: a.getStatus(),
            model: a.config.model.primary,
        }));
    }

    /**
     * Verify the health of the primary model for all registered agents.
     */
    async verifyAllAgents(): Promise<Record<string, boolean>> {
        const agents = this.getAll();
        
        // Find unique models to verify (to avoid redundant checks)
        const uniqueModels = Array.from(new Set(agents.map(a => a.config.model.primary)));
        const modelHealth: Record<string, boolean> = {};
        
        log.info(`Health check: Verifying unique models: ${uniqueModels.join(', ')}`);
        
        // Run health checks in parallel
        const results = await Promise.all(uniqueModels.map(m => verifyCLI(m)));
        uniqueModels.forEach((m, i) => {
            modelHealth[m] = results[i];
        });
        
        // Map back to agents
        const agentHealth: Record<string, boolean> = {};
        for (const agent of agents) {
            const healthy = modelHealth[agent.config.model.primary];
            agentHealth[agent.id] = healthy;
            if (!healthy) {
                log.warn(`Health check: Agent "${agent.id}" primary model "${agent.config.model.primary}" is NOT healthy.`);
            }
        }
        
        return agentHealth;
    }

    /**
     * Remove an agent.
     */
    remove(id: string): boolean {
        return this.agents.delete(id);
    }
}
