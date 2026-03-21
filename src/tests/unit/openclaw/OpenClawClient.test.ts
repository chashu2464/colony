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
            json: vi.fn().mockResolvedValue({ id: 'resp-1' }),
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
            json: vi.fn().mockResolvedValue({ error: 'bad gateway' }),
        } as unknown as Response);

        const client = new OpenClawClient(config);
        await expect(client.sendMessage({
            sessionKey: 'room-1',
            traceId: 'trace-1',
            senderId: 'user-1',
            content: 'hello',
        })).rejects.toThrow('OpenClaw upstream error: 503');
    });

    it('throws on invalid JSON response', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: vi.fn().mockRejectedValue(new Error('invalid json')),
        } as unknown as Response);

        const client = new OpenClawClient(config);
        await expect(client.sendMessage({
            sessionKey: 'room-1',
            traceId: 'trace-1',
            senderId: 'user-1',
            content: 'hello',
        })).rejects.toThrow('OpenClaw invalid JSON response');
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
