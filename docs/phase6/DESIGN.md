# Design Document: Web Session Message Isolation Fix

## Current Architecture
The web UI uses a single `App` component that manages the `activeSession` ID and the `messages` list for that session. A WebSocket event handler is registered via `useCallback` (with `activeSession` as a dependency) and consumed by the `useWebSocket` hook.

## Problem
When `activeSession` changes:
1. The `handleWSEvent` callback is recreated.
2. However, there can be a delay or race condition where an old version of the callback (which captured a previous `activeSession` value) processes a message from the *newly* active session, or vice-versa.
3. More importantly, when an agent responds to a previous session (A) while the user is looking at session (B), the message might leak into (B) if the callback dependency hasn't fully propagated or if the filter check is bypassed due to stale closure state.

## Design Solution

### 1. Robust Filtering in State Updates
Instead of relying solely on the outer scope's `activeSession` value inside the `handleWSEvent` block, we will use the state update callback pattern (`setMessages(prev => ...)`) to perform a final verification.

By moving the check inside the state updater:
```typescript
setMessages(prev => {
  // FINAL GATE: Verify that the message indeed belongs to the currently active session
  // captured by the closure at the time of THIS handleWSEvent execution.
  if (msg.roomId !== activeSession) return prev;
  // ...
});
```

### 2. Immediate State Invalidation on Switch
We will modify the `useEffect` that handles session switching to clear the message list immediately. This provides a clean slate for the UI and prevents visual overlap during the fetch of new messages.

```typescript
useEffect(() => {
  // CLEAR IMMEDIATELY to prevent ghosting
  setMessages([]);
  
  if (activeSession) {
    fetchMessages(activeSession).then(setMessages).catch(console.error);
  }
}, [activeSession]);
```

### 3. Unified Update Logic
The same double-check logic will be applied to:
- `message` events: Adding new messages to the list.
- `message_updated` events: Updating existing message content (streaming text/thinking status).

## Component Impact
- **File**: `web/src/App.tsx`
- **Functions**: `handleWSEvent`, `useEffect` (for messages).

## Verification Plan
1. **Manual Testing**: Open Session A, send a long prompt, switch to Session B. Verify Session A's response does not appear in Session B.
2. **State Inspection**: Verify `messages` array contains only messages matching the current `activeSession` ID.
