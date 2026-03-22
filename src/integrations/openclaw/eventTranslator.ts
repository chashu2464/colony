import type { ChatRoom } from '../../conversation/ChatRoom.js';
import type { OpenClawInboundEvent } from './types.js';

export function translateOpenClawEvent(room: ChatRoom, event: OpenClawInboundEvent, agentId?: string): void {
    const metadata = {
        openclawInbound: true,
        eventId: event.eventId,
        traceId: event.traceId,
        sessionKey: event.sessionKey,
        eventType: event.eventType,
    };

    if (event.eventType === 'run.started') {
        emitRoomMessage(room, '[OpenClaw] Run started', metadata, agentId);
        return;
    }
    if (event.eventType === 'run.failed') {
        const reason = stringifyPayloadField(event.payload.error ?? event.payload.reason);
        emitRoomMessage(room, `[OpenClaw] Run failed: ${reason || 'unknown error'}`, metadata, agentId);
        return;
    }
    if (event.eventType === 'message.completed') {
        const text = stringifyPayloadField(event.payload.text ?? event.payload.message ?? event.payload.content);
        emitRoomMessage(room, text || '[OpenClaw] message.completed', metadata, agentId);
        return;
    }
}

function stringifyPayloadField(value: unknown): string {
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    return '';
}

function emitRoomMessage(
    room: ChatRoom,
    content: string,
    metadata: Record<string, unknown>,
    agentId?: string,
): void {
    if (!agentId) {
        room.sendSystemMessage(content, [], metadata);
        return;
    }

    try {
        room.sendAgentMessage(agentId, content, [], metadata);
    } catch {
        room.sendSystemMessage(content, [], metadata);
    }
}
