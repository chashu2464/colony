import { randomUUID } from 'crypto';
import type { OpenClawSessionMapping } from './types.js';

export class SessionMappingStore {
    private readonly bySessionKey = new Map<string, OpenClawSessionMapping>();
    private readonly traceToRoom = new Map<string, string>();

    get(sessionKey: string): OpenClawSessionMapping | undefined {
        return this.bySessionKey.get(sessionKey);
    }

    upsert(mapping: Omit<OpenClawSessionMapping, 'createdAt' | 'updatedAt'>): OpenClawSessionMapping {
        const now = Date.now();
        const existing = this.bySessionKey.get(mapping.sessionKey);
        const value: OpenClawSessionMapping = {
            ...mapping,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.bySessionKey.set(mapping.sessionKey, value);
        this.bindTrace(mapping.traceId, mapping.roomId);
        return value;
    }

    getOrCreate(sessionKey: string, roomId: string, externalAgentId: string): OpenClawSessionMapping {
        const existing = this.bySessionKey.get(sessionKey);
        if (existing) {
            return existing;
        }
        return this.upsert({
            sessionKey,
            roomId,
            externalAgentId,
            traceId: randomUUID(),
        });
    }

    assertTraceBoundToRoom(traceId: string, roomId: string): boolean {
        const boundRoomId = this.traceToRoom.get(traceId);
        if (!boundRoomId) {
            this.traceToRoom.set(traceId, roomId);
            return true;
        }
        return boundRoomId === roomId;
    }

    private bindTrace(traceId: string, roomId: string): void {
        this.traceToRoom.set(traceId, roomId);
    }
}
