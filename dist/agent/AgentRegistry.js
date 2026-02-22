"use strict";
// ── Colony: Agent Registry ───────────────────────────────
// Manages all active agents, creates agents from configs.
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentRegistry = void 0;
const Logger_js_1 = require("../utils/Logger.js");
const Agent_js_1 = require("./Agent.js");
const AgentConfig_js_1 = require("./AgentConfig.js");
const log = new Logger_js_1.Logger('AgentRegistry');
class AgentRegistry {
    agents = new Map();
    modelRouter;
    contextAssembler;
    shortTermMemory;
    chatRoomManager;
    constructor(modelRouter, contextAssembler, shortTermMemory, chatRoomManager) {
        this.modelRouter = modelRouter;
        this.contextAssembler = contextAssembler;
        this.shortTermMemory = shortTermMemory;
        this.chatRoomManager = chatRoomManager;
    }
    /**
     * Create and register an agent from a config object.
     */
    createAgent(config) {
        if (this.agents.has(config.id)) {
            log.warn(`Agent "${config.id}" already exists — replacing`);
        }
        const agent = new Agent_js_1.Agent(config, this.modelRouter, this.contextAssembler, this.shortTermMemory, this.chatRoomManager);
        this.agents.set(config.id, agent);
        log.info(`Created agent: ${config.id} (${config.name})`);
        return agent;
    }
    /**
     * Load agents from a config directory.
     */
    loadFromDirectory(dirPath) {
        const configs = (0, AgentConfig_js_1.loadAllAgentConfigs)(dirPath);
        return configs.map(c => this.createAgent(c));
    }
    /**
     * Load a single agent from a YAML file.
     */
    loadFromFile(filePath) {
        const config = (0, AgentConfig_js_1.loadAgentConfig)(filePath);
        return this.createAgent(config);
    }
    /**
     * Get an agent by ID.
     */
    get(id) {
        return this.agents.get(id);
    }
    /**
     * Get all registered agents.
     */
    getAll() {
        return Array.from(this.agents.values());
    }
    /**
     * Get a summary of all agents and their status.
     */
    getStatusSummary() {
        return this.getAll().map(a => ({
            id: a.id,
            name: a.name,
            status: a.getStatus(),
            model: a.config.model.primary,
        }));
    }
    /**
     * Remove an agent.
     */
    remove(id) {
        return this.agents.delete(id);
    }
}
exports.AgentRegistry = AgentRegistry;
//# sourceMappingURL=AgentRegistry.js.map