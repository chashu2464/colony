import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import type { ChatRoomManager } from '../../conversation/ChatRoomManager.js';
import { Logger } from '../../utils/Logger.js';

const log = new Logger('WorkflowRouter');
const ROUTABLE_ROLES = new Set(['architect', 'developer', 'qa_lead', 'designer']);
const ALLOWED_DECISION_SOURCES = new Set(['stage_map']);

type DispatchState = {
    status: 'success' | 'failed';
    attempts: number;
    lastDispatchedAt: string;
    failureReason?: string;
};

type WorkflowRoutingRecord = {
    from_stage: number;
    to_stage: number;
    next_actor_role: string;
    next_actor: string;
    decision_source: string;
};

const dispatchStateByRoomEvent = new Map<string, DispatchState>();

function roomEventKey(roomId: string, eventId: string): string {
    return `${roomId}:${eventId}`;
}

function loadWorkflowRoutingRecord(roomId: string, eventId: string): WorkflowRoutingRecord | null {
    const workflowsDir = path.resolve(process.cwd(), '.data', 'workflows');
    const stateFile = path.join(workflowsDir, `${roomId}.json`);
    if (!fs.existsSync(stateFile)) {
        return null;
    }
    try {
        const raw = fs.readFileSync(stateFile, 'utf8');
        const parsed = JSON.parse(raw) as { history?: unknown[] };
        if (!Array.isArray(parsed.history)) {
            return null;
        }
        for (let i = parsed.history.length - 1; i >= 0; i -= 1) {
            const entry = parsed.history[i] as any;
            if (!entry || entry.event_id !== eventId) {
                continue;
            }
            return {
                from_stage: Number(entry.from_stage),
                to_stage: Number(entry.to_stage),
                next_actor_role: String(entry.routing?.next_actor_role ?? ''),
                next_actor: String(entry.routing?.next_actor ?? ''),
                decision_source: String(entry.routing?.decision_source ?? ''),
            };
        }
        return null;
    } catch (error) {
        log.error(`Failed to read workflow state for room=${roomId}:`, error);
        return null;
    }
}

function invalidTransition(res: any, details: string[]) {
    res.status(400).json({
        result: 'block',
        reason: 'WF_STAGE_TRANSITION_INVALID',
        details,
    });
}

export function createWorkflowRouter(roomManager: ChatRoomManager) {
    const router = Router();

    router.post('/events', async (req, res) => {
        try {
            const {
                type,
                roomId,
                from_stage,
                to_stage,
                next_actor_role,
                next_actor,
                event_id,
                decision_source,
            } = req.body ?? {};

            const missingFields = [
                ['type', type],
                ['roomId', roomId],
                ['from_stage', from_stage],
                ['to_stage', to_stage],
                ['next_actor_role', next_actor_role],
                ['next_actor', next_actor],
                ['event_id', event_id],
                ['decision_source', decision_source],
            ]
                .filter(([_, value]) => value === undefined || value === null || value === '')
                .map(([field]) => field);

            if (missingFields.length > 0) {
                invalidTransition(res, [`missing required field(s): ${missingFields.join(', ')}`]);
                return;
            }

            if (type !== 'WORKFLOW_STAGE_CHANGED') {
                invalidTransition(res, [`unsupported event type: ${String(type)}`]);
                return;
            }
            if (!Number.isInteger(from_stage) || !Number.isInteger(to_stage)) {
                invalidTransition(res, ['from_stage and to_stage must be integers']);
                return;
            }
            if (!ROUTABLE_ROLES.has(next_actor_role)) {
                invalidTransition(res, [`next_actor_role is not routable: ${String(next_actor_role)}`]);
                return;
            }
            if (!ALLOWED_DECISION_SOURCES.has(decision_source)) {
                invalidTransition(res, [`decision_source is invalid: ${String(decision_source)}`]);
                return;
            }

            const room = roomManager.getRoom(roomId);
            if (!room) {
                res.status(404).json({ error: 'Room not found' });
                return;
            }

            const expectedRouting = loadWorkflowRoutingRecord(roomId, event_id);
            if (!expectedRouting) {
                invalidTransition(res, [
                    `event_id is not registered in workflow history for room: ${String(event_id)}`,
                ]);
                return;
            }
            if (
                expectedRouting.from_stage !== from_stage ||
                expectedRouting.to_stage !== to_stage ||
                expectedRouting.next_actor_role !== next_actor_role ||
                expectedRouting.next_actor !== next_actor ||
                expectedRouting.decision_source !== decision_source
            ) {
                invalidTransition(res, [
                    'event contract does not match workflow history routing record',
                ]);
                return;
            }

            const agents = room.getAgents();
            const targetAgent = agents.find(agent => agent.id === next_actor);
            const isRoutable = Boolean(targetAgent && targetAgent.config?.routable !== false);
            if (!isRoutable) {
                res.status(400).json({
                    result: 'block',
                    reason: 'WF_ROUTING_NON_ROUTABLE_AGENT',
                    details: [`target agent is missing or non-routable: ${String(next_actor)}`],
                    event_id,
                });
                return;
            }

            const dedupKey = roomEventKey(roomId, event_id);
            const existing = dispatchStateByRoomEvent.get(dedupKey);
            if (existing?.status === 'success') {
                res.json({
                    success: true,
                    event_id,
                    duplicate_ignored: true,
                    replay: true,
                });
                return;
            }

            // Send system notification message
            const message = `🔄 工作流已从 Stage ${from_stage} 推进到 Stage ${to_stage}。 @${next_actor} 请开始处理。`;

            try {
                room.sendSystemMessage(message, [next_actor], {
                    workflow_event_id: event_id,
                    workflow_room_id: roomId,
                    workflow_from_stage: from_stage,
                    workflow_to_stage: to_stage,
                    workflow_next_actor_role: next_actor_role,
                    workflow_decision_source: decision_source,
                    workflow_replay: Boolean(existing),
                });
            } catch (error) {
                const failureReason = 'WF_EVENT_DISPATCH_FAILED';
                dispatchStateByRoomEvent.set(dedupKey, {
                    status: 'failed',
                    attempts: (existing?.attempts ?? 0) + 1,
                    lastDispatchedAt: new Date().toISOString(),
                    failureReason,
                });
                log.error(
                    `Workflow dispatch failed event_id=${event_id} room=${roomId} ${from_stage}->${to_stage}:`,
                    error
                );
                res.status(503).json({
                    result: 'block',
                    reason: failureReason,
                    details: [(error as Error).message || 'sendSystemMessage failed'],
                    event_id,
                });
                return;
            }

            dispatchStateByRoomEvent.set(dedupKey, {
                status: 'success',
                attempts: (existing?.attempts ?? 0) + 1,
                lastDispatchedAt: new Date().toISOString(),
            });
            log.info(
                `Workflow event in room ${roomId}: Stage ${from_stage} -> ${to_stage}, role=${next_actor_role}, actor=${next_actor}, event_id=${event_id}`
            );
            res.json({
                success: true,
                event_id,
                duplicate_ignored: false,
                replay: Boolean(existing),
            });
        } catch (error) {
            log.error('Failed to handle workflow event:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    return router;
}
