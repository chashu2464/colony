import { describe, it, expect } from 'vitest';
import { SessionMappingStore } from '../../../integrations/openclaw/sessionMappingStore.js';

describe('SessionMappingStore', () => {
    it('creates and retrieves mapping', () => {
        const store = new SessionMappingStore();
        const mapping = store.getOrCreate('session-a', 'room-a', 'external-a');

        const resolved = store.get('session-a');
        expect(resolved).toBeDefined();
        expect(resolved?.roomId).toBe('room-a');
        expect(resolved?.externalAgentId).toBe('external-a');
        expect(mapping.traceId.length).toBeGreaterThan(0);
    });

    it('rejects cross-room trace binding', () => {
        const store = new SessionMappingStore();
        expect(store.assertTraceBoundToRoom('trace-1', 'room-a')).toBe(true);
        expect(store.assertTraceBoundToRoom('trace-1', 'room-b')).toBe(false);
    });
});
