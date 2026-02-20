import type { LongTermMemory, MemoryContent } from './types.js';
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
/**
 * Mem0-based long-term memory implementation.
 *
 * This class bridges TypeScript (Colony) with Python (Mem0) via a subprocess.
 * It provides semantic search, automatic memory extraction, and deduplication.
 */
export declare class Mem0LongTermMemory implements LongTermMemory {
    private pythonProcess?;
    private config;
    private requestId;
    private initPromise?;
    private pendingRequests;
    constructor(config: Mem0Config);
    /**
     * Ensure the Mem0 bridge is initialized (lazy initialization).
     */
    private ensureInitialized;
    /**
     * Initialize the Mem0 Python bridge.
     */
    private initialize;
    /**
     * Wait for the Python bridge to be ready.
     */
    private waitForReady;
    /**
     * Send a request to the Python bridge.
     */
    private sendRequest;
    /**
     * Handle response from Python bridge.
     */
    private handleResponse;
    /**
     * Store content to long-term memory.
     */
    retain(content: MemoryContent): Promise<string>;
    /**
     * Retrieve relevant memories based on a query.
     */
    recall(query: string, limit?: number, filters?: import('./types.js').MemoryFilters): Promise<MemoryContent[]>;
    /**
     * Generate a reflection/summary on a topic.
     */
    reflect(topic: string): Promise<string>;
    /**
     * Get all memories for a specific session.
     */
    getAll(filters: {
        agentId?: string;
        roomId?: string;
        limit?: number;
    }): Promise<MemoryContent[]>;
    /**
     * Update a memory.
     */
    update(memoryId: string, content: string): Promise<void>;
    /**
     * Delete a memory.
     */
    delete(memoryId: string): Promise<void>;
    /**
     * Cleanup and close the Python bridge.
     */
    destroy(): Promise<void>;
}
