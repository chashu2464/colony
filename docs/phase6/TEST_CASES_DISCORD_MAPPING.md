# Discord Channel-Session Mapping Test Cases

## TC-001: ChannelSessionMapper Bidirectional Binding
- **Given**: A clean ChannelSessionMapper instance.
- **When**: `bind(channelId="c1", sessionId="s1", meta={...})` is called.
- **Then**: 
    - `getSessionByChannel("c1")` returns "s1".
    - `getChannelBySession("s1")` returns "c1".
    - `getAllMappings()` contains the record.

## TC-002: ChannelSessionMapper Persistence
- **Given**: A mapping is bound in the mapper.
- **When**: `save()` is called and then a new mapper instance calls `load()`.
- **Then**: The mapping is restored correctly in the new instance.

## TC-003: Session Creation with Discord Channel (Direction A)
- **Given**: Valid Discord Guild and Category ID in config.
- **When**: `/colony create MySession` is called in Discord.
- **Then**:
    - A new Colony session is created.
    - A new Discord channel named `my-session` is created in the specified Category.
    - The channel topic contains the session ID and metadata.
    - The mapping is persisted in the mapper.

## TC-004: Priority-Based Message Routing
- **Given**: A Discord channel mapped to a session.
- **When**: A user sends a message in that channel (not a command).
- **Then**: The message is automatically routed to the mapped Colony session without needing `/colony join`.

## TC-005: Cascade Deletion on Channel Removal
- **Given**: A Discord channel mapped to a session.
- **When**: The Discord channel is deleted.
- **Then**:
    - The corresponding Colony session is deleted.
    - The mapping is removed from the mapper and persistence file.

## TC-006: Fallback Routing (Backward Compatibility)
- **Given**: A message sent in a channel NOT mapped to any session.
- **When**: The user has joined a session via `/colony join` previously.
- **Then**: The message is still routed to their `userSession.sessionId` (old logic).

## TC-007: Graceful Degradation (No Guild Config)
- **Given**: No `guild.id` configured in `discord.yaml`.
- **When**: `/colony create MySession` is called.
- **Then**: The Colony session is created, but no Discord channel is created. An informative message is returned to the user.
