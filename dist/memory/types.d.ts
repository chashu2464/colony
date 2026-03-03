import type { Message, Participant } from '../types.js';
export interface ContextIndex {
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
    parseCode(filePath: string, language: string): Promise<CodeStructure>;
    addEntity(entity: Entity): Promise<void>;
    addRelation(from: string, to: string, type: RelationType): Promise<void>;
    query(pattern: GraphPattern): Promise<Entity[]>;
}
export interface CodeStructure {
    filePath: string;
    language: string;
    functions: FunctionInfo[];
    classes: ClassInfo[];
    imports: string[];
    exports: string[];
}
export interface FunctionInfo {
    name: string;
    line: number;
    params: string[];
    returnType?: string;
    docstring?: string;
}
export interface ClassInfo {
    name: string;
    line: number;
    methods: FunctionInfo[];
    properties: string[];
}
export interface Entity {
    id: string;
    type: EntityType;
    properties: Record<string, unknown>;
}
export type EntityType = 'agent' | 'message' | 'task' | 'file' | 'function' | 'decision';
export type RelationType = 'sent_by' | 'replied_to' | 'mentions' | 'assigned_to' | 'depends_on' | 'implements' | 'calls';
export interface GraphPattern {
    entityType?: EntityType;
    relations?: {
        type: RelationType;
        direction: 'in' | 'out';
    }[];
    properties?: Record<string, unknown>;
}
export interface ShortTermMemory {
    add(roomId: string, message: Message): void;
    get(roomId: string, limit?: number): Message[];
    getAll(roomId: string): Message[];
    compress(roomId: string): Promise<void>;
    markImportant(messageId: string): void;
    clear(roomId: string): void;
    getTokenCount(roomId: string): number;
}
export interface LongTermMemory {
    retain(content: MemoryContent): Promise<string>;
    recall(query: string, limit?: number, filters?: MemoryFilters): Promise<MemoryContent[]>;
    reflect(topic: string): Promise<string>;
}
export interface MemoryFilters {
    agentId?: string;
    roomId?: string;
    userId?: string;
    type?: 'conversation' | 'decision' | 'code' | 'knowledge';
}
export interface MemoryContent {
    id?: string;
    content: string;
    context?: Message;
    metadata?: MemoryMetadata;
    timestamp: Date;
}
export interface MemoryMetadata {
    type?: 'conversation' | 'decision' | 'code' | 'knowledge';
    importance?: number;
    tags?: string[];
    agentId?: string;
    roomId?: string;
}
export interface ContextLineage {
    track(messageId: string, parentId?: string): void;
    getAncestors(messageId: string): Message[];
    getDescendants(messageId: string): Message[];
    getLineage(messageId: string): Message[];
}
export interface ContextAssembler {
    assemble(options: AssembleOptions): Promise<string>;
}
export interface AssembleOptions {
    agentId: string;
    roomId: string;
    currentMessage: Message;
    tokenBudget: number;
    includeHistory?: boolean;
    includeLongTerm?: boolean;
    includeWorkflow?: boolean;
    chatRoom: any;
}
export interface TokenBudget {
    total: number;
    fixed: number;
    shortTerm: number;
    longTerm: number;
    reserved: number;
}
export interface PromptSection {
    name: string;
    content: string;
    priority: number;
    tokenCount: number;
}
export interface ContextScheduler {
    setPolicy(roomId: string, policy: SharingPolicy): void;
    getPolicy(roomId: string): SharingPolicy;
    getSharedMemory(agentId: string, roomId: string): Message[];
    exportSession(roomId: string): Promise<SessionSnapshot>;
    importSession(snapshot: SessionSnapshot, newRoomId: string): Promise<void>;
    archiveSession(roomId: string): Promise<void>;
    indexToLongTerm(roomId: string): Promise<void>;
    cleanup(olderThan: Date): Promise<void>;
}
export interface SharingPolicy {
    mode: 'isolated' | 'shared' | 'selective';
    rules?: SharingRule[];
}
export interface SharingRule {
    from: string;
    to: string[];
    scope: MemoryScope;
}
export type MemoryScope = 'all' | 'decisions' | 'code_changes' | 'tasks';
export interface SessionSnapshot {
    roomId: string;
    summary: string;
    keyDecisions: Message[];
    participants: Participant[];
    createdAt: Date;
    archivedAt: Date;
}
export interface MemoryLifecycleStage {
    stage: 'active' | 'archived' | 'indexed' | 'expired';
    timestamp: Date;
}
export interface MemoryConfig {
    shortTerm: ShortTermConfig;
    longTerm: LongTermConfig;
    scheduling: SchedulingConfig;
}
export interface ShortTermConfig {
    windowSize: number;
    maxTokens: number;
    compressionThreshold: number;
}
export interface LongTermConfig {
    provider: 'hindsight' | 'custom';
    endpoint: string;
    embeddingModel: string;
    vectorDb: 'qdrant' | 'milvus' | 'chroma';
}
export interface SchedulingConfig {
    defaultPolicy: 'isolated' | 'shared' | 'selective';
    archiveAfterDays: number;
    cleanupAfterDays: number;
}
export interface MemoryMetrics {
    shortTerm: {
        messageCount: number;
        tokenCount: number;
        compressionRatio: number;
    };
    longTerm: {
        entryCount: number;
        vectorCount: number;
        storageSize: number;
    };
    retrieval: {
        avgLatencyMs: number;
        cacheHitRate: number;
    };
    tokenBudget: {
        utilization: number;
        overflow: number;
    };
}
