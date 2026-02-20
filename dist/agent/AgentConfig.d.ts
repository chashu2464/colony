import type { AgentConfig } from '../types.js';
/**
 * Load a single agent config from a YAML file.
 */
export declare function loadAgentConfig(filePath: string): AgentConfig;
/**
 * Load all agent configs from a directory.
 */
export declare function loadAllAgentConfigs(dirPath: string): AgentConfig[];
