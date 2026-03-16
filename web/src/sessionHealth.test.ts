import { describe, expect, it } from 'vitest';
import type { Participant } from './api';
import type { WSEvent } from './hooks/useWebSocket';
import { getSessionDisplayNumber, shouldRefreshSessionsForEvent } from './sessionHealth';

describe('sessionHealth helpers', () => {
  it('refreshes sessions for message-related and agent status events', () => {
    const shouldRefreshEvents: WSEvent[] = [
      { type: 'message' },
      { type: 'message_updated' },
      { type: 'agent_status' },
    ];

    for (const event of shouldRefreshEvents) {
      expect(shouldRefreshSessionsForEvent(event)).toBe(true);
    }
  });

  it('does not refresh sessions for unrelated events', () => {
    const noRefreshEvents: WSEvent[] = [
      { type: 'session_stopped' },
      { type: 'rate_limit' },
    ];

    for (const event of noRefreshEvents) {
      expect(shouldRefreshSessionsForEvent(event)).toBe(false);
    }
  });

  it('returns 1-based session number from chainIndex', () => {
    const participant = {
      id: 'architect',
      type: 'agent',
      name: '架构师',
      sessionHealth: {
        fillRatio: 0.25,
        tokensUsed: 50000,
        contextLimit: 200000,
        label: '🟢 healthy',
        chainIndex: 1,
      },
    } as Participant;

    expect(getSessionDisplayNumber(participant)).toBe(2);
  });

  it('falls back to session #1 when health is unavailable', () => {
    const participant = {
      id: 'architect',
      type: 'agent',
      name: '架构师',
    } as Participant;

    expect(getSessionDisplayNumber(participant)).toBe(1);
    expect(getSessionDisplayNumber(undefined)).toBe(1);
  });
});
