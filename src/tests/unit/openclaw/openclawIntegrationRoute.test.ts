import { createHmac } from 'crypto';
import { describe, it, expect } from 'vitest';
import { processOpenClawEvent } from '../../../server/routes/openclawIntegration.js';
import { SessionMappingStore } from '../../../integrations/openclaw/sessionMappingStore.js';
import { IdempotencyStore } from '../../../integrations/openclaw/idempotencyStore.js';
import type { OpenClawConfig } from '../../../integrations/openclaw/types.js';

function sign(rawBody: string, timestamp: string, secret: string): string {
    return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

function makeDeps() {
    const systemEvents: string[] = [];
    const agentEvents: string[] = [];
    const fakeRoom = {
        id: 'room-a',
        sendSystemMessage: (content: string) => {
            systemEvents.push(content);
        },
        sendAgentMessage: (_agentId: string, content: string) => {
            agentEvents.push(content);
        },
    } as any;

    const roomManager = {
        getRoom: (id: string) => (id === 'room-a' ? fakeRoom : undefined),
    } as any;

    const config: OpenClawConfig = {
        enabled: true,
        baseUrl: 'https://openclaw.example.com',
        outboundPath: '/hooks/colony',
        apiKey: 'key',
        agentId: 'agent-1',
        timeoutMs: 100,
        webhookSecret: 'secret',
        allowedSkewMs: 300000,
        roomIds: new Set<string>(),
    };

    const mappingStore = new SessionMappingStore();
    mappingStore.upsert({
        sessionKey: 'session-a',
        roomId: 'room-a',
        traceId: 'trace-a',
        externalAgentId: 'agent-1',
    });

    return {
        deps: {
            roomManager,
            mappingStore,
            idempotencyStore: new IdempotencyStore(),
            config,
        },
        systemEvents,
        agentEvents,
    };
}

describe('processOpenClawEvent', () => {
    it('handles supported event', () => {
        const { deps, agentEvents } = makeDeps();
        const body = JSON.stringify({
            eventId: 'evt-1',
            sessionKey: 'session-a',
            traceId: 'trace-a',
            eventType: 'run.started',
            timestamp: new Date().toISOString(),
            payload: {},
        });
        const ts = `${Date.now()}`;
        const signature = sign(body, ts, deps.config.webhookSecret);

        const result = processOpenClawEvent({ rawBody: body, requestTimestamp: ts, signature }, deps);
        expect(result.status).toBe(200);
        expect(agentEvents[0]).toContain('Run started');
    });

    it('falls back to system sender when configured agent is missing in room', () => {
        const { deps, systemEvents, agentEvents } = makeDeps();
        const body = JSON.stringify({
            eventId: 'evt-fallback',
            sessionKey: 'session-a',
            traceId: 'trace-a',
            eventType: 'message.completed',
            timestamp: new Date().toISOString(),
            payload: { text: 'hello' },
        });
        const ts = `${Date.now()}`;
        const signature = sign(body, ts, deps.config.webhookSecret);

        const fakeRoomWithoutAgent = {
            id: 'room-a',
            sendSystemMessage: (content: string) => {
                systemEvents.push(content);
            },
            sendAgentMessage: () => {
                throw new Error('Agent "agent-1" is not in this room');
            },
        } as any;
        deps.roomManager = {
            getRoom: (id: string) => (id === 'room-a' ? fakeRoomWithoutAgent : undefined),
        } as any;

        const result = processOpenClawEvent({ rawBody: body, requestTimestamp: ts, signature }, deps);
        expect(result.status).toBe(200);
        expect(agentEvents).toHaveLength(0);
        expect(systemEvents[0]).toBe('hello');
    });

    it('rejects invalid signature', () => {
        const { deps } = makeDeps();
        const body = JSON.stringify({
            eventId: 'evt-1',
            sessionKey: 'session-a',
            traceId: 'trace-a',
            eventType: 'run.started',
            timestamp: new Date().toISOString(),
            payload: {},
        });

        const result = processOpenClawEvent({ rawBody: body, requestTimestamp: `${Date.now()}`, signature: 'bad' }, deps);
        expect(result.status).toBe(401);
        expect((result.body.error as any).code).toBe('SIGNATURE_INVALID');
    });

    it('rejects expired timestamp', () => {
        const { deps } = makeDeps();
        const oldEventTime = new Date(Date.now() - deps.config.allowedSkewMs - 10_000).toISOString();
        const body = JSON.stringify({
            eventId: 'evt-1',
            sessionKey: 'session-a',
            traceId: 'trace-a',
            eventType: 'run.started',
            timestamp: oldEventTime,
            payload: {},
        });
        const ts = `${Date.now()}`;
        const signature = sign(body, ts, deps.config.webhookSecret);

        const result = processOpenClawEvent({ rawBody: body, requestTimestamp: ts, signature }, deps);
        expect(result.status).toBe(401);
        expect((result.body.error as any).code).toBe('TIMESTAMP_EXPIRED');
    });

    it('returns duplicate_ignored for repeated eventId', () => {
        const { deps } = makeDeps();
        const body = JSON.stringify({
            eventId: 'evt-dup',
            sessionKey: 'session-a',
            traceId: 'trace-a',
            eventType: 'run.started',
            timestamp: new Date().toISOString(),
            payload: {},
        });
        const ts = `${Date.now()}`;
        const signature = sign(body, ts, deps.config.webhookSecret);

        const first = processOpenClawEvent({ rawBody: body, requestTimestamp: ts, signature }, deps);
        const second = processOpenClawEvent({ rawBody: body, requestTimestamp: ts, signature }, deps);

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(second.body.status).toBe('duplicate_ignored');
    });

    it('returns 202 for unknown event type', () => {
        const { deps } = makeDeps();
        const body = JSON.stringify({
            eventId: 'evt-unknown',
            sessionKey: 'session-a',
            traceId: 'trace-a',
            eventType: 'unknown.xxx',
            timestamp: new Date().toISOString(),
            payload: {},
        });
        const ts = `${Date.now()}`;
        const signature = sign(body, ts, deps.config.webhookSecret);

        const result = processOpenClawEvent({ rawBody: body, requestTimestamp: ts, signature }, deps);
        expect(result.status).toBe(202);
        expect(result.body.status).toBe('ignored_unknown_event');
    });

    it('rejects traceId cross-room injection', () => {
        const { deps } = makeDeps();
        deps.mappingStore.assertTraceBoundToRoom('trace-shared', 'room-x');
        deps.mappingStore.upsert({
            sessionKey: 'session-b',
            roomId: 'room-a',
            traceId: 'trace-a',
            externalAgentId: 'agent-1',
        });

        const body = JSON.stringify({
            eventId: 'evt-cross-room',
            sessionKey: 'session-b',
            traceId: 'trace-shared',
            eventType: 'run.started',
            timestamp: new Date().toISOString(),
            payload: {},
        });
        const ts = `${Date.now()}`;
        const signature = sign(body, ts, deps.config.webhookSecret);

        const result = processOpenClawEvent({ rawBody: body, requestTimestamp: ts, signature }, deps);
        expect(result.status).toBe(409);
        expect((result.body.error as any).code).toBe('TRACE_ROOM_MISMATCH');
    });

    it('returns mapping missing when session not found', () => {
        const { deps } = makeDeps();
        const body = JSON.stringify({
            eventId: 'evt-no-map',
            sessionKey: 'missing',
            traceId: 'trace-z',
            eventType: 'run.started',
            timestamp: new Date().toISOString(),
            payload: {},
        });
        const ts = `${Date.now()}`;
        const signature = sign(body, ts, deps.config.webhookSecret);

        const result = processOpenClawEvent({ rawBody: body, requestTimestamp: ts, signature }, deps);
        expect(result.status).toBe(404);
        expect((result.body.error as any).code).toBe('SESSION_MAPPING_MISSING');
    });
});
