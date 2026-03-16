import type { Participant } from './api';
import type { WSEvent } from './hooks/useWebSocket';

export function shouldRefreshSessionsForEvent(event: WSEvent): boolean {
  return event.type === 'message' || event.type === 'message_updated' || event.type === 'agent_status';
}

export function getSessionDisplayNumber(participant?: Participant): number {
  const chainIndex = participant?.sessionHealth?.chainIndex ?? 0;
  return chainIndex + 1;
}
