import type { ChatRoom } from '../../conversation/ChatRoom.js';
import type { OpenClawInboundEvent } from './types.js';

export function translateOpenClawEvent(room: ChatRoom, event: OpenClawInboundEvent): void {
    const metadata = {
        openclawInbound: true,
        eventId: event.eventId,
        traceId: event.traceId,
        sessionKey: event.sessionKey,
        eventType: event.eventType,
    };

    if (event.eventType === 'run.started') {
        room.sendSystemMessage('[OpenClaw] Run started', [], metadata);
        return;
    }
    if (event.eventType === 'run.failed') {
        const reason = stringifyPayloadField(event.payload.error ?? event.payload.reason);
        room.sendSystemMessage(`[OpenClaw] Run failed: ${reason || 'unknown error'}`, [], metadata);
        return;
    }
    if (event.eventType === 'message.completed') {
        const text = stringifyPayloadField(event.payload.text ?? event.payload.message ?? event.payload.content);
        room.sendSystemMessage(text || '[OpenClaw] message.completed', [], metadata);
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
