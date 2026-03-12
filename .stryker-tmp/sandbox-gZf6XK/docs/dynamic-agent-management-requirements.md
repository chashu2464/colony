# Dynamic Agent Management - Initial Requirements

## Goal
Allow users to dynamically add or remove agents from an active Colony Session through Discord commands or by modifying the Discord Channel Topic.

## Requirements

### 1. Orchestration Layer (`src/Colony.ts`)
- Implement `updateSessionAgents(sessionId: string, agentIds: string[]): Promise<void>`.
- This method should act as the coordinator:
    1. Update the agents in the `ChatRoom`.
    2. Sync the changes to the Discord Channel Topic if the session is mapped.
    3. Ensure the updated state is persisted.

### 2. Chat Room Management (`src/conversation/ChatRoomManager.ts` & `ChatRoom.ts`)
- `ChatRoomManager` should expose a way to update agents for a specific room.
- `ChatRoom` already has `addAgent` and `removeAgent`.
- **State Cleanup**: When an agent is removed from a room, ensure `agent.abortRoomInvocation(roomId)` is called to terminate any pending tasks.
- **Default Agent Guard**: If the `defaultAgentId` is removed, the room must automatically assign a new default agent (e.g., the first one in the new list) or clear it.

### 3. Discord Integration (`src/discord/DiscordBot.ts`)
- **Explicit Command**: Add `/colony update <agent1,agent2,...>` command.
- **Topic Monitoring**: 
    - Listen for `channelUpdate` events.
    - If the `oldChannel.topic` differs from `newChannel.topic` in the `agents:` section, parse the new agents and trigger `Colony.updateSessionAgents`.
    - Implement a guard to prevent redundant updates (e.g., if the change was triggered by the bot itself).

### 4. Persistence
- Ensure the session JSON file is updated immediately after the agents are changed so that restarts maintain the new configuration.

## Success Criteria
1. `/colony update architect,developer` correctly updates the agents in both Colony and the Discord Topic.
2. Manually editing the Discord Topic's `agents: ...` section triggers an automatic agent update in Colony.
3. Removing an agent that is currently "thinking" stops its generation.
4. No infinite update loops between Colony and Discord.
