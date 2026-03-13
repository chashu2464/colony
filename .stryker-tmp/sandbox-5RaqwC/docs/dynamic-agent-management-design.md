# Dynamic Agent Management - Architectural Design

## 1. ChatRoomManager Updates
- **New Method**: `updateRoomAgents(roomId: string, agentIds: string[]): void`
- **Logic**:
    1. Resolve new agent objects via `agentRegistry`.
    2. Identify removed agents: `currentAgents - newAgents`.
    3. For removed agents: call `agent.abortRoomInvocation(roomId)` and `room.removeAgent(agentId)`.
    4. For added agents: call `room.addAgent(agent)`.
    5. **Default Agent Policy**: If `defaultAgent` is removed, assign the first available agent in the new list.

## 2. Colony (Orchestration) Updates
- **New Method**: `updateSessionAgents(sessionId: string, agentIds: string[]): Promise<void>`
- **Logic**:
    1. Call `chatRoomManager.updateRoomAgents`.
    2. Call `chatRoomManager.saveRoom` to persist changes.
    3. Call `discordManager.updateChannelTopic` to sync metadata to Discord.

## 3. DiscordBot Updates
- **New Method**: `updateChannelTopic(sessionId: string, agentNames: string[]): Promise<void>`
    - Fetches the channel and updates the Topic string.
    - Format: `🤖 Colony Session | agents: agent1, agent2 | id: <sessionId>`.
- **Command**: `/colony update <agent1,agent2,...>`
    - Parses input and calls `colony.updateSessionAgents`.
- **Event Listener**: `channelUpdate`
    - Compares `oldChannel.topic` and `newChannel.topic`.
    - If `agents:` section changed, calls `colony.updateSessionAgents`.
    - **Re-entry Guard**: Skips if the topic already matches the Colony state.

## 4. Sequence Diagram (Discord Command)
1. User: `/colony update a,b`
2. DiscordBot -> Colony: `updateSessionAgents(id, [a,b])`
3. Colony -> ChatRoomManager: `updateRoomAgents(id, [a,b])`
4. ChatRoomManager -> ChatRoom: `remove/add agents`
5. Colony -> ChatRoomManager: `saveRoom(id)`
6. Colony -> DiscordBot: `updateChannelTopic(id, [a,b])`
7. DiscordBot -> Discord API: `setTopic(...)`

## 5. Sequence Diagram (Topic Change)
1. User: Edits Topic manually in Discord.
2. Discord API -> DiscordBot: `channelUpdate` event.
3. DiscordBot: `parseAgentsFromTopic`
4. DiscordBot -> Colony: `updateSessionAgents(...)`
5. Colony -> ... (same as above, but DiscordBot skips `setTopic` if topic already matches)
