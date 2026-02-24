// ── Colony: Agent Config Loader ──────────────────────────
// Loads agent configurations from YAML files.

import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';
import { Logger } from '../utils/Logger.js';
import type { AgentConfig, SupportedCLI } from '../types.js';

const log = new Logger('AgentConfig');

const VALID_CLIS: SupportedCLI[] = ['claude', 'gemini', 'codex'];

/**
 * Load a single agent config from a YAML file.
 */
export function loadAgentConfig(filePath: string): AgentConfig {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = YAML.parse(raw) as Record<string, unknown>;

    // Validate required fields
    if (!parsed.id || typeof parsed.id !== 'string') {
        throw new Error(`Agent config "${filePath}": missing or invalid "id"`);
    }
    if (!parsed.name || typeof parsed.name !== 'string') {
        throw new Error(`Agent config "${filePath}": missing or invalid "name"`);
    }
    if (!parsed.personality || typeof parsed.personality !== 'string') {
        throw new Error(`Agent config "${filePath}": missing or invalid "personality"`);
    }

    const model = parsed.model as Record<string, unknown> | undefined;
    if (!model || !model.primary) {
        throw new Error(`Agent config "${filePath}": missing "model.primary"`);
    }

    const primary = model.primary as SupportedCLI;
    if (!VALID_CLIS.includes(primary)) {
        throw new Error(`Agent config "${filePath}": invalid primary model "${primary}"`);
    }

    const fallback = (model.fallback as SupportedCLI[] | undefined)?.filter(
        (f) => VALID_CLIS.includes(f)
    );

    const config: AgentConfig = {
        id: parsed.id as string,
        name: parsed.name as string,
        description: parsed.description as string | undefined,
        model: { primary, fallback },
        personality: (parsed.personality as string).trim(),
        rules: parsed.rules as string[] | undefined,
        isDefault: (parsed.is_default as boolean | undefined) ?? false,
    };

    log.info(`Loaded agent config: ${config.id} (${config.name})`);
    return config;
}

/**
 * Load all agent configs from a directory.
 */
export function loadAllAgentConfigs(dirPath: string): AgentConfig[] {
    if (!fs.existsSync(dirPath)) {
        log.warn(`Agent config directory not found: ${dirPath}`);
        return [];
    }

    const files = fs.readdirSync(dirPath).filter(f =>
        f.endsWith('.yaml') || f.endsWith('.yml')
    );

    return files.map(f => loadAgentConfig(path.join(dirPath, f)));
}
