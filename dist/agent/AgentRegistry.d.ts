import { Agent } from './Agent.js';
import { ModelRouter } from '../llm/ModelRouter.js';
import { ContextAssembler } from '../memory/ContextAssembler.js';
import { ShortTermMemory } from '../memory/ShortTermMemory.js';
import type { AgentConfig, AgentStatus } from '../types.js';
export declare class AgentRegistry {
    private agents;
    private modelRouter;
    private contextAssembler;
    private shortTermMemory;
    private skillsDir;
    constructor(modelRouter: ModelRouter, contextAssembler: ContextAssembler, shortTermMemory: ShortTermMemory, skillsDir: string);
    /**
     * Create and register an agent from a config object.
     */
    createAgent(config: AgentConfig): Agent;
    /**
     * Load agents from a config directory.
     */
    loadFromDirectory(dirPath: string): Agent[];
    /**
     * Load a single agent from a YAML file.
     */
    loadFromFile(filePath: string): Agent;
    /**
     * Get an agent by ID.
     */
    get(id: string): Agent | undefined;
    /**
     * Get all registered agents.
     */
    getAll(): Agent[];
    /**
     * Get a summary of all agents and their status.
     */
    getStatusSummary(): Array<{
        id: string;
        name: string;
        status: AgentStatus;
        model: string;
    }>;
    /**
     * Remove an agent.
     */
    remove(id: string): boolean;
}
