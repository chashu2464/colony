// ── Colony: Mem0 Long-Term Memory ───────────────────────
// Integrates Mem0 as the long-term memory backend.

import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { Logger } from '../utils/Logger.js';
import type { LongTermMemory, MemoryContent, MemoryMetadata } from './types.js';

const log = new Logger('Mem0LongTermMemory');

export interface Mem0Config {
    vector_store: {
        provider: string;
        config: Record<string, unknown>;
    };
    llm?: {
        provider: string;
        config: Record<string, unknown>;
    };
    embedder?: {
        provider: string;
        config: Record<string, unknown>;
    };
    graph_store?: {
        provider: string;
        config: Record<string, unknown>;
    };
}

interface Mem0Request {
    method: 'add' | 'search' | 'get_all' | 'update' | 'delete';
    params: Record<string, unknown>;
}

interface Mem0Response {
    success: boolean;
    data?: unknown;
    error?: string;
}

/**
 * Mem0-based long-term memory implementation.
 *
 * This class bridges TypeScript (Colony) with Python (Mem0) via a subprocess.
 * It provides semantic search, automatic memory extraction, and deduplication.
 */
export class Mem0LongTermMemory implements LongTermMemory {
    private pythonProcess?: ChildProcess;
    private config: Mem0Config;
    private requestId = 0;
    private initPromise?: Promise<void>;
    private pendingRequests = new Map<number, {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
    }>();

    constructor(config: Mem0Config) {
        this.config = config;
    }

    /**
     * Ensure the Mem0 bridge is initialized (lazy initialization).
     */
    private async ensureInitialized(): Promise<void> {
        if (this.pythonProcess) {
            return; // Already initialized
        }

        if (this.initPromise) {
            return this.initPromise; // Initialization in progress
        }

        this.initPromise = this.initialize();
        return this.initPromise;
    }

