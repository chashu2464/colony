# Requirements: Web Session Message Isolation Fix

## Problem Description
When a user switches between chat sessions in the web UI, messages from a previously active session can leak into the newly active session. This happens because the WebSocket event handler's closure captures a stale `activeSession` ID, and the race condition allows messages from the old session to pass the `msg.roomId === activeSession` check incorrectly before the handler is recreated.

## Functional Requirements
1. **Durable Message Filtering**: The WebSocket message handlers must verify that the incoming message's `roomId` matches the *current* `activeSession` at the time of state update.
2. **Immediate UI Feedback**: When switching sessions, the message list must be cleared immediately to prevent ghost messages from the previous session from showing up while the new messages are being fetched.
3. **Consistency Across Events**: Both `message` (new message) and `message_updated` (message content edit/thinking update) events must implement the filtered update logic.

## Technical Requirements
- Implement "Double Check" in `setMessages` callback:
  ```typescript
  setMessages(prev => {
    if (msg.roomId !== activeSession) return prev;
    // ... update logic
  });
  ```
- Clear messages in the `activeSession` change effect:
  ```typescript
  useEffect(() => {
    setMessages([]); // Clear immediately
    if (activeSession) {
      fetchMessages(activeSession).then(setMessages);
    }
  }, [activeSession]);
  ```

## Acceptance Criteria
- [ ] Switching between Session A and Session B does not result in Session A's messages appearing in Session B's view.
- [ ] The message list is visually empty immediately after clicking a different session in the sidebar.
- [ ] Message updates (thinking dots, streaming text) only occur in the correct session view.
