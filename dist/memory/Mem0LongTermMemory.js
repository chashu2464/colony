"use strict";
// ── Colony: Mem0 Long-Term Memory ───────────────────────
// Integrates Mem0 as the long-term memory backend.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Mem0LongTermMemory = void 0;
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const Logger_js_1 = require("../utils/Logger.js");
const log = new Logger_js_1.Logger('Mem0LongTermMemory');
/**
 * Mem0-based long-term memory implementation.
 *
 * This class bridges TypeScript (Colony) with Python (Mem0) via a subprocess.
 * It provides semantic search, automatic memory extraction, and deduplication.
 */
class Mem0LongTermMemory {
    pythonProcess;
    config;
    requestId = 0;
    initPromise;
    pendingRequests = new Map();
    constructor(config) {
        this.config = config;
    }
    /**
     * Ensure the Mem0 bridge is initialized (lazy initialization).
     */
    async ensureInitialized() {
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
    async initialize() {
        log.info('Initializing Mem0 bridge...');
        // Get the scripts directory path
        const scriptsDir = path.join(process.cwd(), 'scripts');
        // Log the command we're about to run
        const configStr = JSON.stringify(this.config);
        log.debug(`Starting Python process with config: ${configStr.substring(0, 200)}...`);
        log.debug(`PYTHONPATH: ${scriptsDir}`);
        // Start Python subprocess running the Mem0 bridge
        this.pythonProcess = (0, child_process_1.spawn)('python3', [
            '-u', // Unbuffered output
            '-m', 'mem0_bridge',
            '--config', configStr
        ], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                PYTHONPATH: scriptsDir // Add scripts directory to Python path
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
        }
        catch (err) {
            log.error('Mem0 bridge initialization failed:', err);
            throw err;
        }
    }
    /**
     * Wait for the Python bridge to be ready.
     */
    async waitForReady() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Mem0 bridge initialization timeout'));
            }, 10000);
            const checkReady = () => {
                if (this.pythonProcess?.stdout) {
                    clearTimeout(timeout);
                    resolve();
                }
                else {
                    setTimeout(checkReady, 100);
                }
            };
            checkReady();
        });
    }
    /**
     * Send a request to the Python bridge.
     */
    async sendRequest(method, params) {
        if (!this.pythonProcess || !this.pythonProcess.stdin) {
            throw new Error('Mem0 bridge not initialized');
        }
        const id = ++this.requestId;
        const request = {
            id,
            method: method,
            params
        };
        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            const requestStr = JSON.stringify(request) + '\n';
            this.pythonProcess.stdin.write(requestStr);
            // Timeout after 30 seconds
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`Request ${id} timeout`));
                }
            }, 30000);
        });
    }
    /**
     * Handle response from Python bridge.
     */
    handleResponse(data) {
        log.debug(`Received data from Python (${data.length} bytes):`, data.substring(0, 200));
        const lines = data.trim().split('\n');
        for (const line of lines) {
            if (!line.trim())
                continue;
            log.debug(`Processing line: ${line.substring(0, 100)}...`);
            try {
                const response = JSON.parse(line);
                log.debug(`Parsed response for request ${response.id}:`, response.success ? 'success' : 'error');
                const pending = this.pendingRequests.get(response.id);
                if (pending) {
                    this.pendingRequests.delete(response.id);
                    if (response.success) {
                        pending.resolve(response.data);
                    }
                    else {
                        pending.reject(new Error(response.error || 'Unknown error'));
                    }
                }
                else {
                    log.warn(`No pending request found for ID ${response.id}`);
                }
            }
            catch (err) {
                log.debug('Failed to parse line as JSON (might be log output):', line.substring(0, 100));
            }
        }
    }
    /**
     * Store content to long-term memory.
     */
    async retain(content) {
        await this.ensureInitialized();
        log.info('Retaining memory to Mem0...');
        const params = {
            messages: content.content,
            metadata: {
                type: content.metadata?.type || 'conversation',
                importance: content.metadata?.importance || 0.5,
                tags: content.metadata?.tags || [],
                timestamp: content.timestamp.toISOString(),
                roomId: content.metadata?.roomId,
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
            const result = await this.sendRequest('add', params);
            if (result.results && result.results.length > 0) {
                const memoryId = result.results[0].id;
                log.info(`Memory retained: ${memoryId} (event: ${result.results[0].event})`);
                return memoryId;
            }
            // Empty results means Mem0's LLM decided there's nothing worth saving
            // This is normal behavior, not an error
            log.info('Mem0 decided not to retain this memory (no significant information)');
            return 'no-memory-extracted';
        }
        catch (err) {
            log.error('Failed to retain memory:', err);
            throw err;
        }
    }
    /**
     * Retrieve relevant memories based on a query.
     */
    async recall(query, limit, filters) {
        await this.ensureInitialized();
        log.info(`Recalling memories for query: "${query.substring(0, 50)}..."`);
        const params = {
            query,
            limit: limit || 5,
            rerank: true
        };
        // Add filters (Mem0 requires at least one ID)
        if (filters?.agentId) {
            params.agent_id = filters.agentId;
        }
        if (filters?.roomId) {
            params.run_id = filters.roomId;
        }
        if (filters?.userId) {
            params.user_id = filters.userId;
        }
        const result = await this.sendRequest('search', params);
        const memories = result.results.map(r => ({
            id: r.id,
            content: r.memory,
            metadata: {
                type: r.metadata.type,
                importance: r.metadata.importance,
                tags: r.metadata.tags,
                agentId: r.metadata.agentId,
                roomId: r.metadata.roomId,
            },
            timestamp: new Date(r.metadata.timestamp)
        }));
        log.info(`Recalled ${memories.length} memories`);
        return memories;
    }
    /**
     * Generate a reflection/summary on a topic.
     */
    async reflect(topic) {
        await this.ensureInitialized();
        log.info(`Generating reflection on topic: "${topic}"`);
        // 1. Retrieve relevant memories
        const memories = await this.recall(topic, 20);
        if (memories.length === 0) {
            return `没有找到关于"${topic}"的相关记忆。`;
        }
        // 2. Build reflection prompt
        const memoriesText = memories.map((m, i) => `${i + 1}. ${m.content} (重要性: ${m.metadata?.importance || 0.5})`).join('\n');
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
    async getAll(filters) {
        log.info('Retrieving all memories with filters:', filters);
        const params = {
            limit: filters.limit || 100
        };
        if (filters.agentId) {
            params.agent_id = filters.agentId;
        }
        if (filters.roomId) {
            params.run_id = filters.roomId;
        }
        const result = await this.sendRequest('get_all', params);
        return result.results.map(r => ({
            id: r.id,
            content: r.memory,
            metadata: {
                type: r.metadata.type,
                importance: r.metadata.importance,
                tags: r.metadata.tags,
                agentId: r.metadata.agentId,
                roomId: r.metadata.roomId,
            },
            timestamp: new Date(r.metadata.timestamp)
        }));
    }
    /**
     * Update a memory.
     */
    async update(memoryId, content) {
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
    async delete(memoryId) {
        log.info(`Deleting memory: ${memoryId}`);
        await this.sendRequest('delete', {
            memory_id: memoryId
        });
        log.info('Memory deleted successfully');
    }
    /**
     * Cleanup and close the Python bridge.
     */
    async destroy() {
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
exports.Mem0LongTermMemory = Mem0LongTermMemory;
//# sourceMappingURL=Mem0LongTermMemory.js.map