    /**
     * Initialize the Mem0 Python bridge.
     */
    private async initialize(): Promise<void> {
        log.info('Initializing Mem0 bridge...');

        // Get the scripts directory path
        const scriptsDir = path.join(process.cwd(), 'scripts');

        // Log the command we're about to run
        const configStr = JSON.stringify(this.config);
        log.debug(`Starting Python process with config: ${configStr.substring(0, 200)}...`);
        log.debug(`PYTHONPATH: ${scriptsDir}`);

        // Start Python subprocess running the Mem0 bridge
        this.pythonProcess = spawn('python3', [
            '-u',  // Unbuffered output
            '-m', 'mem0_bridge',
            '--config', configStr
        ], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                PYTHONPATH: scriptsDir  // Add scripts directory to Python path
            }
        });

        // Handle stdout (responses from Python)
        this.pythonProcess.stdout?.on('data', (data) => {
            this.handleResponse(data.toString());
        });

        // Handle stderr (Python logs - mostly INFO level, not actual errors)
        this.pythonProcess.stderr?.on('data', (data) => {
            const output = data.toString();
            // Log all stderr output for debugging
            log.debug('Mem0 bridge stderr:', output);
            // Only log actual errors at ERROR level
            if (output.includes('ERROR') || output.includes('Traceback') || output.includes('Exception')) {
                log.error('Mem0 bridge error:', output);
            }
        });

        // Handle process exit
        this.pythonProcess.on('exit', (code, signal) => {
            log.warn(`Mem0 bridge exited with code ${code}, signal ${signal}`);
            this.pythonProcess = undefined;
            // Reject all pending requests
            for (const [id, pending] of this.pendingRequests.entries()) {
                pending.reject(new Error(`Mem0 bridge exited with code ${code}`));
                this.pendingRequests.delete(id);
            }
        });

        // Handle process errors
        this.pythonProcess.on('error', (err) => {
            log.error('Failed to start Mem0 bridge:', err);
            throw err;
        });

        // Wait for initialization
        try {
            await this.waitForReady();
            log.info('Mem0 bridge initialized successfully');
        } catch (err) {
            log.error('Mem0 bridge initialization failed:', err);
            throw err;
        }
    }

    /**
     * Wait for the Python bridge to be ready.
     */
    private async waitForReady(): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Mem0 bridge initialization timeout'));
            }, 10000);

            const checkReady = () => {
                if (this.pythonProcess?.stdout) {
                    clearTimeout(timeout);
                    resolve();
                } else {
                    setTimeout(checkReady, 100);
                }
            };

            checkReady();
        });
    }

    /**
     * Send a request to the Python bridge.
     */
    private async sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
        if (!this.pythonProcess || !this.pythonProcess.stdin) {
            throw new Error('Mem0 bridge not initialized');
        }

        const id = ++this.requestId;
        const request: Mem0Request & { id: number } = {
            id,
            method: method as Mem0Request['method'],
            params
        };

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });

            const requestStr = JSON.stringify(request) + '\n';
            this.pythonProcess!.stdin!.write(requestStr);

            // Timeout after 60 seconds (extraction can be slow)
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`Request ${id} timeout (after 60s)`));
                }
            }, 60000);
        });
    }

    /**
     * Handle response from Python bridge.
     */
    private handleResponse(data: string): void {
        log.debug(`Received data from Python (${data.length} bytes):`, data.substring(0, 200));

        const lines = data.trim().split('\n');

        for (const line of lines) {
            if (!line.trim()) continue;

            log.debug(`Processing line: ${line.substring(0, 100)}...`);

            try {
                const response = JSON.parse(line) as Mem0Response & { id: number };
                log.debug(`Parsed response for request ${response.id}:`, response.success ? 'success' : 'error');

                const pending = this.pendingRequests.get(response.id);

                if (pending) {
                    this.pendingRequests.delete(response.id);

                    if (response.success) {
                        pending.resolve(response.data);
                    } else {
                        pending.reject(new Error(response.error || 'Unknown error'));
                    }
                } else {
                    log.warn(`No pending request found for ID ${response.id}`);
                }
            } catch (err) {
                log.debug('Failed to parse line as JSON (might be log output):', line.substring(0, 100));
            }
        }
    }

    /**
     * Store content to long-term memory.
     */
    async retain(content: MemoryContent): Promise<string> {
        await this.ensureInitialized();
        log.info('Retaining memory to Mem0...');

        const params: Record<string, unknown> = {
            messages: content.content,
            metadata: {
                ...content.metadata,
                timestamp: content.timestamp.toISOString(),
            }
        };

        // Add session identifiers
        if (content.metadata?.agentId) {
            params.agent_id = content.metadata.agentId;
        }
        if (content.metadata?.roomId) {
            params.run_id = content.metadata.roomId;
        }

        try {
            const result = await this.sendRequest('add', params) as {
                results: Array<{ id: string; memory: string; event: string }>;
            };

            if (result.results && result.results.length > 0) {
                const memoryId = result.results[0].id;
                log.info(`Memory retained: ${memoryId} (event: ${result.results[0].event})`);
                return memoryId;
            }

            // Empty results means Mem0's LLM decided there's nothing worth saving
            // This is normal behavior, not an error
            log.info('Mem0 decided not to retain this memory (no significant information)');
            return 'no-memory-extracted';
        } catch (err) {
            log.error('Failed to retain memory:', err);
            throw err;
        }
    }

    /**
     * Retrieve relevant memories based on a query.
     */
    async recall(query: string, limit?: number, filters?: import('./types.js').MemoryFilters): Promise<MemoryContent[]> {
        await this.ensureInitialized();
        log.info(`Recalling memories for query: "${query.substring(0, 50)}..."`);

        // Build Mem0 filters
        const mem0Filters: Record<string, any> = {};

        if (filters) {
            // Time window filter
            if (filters.timeWindow) {
                mem0Filters.created_at = {
                    $gte: filters.timeWindow.start.toISOString(),
                    $lte: filters.timeWindow.end.toISOString(),
                };
            }

            // Importance filter
            if (filters.importance) {
                mem0Filters.importance = {
                    $gte: filters.importance.min,
                };
            }

            // Subtype filter
            if (filters.subtypes && filters.subtypes.length > 0) {
                mem0Filters.subtype = {
                    $in: filters.subtypes,
                };
            }

            // Workflow stage filter
            if (filters.workflowStage !== undefined) {
                mem0Filters.workflowStage = filters.workflowStage;
            }
        }

        const params: Record<string, unknown> = {
            query,
            limit: limit || 5,
            rerank: true,
            filters: mem0Filters
        };

        // Add core identifiers (Mem0 requires at least one ID)
        if (filters?.agentId) {
            params.agent_id = filters.agentId;
        }
        if (filters?.roomId) {
            params.run_id = filters.roomId;
        }
        if (filters?.userId) {
            params.user_id = filters.userId;
        }

        const result = await this.sendRequest('search', params) as {
            results: Array<{
                id: string;
                memory: string;
                score: number;
                metadata: Record<string, unknown>;
            }>;
        };

        const memories = result.results.map(r => ({
            id: r.id,
            content: r.memory,
            metadata: {
                type: r.metadata.type as MemoryMetadata['type'],
                subtype: r.metadata.subtype as MemoryMetadata['subtype'],
                importance: r.metadata.importance as number,
                tags: r.metadata.tags as string[],
                agentId: r.metadata.agentId as string,
                roomId: r.metadata.roomId as string,
                participants: r.metadata.participants as string[],
                workflowStage: r.metadata.workflowStage as number,
            },
            timestamp: new Date(r.metadata.timestamp as string || Date.now())
        }));

        log.info(`Recalled ${memories.length} memories`);
        return memories;
    }

    /**
     * Generate a reflection/summary on a topic.
     */
    async reflect(topic: string): Promise<string> {
        await this.ensureInitialized();
        log.info(`Generating reflection on topic: "${topic}"`);

        // 1. Retrieve relevant memories
        const memories = await this.recall(topic, 20);

        if (memories.length === 0) {
            return `没有找到关于"${topic}"的相关记忆。`;
        }

        // 2. Build reflection prompt
        const memoriesText = memories.map((m, i) =>
            `${i + 1}. ${m.content} (重要性: ${m.metadata?.importance || 0.5})`
        ).join('\n');

        const reflectionPrompt = `
基于以下记忆，请总结关于"${topic}"的关键要点、决策和经验教训：

${memoriesText}

请提供：
1. 核心要点总结
2. 重要决策及其理由
3. 经验教训
4. 未来建议
`;

        // 3. For now, return a simple summary
        // TODO: Use LLM to generate better reflection
        const summary = `
关于"${topic}"的反思总结：

共检索到 ${memories.length} 条相关记忆。

核心要点：
${memories.slice(0, 5).map((m, i) => `${i + 1}. ${m.content}`).join('\n')}

（注：完整的LLM驱动反思功能待实现）
`;

        log.info('Reflection generated');
        return summary;
    }

    /**
     * Get all memories for a specific session.
     */
    async getAll(filters: {
        agentId?: string;
        roomId?: string;
        limit?: number;
    }): Promise<MemoryContent[]> {
        log.info('Retrieving all memories with filters:', filters);

        const params: Record<string, unknown> = {
            limit: filters.limit || 100
        };

        if (filters.agentId) {
            params.agent_id = filters.agentId;
        }
        if (filters.roomId) {
            params.run_id = filters.roomId;
        }

        const result = await this.sendRequest('get_all', params) as {
            results: Array<{
                id: string;
                memory: string;
                metadata: Record<string, unknown>;
            }>;
        };

        return result.results.map(r => ({
            id: r.id,
            content: r.memory,
            metadata: {
                type: r.metadata.type as MemoryMetadata['type'],
                importance: r.metadata.importance as number,
                tags: r.metadata.tags as string[],
                agentId: r.metadata.agentId as string,
                roomId: r.metadata.roomId as string,
            },
            timestamp: new Date(r.metadata.timestamp as string)
        }));
    }

    /**
     * Update a memory.
     */
    async update(memoryId: string, content: string): Promise<void> {
        log.info(`Updating memory: ${memoryId}`);

        await this.sendRequest('update', {
            memory_id: memoryId,
            data: content
        });

        log.info('Memory updated successfully');
    }

    /**
     * Delete a memory.
     */
    async delete(memoryId: string): Promise<void> {
        log.info(`Deleting memory: ${memoryId}`);

        await this.sendRequest('delete', {
            memory_id: memoryId
        });

        log.info('Memory deleted successfully');
    }

    /**
     * Cleanup and close the Python bridge.
     */
    async destroy(): Promise<void> {
        log.info('Destroying Mem0 bridge...');

        if (this.pythonProcess) {
            this.pythonProcess.kill();
            this.pythonProcess = undefined;
        }

        // Reject all pending requests
        for (const [id, pending] of this.pendingRequests.entries()) {
            pending.reject(new Error('Mem0 bridge destroyed'));
            this.pendingRequests.delete(id);
        }

        log.info('Mem0 bridge destroyed');
    }
}
