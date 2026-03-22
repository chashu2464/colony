import express, { Router } from 'express';
import type { ChatRoomManager } from '../../conversation/ChatRoomManager.js';
import { Logger } from '../../utils/Logger.js';
import type { OpenClawConfig, OpenClawInboundEvent } from '../../integrations/openclaw/types.js';
import { SessionMappingStore } from '../../integrations/openclaw/sessionMappingStore.js';
import { IdempotencyStore } from '../../integrations/openclaw/idempotencyStore.js';
import { verifyOpenClawSignature } from '../../integrations/openclaw/signature.js';
import { translateOpenClawEvent } from '../../integrations/openclaw/eventTranslator.js';

const log = new Logger('OpenClawIntegrationRoute');

export interface OpenClawIntegrationDeps {
    roomManager: ChatRoomManager;
    mappingStore: SessionMappingStore;
    idempotencyStore: IdempotencyStore;
    config: OpenClawConfig;
}

export interface OpenClawProcessInput {
    rawBody: string;
    signature: string;
    requestTimestamp: string;
    nowMs?: number;
}

export interface OpenClawProcessResult {
    status: number;
    body: Record<string, unknown>;
}

export function createOpenClawIntegrationRouter(deps: OpenClawIntegrationDeps): Router {
    const router = Router();
    // Inbound bridge callback from OpenClaw (event backflow), not full-room sync.
    router.post('/events', expressRawJson(), async (req, res) => {
        const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body ?? '');
        const result = processOpenClawEvent(
            {
                rawBody,
                signature: String(req.header('x-openclaw-signature') ?? ''),
                requestTimestamp: String(req.header('x-openclaw-timestamp') ?? ''),
            },
            deps,
        );
        res.status(result.status).json(result.body);
    });
    return router;
}

export function processOpenClawEvent(input: OpenClawProcessInput, deps: OpenClawIntegrationDeps): OpenClawProcessResult {
    if (!verifyOpenClawSignature(input.rawBody, input.requestTimestamp, input.signature, deps.config.webhookSecret)) {
        return { status: 401, body: errorBody('SIGNATURE_INVALID', 'Invalid signature') };
    }

    const event = parseEvent(input.rawBody);
    if (!event) {
        return { status: 400, body: errorBody('INVALID_PAYLOAD', 'Malformed payload') };
    }

    const now = input.nowMs ?? Date.now();
    const eventTime = Date.parse(event.timestamp);
    if (!Number.isFinite(eventTime) || Math.abs(now - eventTime) > deps.config.allowedSkewMs) {
        return { status: 401, body: errorBody('TIMESTAMP_EXPIRED', 'Timestamp outside allowed skew') };
    }

    if (deps.idempotencyStore.has(event.eventId)) {
        return { status: 200, body: { status: 'duplicate_ignored', eventId: event.eventId } };
    }

    const mapping = deps.mappingStore.get(event.sessionKey)
        ?? tryAutoMapSessionKeyToRoom(event, deps);
    if (!mapping) {
        return { status: 404, body: errorBody('SESSION_MAPPING_MISSING', 'sessionKey mapping not found') };
    }
    if (!deps.mappingStore.assertTraceBoundToRoom(event.traceId, mapping.roomId)) {
        return { status: 409, body: errorBody('TRACE_ROOM_MISMATCH', 'traceId was bound to another room') };
    }

    if (!isSupportedEventType(event.eventType)) {
        log.info(`Ignoring unknown OpenClaw event type: ${event.eventType}`);
        return { status: 202, body: { status: 'ignored_unknown_event', eventType: event.eventType } };
    }

    const room = deps.roomManager.getRoom(mapping.roomId);
    if (!room) {
        return { status: 404, body: errorBody('ROOM_NOT_FOUND', 'Mapped room does not exist') };
    }

    const senderAgentId = resolveSenderAgentId(event, mapping.externalAgentId, deps.config.agentId);
    translateOpenClawEvent(room, event, senderAgentId);
    deps.idempotencyStore.markProcessed(event.eventId);
    log.info('OpenClaw event handled', {
        eventId: event.eventId,
        traceId: event.traceId,
        sessionKey: event.sessionKey,
        roomId: mapping.roomId,
        eventType: event.eventType,
    });
    return { status: 200, body: { status: 'ok' } };
}

function tryAutoMapSessionKeyToRoom(event: OpenClawInboundEvent, deps: OpenClawIntegrationDeps) {
    const room = deps.roomManager.getRoom(event.sessionKey);
    if (!room) {
        return undefined;
    }
    return deps.mappingStore.upsert({
        sessionKey: event.sessionKey,
        roomId: room.id,
        traceId: event.traceId,
        externalAgentId: deps.config.agentId,
    });
}

function parseEvent(rawBody: string): OpenClawInboundEvent | null {
    try {
        const parsed = JSON.parse(rawBody) as Partial<OpenClawInboundEvent>;
        if (
            !parsed
            || typeof parsed.eventId !== 'string'
            || typeof parsed.sessionKey !== 'string'
            || typeof parsed.traceId !== 'string'
            || typeof parsed.eventType !== 'string'
            || typeof parsed.timestamp !== 'string'
            || typeof parsed.payload !== 'object'
            || parsed.payload === null
            || Array.isArray(parsed.payload)
            || (parsed.agentId !== undefined && typeof parsed.agentId !== 'string')
        ) {
            return null;
        }
        return parsed as OpenClawInboundEvent;
    } catch {
        return null;
    }
}

function isSupportedEventType(eventType: string): boolean {
    return eventType === 'run.started'
        || eventType === 'message.completed'
        || eventType === 'run.failed';
}

function errorBody(code: string, message: string): Record<string, unknown> {
    return { error: { code, message } };
}

function resolveSenderAgentId(event: OpenClawInboundEvent, mappingAgentId: string, configAgentId: string): string {
    const eventAgentId = event.agentId?.trim();
    if (eventAgentId) {
        return eventAgentId;
    }
    const mappedAgentId = mappingAgentId.trim();
    if (mappedAgentId) {
        return mappedAgentId;
    }
    return configAgentId.trim();
}

function expressRawJson() {
    return express.raw({ type: 'application/json', limit: '256kb' });
}
