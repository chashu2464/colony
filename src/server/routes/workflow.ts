import { Router } from 'express';
import type { ChatRoomManager } from '../../conversation/ChatRoomManager.js';
import { Logger } from '../../utils/Logger.js';

const log = new Logger('WorkflowRouter');
const VALID_ROLES = new Set(['architect', 'developer', 'qa_lead', 'designer', 'tech_lead']);
const ALLOWED_DECISION_SOURCES = new Set(['stage_map']);
const eventDispatchAudit = new Map<string, { status: 'success' | 'failed'; dispatchedAt: string; failureReason?: string }>();

type StageEventBody = {
    type: string;
    roomId: string;
    from_stage: number;
    to_stage: number;
    event_id: string;
    next_actor_role: string;
    next_actor: string;
    decision_source: string;
};

type RoomAgentLike = {
    id?: string;
    name?: string;
};

function invalid(res: any, details: string[]) {
    res.status(400).json({
        error: {
            code: 'WF_STAGE_TRANSITION_INVALID',
            message: 'Workflow stage transition event contract is invalid',
            details,
        },
    });
}

function asStageEventBody(input: unknown): StageEventBody {
    return input as StageEventBody;
}

function validateContract(body: StageEventBody): string[] {
    const details: string[] = [];
    if (body.type !== 'WORKFLOW_STAGE_CHANGED') details.push('type must be WORKFLOW_STAGE_CHANGED');
    if (!body.roomId || typeof body.roomId !== 'string') details.push('roomId is required');
    if (!Number.isInteger(body.from_stage) || body.from_stage < 0) details.push('from_stage must be a non-negative integer');
    if (!Number.isInteger(body.to_stage) || body.to_stage < 0) details.push('to_stage must be a non-negative integer');
    if (!body.event_id || typeof body.event_id !== 'string') details.push('event_id is required');
    if (!body.next_actor_role || !VALID_ROLES.has(body.next_actor_role)) details.push('next_actor_role is invalid');
    if (!body.next_actor || typeof body.next_actor !== 'string') details.push('next_actor is required');
    if (!body.decision_source || typeof body.decision_source !== 'string') details.push('decision_source is required');
    return details;
}

function normalizeRole(value: string | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    const normalized = trimmed.toLowerCase().replace(/-/g, '_').replace(/\s+/g, '_');
    if (VALID_ROLES.has(normalized)) return normalized;

    if (normalized === '架构师') return 'architect';
    if (normalized === '开发者') return 'developer';
    if (normalized === 'qa负责人') return 'qa_lead';
    if (normalized === '设计师') return 'designer';
    if (normalized === '技术负责人') return 'tech_lead';
    return null;
}

function findRoutableAgent(agents: RoomAgentLike[], nextActor: string): RoomAgentLike | undefined {
    return agents.find((agent) => agent.id === nextActor || agent.name === nextActor);
}

function validateRoutingSemantics(
    body: StageEventBody,
    routableAgent: RoomAgentLike | undefined,
): string[] {
    const details: string[] = [];
    if (!ALLOWED_DECISION_SOURCES.has(body.decision_source)) {
        details.push('decision_source must be stage_map');
    }

    if (!routableAgent) return details;

    const expectedRole = normalizeRole(body.next_actor_role);
    const actorRole = normalizeRole(routableAgent.id) ?? normalizeRole(routableAgent.name);
    if (expectedRole && actorRole && expectedRole !== actorRole) {
        details.push(`next_actor_role "${body.next_actor_role}" does not match next_actor "${body.next_actor}"`);
    }
    return details;
}

