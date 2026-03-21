import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenClawClient } from '../../../integrations/openclaw/OpenClawClient.js';
import type { OpenClawConfig } from '../../../integrations/openclaw/types.js';

const config: OpenClawConfig = {
    enabled: true,
    baseUrl: 'https://openclaw.example.com',
    apiKey: 'key',
    agentId: 'agent-1',
    timeoutMs: 100,
    webhookSecret: 'secret',
    allowedSkewMs: 1000,
    roomIds: new Set<string>(),
};

describe('OpenClawClient', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.useRealTimers();
    });

    it('returns parsed JSON on successful response', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: { get: vi.fn().mockReturnValue('application/json') },
            text: vi.fn().mockResolvedValue('{"id":"resp-1"}'),
        } as unknown as Response);

        const client = new OpenClawClient(config);
        const result = await client.sendMessage({
            sessionKey: 'room-1',
            traceId: 'trace-1',
            senderId: 'user-1',
            content: 'hello',
        });

        expect(result.status).toBe(200);
        expect(result.data.id).toBe('resp-1');
    });

    it('throws on upstream 5xx', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 503,
            headers: { get: vi.fn().mockReturnValue('text/plain') },
            text: vi.fn().mockResolvedValue('bad gateway'),
        } as unknown as Response);

        const client = new OpenClawClient(config);
        await expect(client.sendMessage({
            sessionKey: 'room-1',
            traceId: 'trace-1',
            senderId: 'user-1',
            content: 'hello',
        })).rejects.toThrow('OpenClaw upstream error: 503');
    });

    it('accepts 2xx response with empty body', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: { get: vi.fn().mockReturnValue('application/json') },
            text: vi.fn().mockResolvedValue(''),
        } as unknown as Response);

        const client = new OpenClawClient(config);
        const result = await client.sendMessage({
            sessionKey: 'room-1',
            traceId: 'trace-1',
            senderId: 'user-1',
            content: 'hello',
        });

        expect(result.status).toBe(200);
        expect(result.data).toEqual({});
    });

    it('accepts 2xx response with plain text body', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 202,
            headers: { get: vi.fn().mockReturnValue('text/plain') },
            text: vi.fn().mockResolvedValue('queued'),
        } as unknown as Response);

        const client = new OpenClawClient(config);
        const result = await client.sendMessage({
            sessionKey: 'room-1',
            traceId: 'trace-1',
            senderId: 'user-1',
            content: 'hello',
        });

        expect(result.status).toBe(202);
        expect(result.data).toEqual({});
    });

    it('parses JSON body from text when content-type is missing', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: { get: vi.fn().mockReturnValue(null) },
            text: vi.fn().mockResolvedValue('{"accepted":true}'),
        } as unknown as Response);

        const client = new OpenClawClient(config);
        const result = await client.sendMessage({
            sessionKey: 'room-1',
            traceId: 'trace-1',
            senderId: 'user-1',
            content: 'hello',
        });

        expect(result.status).toBe(200);
        expect(result.data).toEqual({ accepted: true });
    });

    it('throws timeout error when fetch aborts', async () => {
        globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
            const signal = init?.signal as AbortSignal;
            return await new Promise((_resolve, reject) => {
                signal.addEventListener('abort', () => {
                    reject(new DOMException('Aborted', 'AbortError'));
                });
            });
        });

        const client = new OpenClawClient(config);
        const promise = client.sendMessage({
            sessionKey: 'room-1',
            traceId: 'trace-1',
            senderId: 'user-1',
            content: 'hello',
        });

        vi.advanceTimersByTime(config.timeoutMs + 1);
        await expect(promise).rejects.toThrow('OpenClaw timeout');
    });
});
