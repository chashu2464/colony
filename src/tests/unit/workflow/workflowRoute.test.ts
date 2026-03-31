import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkflowRouter } from '../../../server/routes/workflow.js';

type TestServer = {
    port: number;
    close: () => Promise<void>;
};

async function startServer(roomManager: any): Promise<TestServer> {
    const app = express();
    app.use(express.json());
    app.use('/api/workflow', createWorkflowRouter(roomManager));
    const server = app.listen(0);
    await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address();
    const port = typeof address === 'string' || address === null ? 0 : address.port;
    return {
        port,
        close: () =>
            new Promise<void>((resolve, reject) => {
                server.close(err => (err ? reject(err) : resolve()));
            }),
    };
}

async function postEvent(port: number, payload: Record<string, unknown>) {
    const response = await fetch(`http://127.0.0.1:${port}/api/workflow/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return {
        status: response.status,
        body: (await response.json()) as Record<string, unknown>,
    };
}

function basePayload(eventId: string) {
    return {
        type: 'WORKFLOW_STAGE_CHANGED',
        roomId: 'room-1',
        from_stage: 5,
        to_stage: 6,
        next_actor_role: 'developer',
        next_actor: 'developer',
        event_id: eventId,
        decision_source: 'stage_map',
    };
}

function writeWorkflowState(roomId: string, eventId: string, patch?: Partial<Record<string, unknown>>) {
    const workflowsDir = path.resolve(process.cwd(), '.data', 'workflows');
    fs.mkdirSync(workflowsDir, { recursive: true });
    const statePath = path.join(workflowsDir, `${roomId}.json`);
    const baseEntry = {
        event_id: eventId,
        from_stage: 5,
        to_stage: 6,
        routing: {
            next_actor_role: 'developer',
            next_actor: 'developer',
            decision_source: 'stage_map',
        },
    };
    const mergedEntry = {
        ...baseEntry,
        ...patch,
        routing: {
            ...baseEntry.routing,
            ...((patch?.routing as Record<string, unknown> | undefined) ?? {}),
        },
    };
    fs.writeFileSync(
        statePath,
        JSON.stringify(
            {
                history: [mergedEntry],
            },
            null,
            2
        )
    );
    return statePath;
}

describe('workflow route contract and routing behavior', () => {
    const sendSystemMessage = vi.fn();
    const room = {
        getAgents: vi.fn(() => [{ id: 'developer', config: { routable: true } }]),
        sendSystemMessage,
    };
    const roomManager = {
        getRoom: vi.fn(() => room),
    };
    let currentServer: TestServer | undefined;

    afterEach(async () => {
        sendSystemMessage.mockReset();
        room.getAgents.mockClear();
        roomManager.getRoom.mockClear();
        fs.rmSync(path.resolve(process.cwd(), '.data', 'workflows'), { recursive: true, force: true });
        if (currentServer) {
            await currentServer.close();
            currentServer = undefined;
        }
    });

    it('returns WF_STAGE_TRANSITION_INVALID when contract field is missing', async () => {
        currentServer = await startServer(roomManager);
        const payload = basePayload('wf-missing-field');
        const { decision_source: _, ...invalidPayload } = payload;
        const response = await postEvent(currentServer.port, invalidPayload);

        expect(response.status).toBe(400);
        expect(response.body.reason).toBe('WF_STAGE_TRANSITION_INVALID');
        expect(sendSystemMessage).not.toHaveBeenCalled();
    });

    it('returns WF_ROUTING_NON_ROUTABLE_AGENT for unroutable target agent', async () => {
        room.getAgents.mockReturnValueOnce([{ id: 'developer', config: { routable: false } }]);
        currentServer = await startServer(roomManager);
        writeWorkflowState('room-1', 'wf-non-routable');
        const response = await postEvent(currentServer.port, basePayload('wf-non-routable'));

        expect(response.status).toBe(400);
        expect(response.body.reason).toBe('WF_ROUTING_NON_ROUTABLE_AGENT');
        expect(sendSystemMessage).not.toHaveBeenCalled();
    });

    it('returns WF_EVENT_DISPATCH_FAILED when route cannot dispatch message', async () => {
        sendSystemMessage.mockImplementationOnce(() => {
            throw new Error('dispatch transport unavailable');
        });
        currentServer = await startServer(roomManager);

        const eventId = 'wf-dispatch-failed-retry';
        writeWorkflowState('room-1', eventId);
        const first = await postEvent(currentServer.port, basePayload(eventId));
        const second = await postEvent(currentServer.port, basePayload(eventId));

        expect(first.status).toBe(503);
        expect(first.body.reason).toBe('WF_EVENT_DISPATCH_FAILED');
        expect(second.status).toBe(200);
        expect(second.body.duplicate_ignored).toBe(false);
        expect(sendSystemMessage).toHaveBeenCalledTimes(2);
    });

    it('ignores duplicate event_id after a successful dispatch', async () => {
        currentServer = await startServer(roomManager);
        const eventId = 'wf-dedup-success';
        writeWorkflowState('room-1', eventId);

        const first = await postEvent(currentServer.port, basePayload(eventId));
        const second = await postEvent(currentServer.port, basePayload(eventId));

        expect(first.status).toBe(200);
        expect(first.body.duplicate_ignored).toBe(false);
        expect(second.status).toBe(200);
        expect(second.body.duplicate_ignored).toBe(true);
        expect(sendSystemMessage).toHaveBeenCalledTimes(1);
    });

    it('rejects unknown event type with deterministic invalid-transition code', async () => {
        currentServer = await startServer(roomManager);
        const payload = { ...basePayload('wf-unknown-type'), type: 'UNKNOWN_TYPE' };
        const response = await postEvent(currentServer.port, payload);

        expect(response.status).toBe(400);
        expect(response.body.reason).toBe('WF_STAGE_TRANSITION_INVALID');
        expect(sendSystemMessage).not.toHaveBeenCalled();
    });

    it('isolates idempotency by roomId to avoid cross-room duplicate collisions', async () => {
        currentServer = await startServer(roomManager);
        const eventId = 'wf-cross-room-replay';
        writeWorkflowState('room-1', eventId);
        writeWorkflowState('room-2', eventId);

        const roomOne = await postEvent(currentServer.port, basePayload(eventId));
        const roomTwo = await postEvent(currentServer.port, { ...basePayload(eventId), roomId: 'room-2' });

        expect(roomOne.status).toBe(200);
        expect(roomOne.body.duplicate_ignored).toBe(false);
        expect(roomTwo.status).toBe(200);
        expect(roomTwo.body.duplicate_ignored).toBe(false);
        expect(sendSystemMessage).toHaveBeenCalledTimes(2);
    });

    it('rejects forged decision_source with deterministic fail-closed code', async () => {
        currentServer = await startServer(roomManager);
        const eventId = 'wf-forged-decision-source';
        writeWorkflowState('room-1', eventId);

        const response = await postEvent(currentServer.port, {
            ...basePayload(eventId),
            decision_source: 'manual_override',
        });

        expect(response.status).toBe(400);
        expect(response.body.reason).toBe('WF_STAGE_TRANSITION_INVALID');
        expect(sendSystemMessage).not.toHaveBeenCalled();
    });

    it('rejects forged role/actor metadata when contract mismatches workflow history', async () => {
        currentServer = await startServer(roomManager);
        const eventId = 'wf-forged-role-actor';
        writeWorkflowState('room-1', eventId);

        const response = await postEvent(currentServer.port, {
            ...basePayload(eventId),
            next_actor_role: 'qa_lead',
        });

        expect(response.status).toBe(400);
        expect(response.body.reason).toBe('WF_STAGE_TRANSITION_INVALID');
        expect(sendSystemMessage).not.toHaveBeenCalled();
    });
});