export function createWorkflowRouter(roomManager: ChatRoomManager) {
    const router = Router();

    router.post('/events', async (req, res) => {
        try {
            const body = asStageEventBody(req.body);
            const contractErrors = validateContract(body);
            if (contractErrors.length > 0) {
                log.warn('Rejecting invalid workflow event contract', { contractErrors, body: req.body });
                invalid(res, contractErrors);
                return;
            }
            const { roomId, from_stage, to_stage, event_id, next_actor, next_actor_role, decision_source } = body;

            const room = roomManager.getRoom(roomId);
            if (!room) {
                res.status(404).json({ error: 'Room not found' });
                return;
            }

            const agents = room.getAgents() as RoomAgentLike[];
            const routedAgent = findRoutableAgent(agents, next_actor);
            if (!routedAgent) {
                const details = [`actor "${next_actor}" is not routable in room "${roomId}"`];
                log.warn('Workflow routing blocked: non-routable actor', {
                    code: 'WF_ROUTING_NON_ROUTABLE_AGENT',
                    event_id,
                    roomId,
                    next_actor,
                    next_actor_role,
                    from_stage,
                    to_stage,
                });
                res.status(400).json({
                    result: 'block',
                    reason: 'WF_ROUTING_NON_ROUTABLE_AGENT',
                    details,
                    event_id,
                });
                return;
            }

            const semanticErrors = validateRoutingSemantics(body, routedAgent);
            if (semanticErrors.length > 0) {
                log.warn('Workflow routing blocked: invalid semantics', {
                    code: 'WF_STAGE_TRANSITION_INVALID',
                    event_id,
                    roomId,
                    next_actor,
                    next_actor_role,
                    decision_source,
                    semanticErrors,
                });
                invalid(res, semanticErrors);
                return;
            }

            const auditKey = `${roomId}:${event_id}`;
            const previous = eventDispatchAudit.get(auditKey);
            if (previous?.status === 'success') {
                log.info('Workflow event replay ignored (already dispatched)', {
                    event_id,
                    roomId,
                    from_stage,
                    to_stage,
                    next_actor,
                    next_actor_role,
                    decision_source,
                });
                res.json({
                    success: true,
                    status: 'duplicate_ignored',
                    replay: true,
                    event_id,
                    routing: { next_actor_role, next_actor, decision_source },
                    dispatch: {
                        status: previous.status,
                        dispatched_at: previous.dispatchedAt,
                    },
                });
                return;
            }

            log.info('Workflow stage transition event accepted', {
                event_id,
                roomId,
                from_stage,
                to_stage,
                next_actor,
                next_actor_role,
                decision_source,
                replay: Boolean(previous),
            });

            try {
                const message = `🔄 工作流已从 Stage ${from_stage} 推进到 Stage ${to_stage}。 @${next_actor} 请开始处理。`;
                room.sendSystemMessage(message, [next_actor]);
                const dispatchedAt = new Date().toISOString();
                eventDispatchAudit.set(auditKey, { status: 'success', dispatchedAt });

                res.json({
                    success: true,
                    replay: Boolean(previous),
                    event_id,
                    routing: { next_actor_role, next_actor, decision_source },
                    dispatch: { status: 'success', dispatched_at: dispatchedAt },
                });
                return;
            } catch (dispatchError: any) {
                const failureReason = dispatchError?.message ?? 'unknown dispatch error';
                const dispatchedAt = new Date().toISOString();
                eventDispatchAudit.set(auditKey, {
                    status: 'failed',
                    dispatchedAt,
                    failureReason,
                });
                log.error('Workflow event dispatch failed', {
                    code: 'WF_EVENT_DISPATCH_FAILED',
                    event_id,
                    roomId,
                    from_stage,
                    to_stage,
                    next_actor,
                    next_actor_role,
                    failureReason,
                });
                res.status(503).json({
                    result: 'dispatch_failed',
                    reason: 'WF_EVENT_DISPATCH_FAILED',
                    event_id,
                    routing: { next_actor_role, next_actor, decision_source },
                    dispatch: {
                        status: 'failed',
                        dispatched_at: dispatchedAt,
                        failure_reason: failureReason,
                    },
                });
                return;
            }
        } catch (error) {
            log.error('Failed to handle workflow event:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    return router;
}
