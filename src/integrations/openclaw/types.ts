export interface OpenClawConfig {
    enabled: boolean;
    baseUrl: string;
    outboundPath: string;
    apiKey: string;
    agentId: string;
    timeoutMs: number;
    webhookSecret: string;
    allowedSkewMs: number;
    roomIds: Set<string>;
}

export interface OpenClawSessionMapping {
    sessionKey: string;
    roomId: string;
    traceId: string;
    externalAgentId: string;
    createdAt: number;
    updatedAt: number;
}

export interface OpenClawInboundEvent {
    eventId: string;
    sessionKey: string;
    traceId: string;
    agentId?: string;
    eventType: 'run.started' | 'message.completed' | 'run.failed' | string;
    timestamp: string;
    payload: Record<string, unknown>;
}
