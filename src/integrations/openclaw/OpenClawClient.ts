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
        const rawBody = await response.text();
        const data = this.tryParseJsonBody(rawBody, response.headers.get('content-type'));
        const bodySummary = summarizeBody(rawBody);

        if (!response.ok) {
            log.warn('OpenClaw returned non-2xx status', {
                status: response.status,
                traceId: req.traceId,
                sessionKey: req.sessionKey,
                bodySummary,
            });
            throw new Error(`OpenClaw upstream error: ${response.status} [traceId=${req.traceId}] body=${bodySummary}`);
        }

        if (!data) {
            log.debug('OpenClaw accepted request with non-JSON body', {
                status: response.status,
                traceId: req.traceId,
                sessionKey: req.sessionKey,
                bodySummary,
            });
        }

        return {
            status: response.status,
            data: data ?? {},
        };
    }

    private tryParseJsonBody(rawBody: string, contentType: string | null): Record<string, unknown> | null {
        if (!rawBody.trim()) {
            return null;
        }

        const normalizedType = (contentType ?? '').toLowerCase();
        const shouldAttemptJson = normalizedType.includes('application/json') || /^[\[{]/.test(rawBody.trim());
        if (!shouldAttemptJson) {
            return null;
        }

        try {
            const parsed = JSON.parse(rawBody) as unknown;
            return isRecord(parsed) ? parsed : { value: parsed };
        } catch {
            return null;
        }
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function summarizeBody(rawBody: string): string {
    const normalized = rawBody.replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return '<empty>';
    }
    return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}
