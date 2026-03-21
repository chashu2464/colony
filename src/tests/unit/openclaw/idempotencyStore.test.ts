import { describe, it, expect, vi } from 'vitest';
import { IdempotencyStore } from '../../../integrations/openclaw/idempotencyStore.js';

describe('IdempotencyStore', () => {
    it('stores and expires event id with ttl', () => {
        vi.useFakeTimers();
        const store = new IdempotencyStore(1000);

        store.markProcessed('evt-1');
        expect(store.has('evt-1')).toBe(true);

        vi.advanceTimersByTime(1001);
        expect(store.has('evt-1')).toBe(false);

        vi.useRealTimers();
    });
});
