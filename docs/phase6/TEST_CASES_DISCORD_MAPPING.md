# Discord Channel-Session Mapping Test Cases

## Direction A: Colony Session -> Discord Channel

### TC-001: ChannelSessionMapper Bidirectional Binding
- **Given**: A clean ChannelSessionMapper instance.
- **When**: `bind(channelId="c1", sessionId="s1", meta={...})` is called.
- **Then**: 
    - `getSessionByChannel("c1")` returns "s1".
    - `getChannelBySession("s1")` returns "c1".
    - `getAllMappings()` contains the record.

### TC-002: ChannelSessionMapper Persistence
- **Given**: A mapping is bound in the mapper.
- **When**: `save()` is called and then a new mapper instance calls `load()`.
- **Then**: The mapping is restored correctly in the new instance.

### TC-003: Session Creation with Discord Channel
- **Given**: Valid Discord Guild and Category ID in config.
- **When**: `/colony create MySession` is called in Discord.
- **Then**:
    - A new Colony session is created.
    - A new Discord channel named `my-session` is created in the specified Category.
    - The channel topic contains the session ID and metadata.
    - The mapping is persisted in the mapper.

### TC-004: Priority-Based Message Routing
- **Given**: A Discord channel mapped to a session.
- **When**: A user sends a message in that channel (not a command).
- **Then**: The message is automatically routed to the mapped Colony session without needing `/colony join`.

### TC-005: Cascade Deletion on Channel Removal
- **Given**: A Discord channel mapped to a session.
- **When**: The Discord channel is deleted.
- **Then**:
    - The corresponding Colony session is deleted.
    - The mapping is removed from the mapper and persistence file.

### TC-006: Fallback Routing (Backward Compatibility)
- **Given**: A message sent in a channel NOT mapped to any session.
- **When**: The user has joined a session via `/colony join` previously.
- **Then**: The message is still routed to their `userSession.sessionId` (old logic).

### TC-007: Graceful Degradation (No Guild Config)
- **Given**: No `guild.id` configured in `discord.yaml`.
- **When**: `/colony create MySession` is called.
- **Then**: The Colony session is created, but no Discord channel is created. An informative message is returned to the user.

---

## Direction B: Discord Channel -> Colony Session

### TC-B01: Basic Trigger and Binding (Happy Path)
- **Given**: `autoCreateOnChannelCreate: true` and correct `sessionCategory` configured.
- **When**: User creates a text channel named `research-task` in the designated Category.
- **Then**:
    - A Colony Session named `research-task` is automatically created.
    - `ChannelSessionMapper` establishes bidirectional binding.
    - Channel Topic is updated with `id: <sessionId>`.
    - A welcome message is sent to the channel.

### TC-B02: Re-entry Prevention (Direction A Compatibility)
- **Given**: User executes `/colony create task-a` (Direction A).
- **When**: Bot creates the Discord channel, triggering the `channelCreate` event.
- **Then**: `handleChannelCreate` recognizes the channel is already mapped and **must skip** duplicate session creation.

### TC-B03: Intelligent Agent Parsing
- **Given**: User creates a channel with pre-set topic: `🎯 Research | agents: architect, developer`.
- **When**: Automatic creation is triggered.
- **Then**:
    - The generated session contains exactly `architect` and `developer`.
    - The original topic description (`🎯 Research`) is preserved when the ID is appended.

### TC-B04: Permissions and Graceful Degradation
- **Given**: Bot lacks `MANAGE_CHANNELS` permission.
- **When**: User creates a target channel.
- **Then**:
    - Session creation and Mapper binding must succeed.
    - Topic update failure is caught and logged as a Warn (no crash).
    - Welcome message is still sent.

### TC-B05: Switch Control
- **Given**: `autoCreateOnChannelCreate: false`.
- **When**: User creates a channel in the designated Category.
- **Then**: No Colony session is created.

### TC-B06: Invalid Agent Handling
- **Given**: Topic contains non-existent Agent ID: `agents: ghost-agent`.
- **When**: Triggered.
- **Then**: The system skips the invalid ID and loads either `defaultAgents` or all agents (as per config).

### TC-B07: Duplicate Name Handling
- **Given**: Discord allows duplicate names in the same Category (different IDs).
- **When**: User creates another channel named `research-task`.
- **Then**: A new Colony session is created with a unique ID, and the welcome message distinguishes it using the `sessionId`.
