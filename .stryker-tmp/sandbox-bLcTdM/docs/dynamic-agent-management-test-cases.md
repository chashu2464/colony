# Dynamic Agent Management - Test Cases

## TC-01: Explicit Update via Discord Command
- **Given**: A session with agents [architect, developer].
- **When**: User sends `/colony update architect, strategist` in Discord.
- **Then**: 
    - The session agents are updated to [architect, strategist].
    - `developer`'s current tasks (if any) are aborted.
    - Discord Channel Topic is updated to `... | agents: architect, strategist | id: ...`.
    - Session file on disk reflects the new agent list.

## TC-02: Automatic Update via Discord Topic Change
- **Given**: A mapped Discord channel for a session with agents [architect].
- **When**: User manually edits the Channel Topic to `... | agents: architect, writer | id: ...`.
- **Then**: 
    - Colony automatically adds `writer` to the session.
    - Message routing now includes `writer`.

## TC-03: Default Agent Re-assignment
- **Given**: A session where `architect` is the default agent.
- **When**: User removes `architect` from the session.
- **Then**: 
    - A new default agent is assigned from the remaining list.
    - Subsequent messages without @mentions are routed to the new default agent.

## TC-04: Resource Cleanup (Abort)
- **Given**: Agent `developer` is currently generating a response in a session.
- **When**: User removes `developer` from that session.
- **Then**: 
    - `agent.abortRoomInvocation` is called.
    - The partial response is handled gracefully (or generation stops immediately).

## TC-05: Re-entry / Loop Prevention
- **Given**: Colony updates the Discord Topic via `setTopic`.
- **When**: The `channelUpdate` event is fired by Discord API.
- **Then**: Colony's listener compares the new topic with the current system state, sees they match, and **does not** trigger another `updateSessionAgents` call.

## TC-06: Invalid Agent ID in Topic
- **Given**: User manually edits the Topic with a non-existent agent name: `agents: architect, phantom`.
- **When**: `channelUpdate` is processed.
- **Then**: 
    - Colony adds `architect`.
    - Colony logs a warning for `phantom` but does not crash.
    - The Discord Topic remains as is (or is corrected back by Colony in the next sync).
