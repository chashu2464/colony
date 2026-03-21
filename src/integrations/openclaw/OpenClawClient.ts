import type { OpenClawConfig } from './types.js';
import { Logger } from '../../utils/Logger.js';

const log = new Logger('OpenClawClient');

export interface OpenClawOutboundRequest {
    sessionKey: string;
    traceId: string;
    senderId: string;
    content: string;
}

export interface OpenClawOutboundResponse {
    status: number;
    data: Record<string, unknown>;
}

export class OpenClawClient {
    constructor(private readonly config: OpenClawConfig) {}

    async sendMessage(req: OpenClawOutboundRequest): Promise<OpenClawOutboundResponse> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

        try {
            const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/v1/responses`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.config.apiKey}`,
                },
                body: JSON.stringify({
                    agent_id: this.config.agentId,
                    session_key: req.sessionKey,
                    trace_id: req.traceId,
                    input: req.content,
                    metadata: { sender_id: req.senderId },
                }),
                signal: controller.signal,
            });
            return this.parseResponse(response, req);
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                throw new Error(`OpenClaw timeout after ${this.config.timeoutMs}ms [traceId=${req.traceId}]`);
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    private async parseResponse(response: Response, req: OpenClawOutboundRequest): Promise<OpenClawOutboundResponse> {
        let data: Record<string, unknown>;
        try {
            data = (await response.json()) as Record<string, unknown>;
        } catch {
            throw new Error(`OpenClaw invalid JSON response [traceId=${req.traceId}]`);
        }

        if (!response.ok) {
            log.warn('OpenClaw returned non-2xx status', {
                status: response.status,
                traceId: req.traceId,
                sessionKey: req.sessionKey,
            });
            throw new Error(`OpenClaw upstream error: ${response.status} [traceId=${req.traceId}]`);
        }

        return {
            status: response.status,
            data,
        };
    }
}
