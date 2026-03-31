import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { createWorkflowRouter } from '../../../server/routes/workflow.js';

type FakeAgent = { id: string; name: string };

function makeServer(options?: { throwOnSend?: boolean | (() => boolean) }) {
    const sentMessages: Array<{ roomId: string; content: string; mentions?: string[] }> = [];
    const agents: FakeAgent[] = [
        { id: 'architect', name: '架构师' },
        { id: 'developer', name: '开发者' },
        { id: 'qa-lead', name: 'QA负责人' },
    ];

    const room = (roomId: string) => ({
        getAgents: () => agents,
        sendSystemMessage: (content: string, mentions?: string[]) => {
            const shouldThrow = typeof options?.throwOnSend === 'function'
                ? options.throwOnSend()
                : options?.throwOnSend;
            if (shouldThrow) throw new Error('simulated dispatch transport failure');
            sentMessages.push({ roomId, content, mentions });
        },
    });

    const rooms = new Map([
        ['room-1', room('room-1')],
        ['room-2', room('room-2')],
    ]);

    const roomManager = {
        getRoom: (id: string) => rooms.get(id),
    } as any;

    const app = express();
    app.use(express.json());
    app.use('/api/workflow', createWorkflowRouter(roomManager));
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    return { server, port, sentMessages };
}

async function post(port: number, payload: Record<string, any>) {
    const response = await fetch(`http://127.0.0.1:${port}/api/workflow/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const body = await response.json() as Record<string, any>;
    return { status: response.status, body };
}

afterEach(() => {
    // Keep hook for readability and future shared cleanup.
});

describe('workflow route /api/workflow/events', () => {
    it('accepts valid contract and dispatches wake-up once', async () => {
        const { server, port, sentMessages } = makeServer();
        const payload = {
            type: 'WORKFLOW_STAGE_CHANGED',
            roomId: 'room-1',
            from_stage: 5,
            to_stage: 6,
            event_id: 'wf-func-001',
            next_actor_role: 'developer',
            next_actor: 'developer',
            decision_source: 'stage_map',
        };

        const result = await post(port, payload);
        server.close();

        expect(result.status).toBe(200);
        expect(result.body.success).toBe(true);
        expect(result.body.dispatch.status).toBe('success');
        expect(sentMessages).toHaveLength(1);
        expect(sentMessages[0].mentions).toEqual(['developer']);
    });

    it('rejects invalid contract fail-closed', async () => {
        const { server, port } = makeServer();
        const payload = {
            type: 'WORKFLOW_STAGE_CHANGED',
            roomId: 'room-1',
            from_stage: 5,
            to_stage: 6,
            next_actor: 'developer',
        };

        const result = await post(port, payload);
        server.close();

        expect(result.status).toBe(400);
        expect(result.body.error.code).toBe('WF_STAGE_TRANSITION_INVALID');
    });

    it('blocks non-routable actor with deterministic reason', async () => {
        const { server, port, sentMessages } = makeServer();
        const payload = {
            type: 'WORKFLOW_STAGE_CHANGED',
            roomId: 'room-1',
            from_stage: 4,
            to_stage: 5,
            event_id: 'wf-err-002',
            next_actor_role: 'qa_lead',
            next_actor: 'not-in-room',
            decision_source: 'stage_map',
        };

        const result = await post(port, payload);
        server.close();

        expect(result.status).toBe(400);
        expect(result.body.reason).toBe('WF_ROUTING_NON_ROUTABLE_AGENT');
        expect(sentMessages).toHaveLength(0);
    });

    it('does not duplicate wake-up for successful replay with same event_id', async () => {
        const { server, port, sentMessages } = makeServer();
        const payload = {
            type: 'WORKFLOW_STAGE_CHANGED',
            roomId: 'room-1',
            from_stage: 6,
            to_stage: 7,
            event_id: 'wf-idemp-001',
            next_actor_role: 'qa_lead',
            next_actor: 'qa-lead',
            decision_source: 'stage_map',
        };

        const first = await post(port, payload);
        const second = await post(port, payload);
        server.close();

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(second.body.status).toBe('duplicate_ignored');
        expect(sentMessages).toHaveLength(1);
    });

    it('isolates idempotency by room scope for same event_id across rooms', async () => {
        const { server, port, sentMessages } = makeServer();
        const payload = {
            type: 'WORKFLOW_STAGE_CHANGED',
            from_stage: 6,
            to_stage: 7,
            event_id: 'wf-idemp-cross-room-001',
            next_actor_role: 'qa_lead',
            next_actor: 'qa-lead',
            decision_source: 'stage_map',
        };

        const room1 = await post(port, { ...payload, roomId: 'room-1' });
        const room2 = await post(port, { ...payload, roomId: 'room-2' });
        server.close();

        expect(room1.status).toBe(200);
        expect(room2.status).toBe(200);
        expect(room1.body.status).toBeUndefined();
        expect(room2.body.status).toBeUndefined();
        expect(sentMessages).toHaveLength(2);
        expect(sentMessages.map((msg) => msg.roomId).sort()).toEqual(['room-1', 'room-2']);
    });

    it('allows controlled retry after prior dispatch failure for same event_id', async () => {
        let attempts = 0;
        const { server, port, sentMessages } = makeServer({
            throwOnSend: () => {
                attempts += 1;
                return attempts === 1;
            },
        });
        const payload = {
            type: 'WORKFLOW_STAGE_CHANGED',
            roomId: 'room-1',
            from_stage: 3,
            to_stage: 4,
            event_id: 'wf-idemp-002',
            next_actor_role: 'qa_lead',
            next_actor: 'qa-lead',
            decision_source: 'stage_map',
        };

        const first = await post(port, payload);
        const second = await post(port, payload);
        server.close();

        expect(first.status).toBe(503);
        expect(first.body.reason).toBe('WF_EVENT_DISPATCH_FAILED');
        expect(second.status).toBe(200);
        expect(second.body.replay).toBe(true);
        expect(sentMessages).toHaveLength(1);
    });

    it('rejects forged decision_source fail-closed', async () => {
        const { server, port, sentMessages } = makeServer();
        const result = await post(port, {
            type: 'WORKFLOW_STAGE_CHANGED',
            roomId: 'room-1',
            from_stage: 6,
            to_stage: 7,
            event_id: 'wf-sec-forged-source-001',
            next_actor_role: 'qa_lead',
            next_actor: 'qa-lead',
            decision_source: 'manual_override',
        });
        server.close();

        expect(result.status).toBe(400);
        expect(result.body.error.code).toBe('WF_STAGE_TRANSITION_INVALID');
        expect(sentMessages).toHaveLength(0);
    });

    it('rejects forged role/actor mismatch fail-closed', async () => {
        const { server, port, sentMessages } = makeServer();
        const result = await post(port, {
            type: 'WORKFLOW_STAGE_CHANGED',
            roomId: 'room-1',
            from_stage: 6,
            to_stage: 7,
            event_id: 'wf-sec-forged-role-001',
            next_actor_role: 'architect',
            next_actor: 'developer',
            decision_source: 'stage_map',
        });
        server.close();

        expect(result.status).toBe(400);
        expect(result.body.error.code).toBe('WF_STAGE_TRANSITION_INVALID');
        expect(sentMessages).toHaveLength(0);
    });
});
