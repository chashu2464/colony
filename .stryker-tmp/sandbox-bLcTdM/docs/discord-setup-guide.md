# Discord Integration Setup Guide

## Overview

Colony can be integrated with Discord, allowing you to manage sessions and chat with agents directly from Discord (including mobile devices).

## Features

- ✅ Create and manage sessions via Discord commands
- ✅ Chat with agents in real-time
- ✅ Receive notifications for milestones and events
- ✅ View system status and agent information
- ✅ Mobile-friendly (works on Discord mobile app)

## Prerequisites

1. A Discord account
2. Permission to create a bot in a Discord server (or your own server)
3. Colony server running

## Step 1: Create a Discord Bot

### 1.1 Go to Discord Developer Portal

Visit: https://discord.com/developers/applications

### 1.2 Create New Application

1. Click "New Application"
2. Enter a name (e.g., "Colony Bot")
3. Click "Create"

### 1.3 Create Bot

1. Go to the "Bot" tab
2. Click "Add Bot"
3. Confirm by clicking "Yes, do it!"

### 1.4 Configure Bot

1. Under "Privileged Gateway Intents", enable:
   - ✅ MESSAGE CONTENT INTENT
   - ✅ SERVER MEMBERS INTENT (optional)
   - ✅ PRESENCE INTENT (optional)

2. Under "Bot Permissions", select:
   - ✅ Send Messages
   - ✅ Read Messages/View Channels
   - ✅ Read Message History
   - ✅ Add Reactions
   - ✅ Use Slash Commands (optional)

### 1.5 Get Bot Token

1. Click "Reset Token"
2. Copy the token (you'll need this later)
3. **Keep this token secret!**

## Step 2: Invite Bot to Your Server

### 2.1 Generate Invite URL

1. Go to "OAuth2" → "URL Generator"
2. Select scopes:
   - ✅ bot
   - ✅ applications.commands (optional)
3. Select bot permissions (same as above)
4. Copy the generated URL

### 2.2 Invite Bot

1. Open the URL in your browser
2. Select your server
3. Click "Authorize"

## Step 3: Configure Colony

### 3.1 Add Bot Token to .env

Edit `.env` file:

```bash
# Discord Bot
DISCORD_BOT_TOKEN=your-bot-token-here
```

### 3.2 Configure Discord Settings

Edit `config/discord.yaml`:

```yaml
bot:
  token: ${DISCORD_BOT_TOKEN}
  prefix: "/colony"

# Optional: Set notification channel
channels:
  notifications: "1234567890"  # Replace with your channel ID

notifications:
  enabled: true
  events:
    - milestone_completed
    - task_finished
    - error_occurred
    - agent_response

# Optional: Restrict access
permissions:
  allowedServers:
    - "your-server-id"
```

### 3.3 Get Channel ID

To get a channel ID:
1. Enable Developer Mode in Discord (User Settings → Advanced → Developer Mode)
2. Right-click on a channel
3. Click "Copy ID"

## Step 4: Start Colony with Discord

```bash
# Build
npm run build:server

# Start
npm start
```

You should see:
```
[INFO] [DiscordManager] Discord manager initialized
[INFO] [DiscordBot] Discord bot logged in as Colony Bot#1234
[INFO] [DiscordBridge] Discord bridge initialized
```

## Step 5: Test the Bot

In your Discord server, try these commands:

```
/colony help
/colony status
/colony agents
/colony list
```

## Usage

### Creating a Session

```
/colony create "Project Discussion" architect,developer
```

Response:
```
✅ Session created
ID: `abc-123-def`
Name: Project Discussion
Agents: Architect, Developer

Use `/colony join abc-123-def` to join the session.
```

### Joining a Session

```
/colony join abc-123-def
```

Response:
```
✅ Joined session **Project Discussion**

You can now send messages directly to chat with agents.
Use `@agent-name` to mention specific agents.
```

### Chatting with Agents

After joining a session, just send messages:

```
@architect Can you help me design a user authentication system?
```

The bot will forward your message to Colony, and agents will respond:

```
💬 **Architect**:
Sure! I recommend using JWT tokens with OAuth2.0...
```

### Leaving a Session

```
/colony leave
```

### Viewing Status

```
/colony status
```

Response:
```
📊 Colony Status

**Active Sessions:** 3
**Online Agents:** 3/3

**Agents:**
• Architect: idle
• Developer: busy
• QA Lead: idle
```

## Commands Reference

### Session Management

| Command | Description | Example |
|---------|-------------|---------|
| `/colony create <name> [agents]` | Create new session | `/colony create "Bug Fix" developer,qa-lead` |
| `/colony list` | List all sessions | `/colony list` |
| `/colony join <id>` | Join a session | `/colony join abc-123` |
| `/colony leave` | Leave current session | `/colony leave` |
| `/colony current` | Show current session | `/colony current` |

### Status & Info

| Command | Description | Example |
|---------|-------------|---------|
| `/colony status` | Show system status | `/colony status` |
| `/colony agents` | List all agents | `/colony agents` |
| `/colony help` | Show help | `/colony help` |

### Messaging

After joining a session:
- Send messages directly to chat with agents
- Use `@agent-name` to mention specific agents
- Bot will react with ✅ when message is received

## Notifications

If notifications are enabled, you'll receive automatic updates:

```
🎉 **Milestone Completed**
Session: **Project Discussion** (`abc-123`)

Architect has completed the system design document
- Architecture diagram generated
- API interfaces defined
- Database schema designed

_2024-01-01 12:00:00_
```

## Troubleshooting

### Bot Not Responding

1. Check bot is online in Discord
2. Check Colony logs for errors
3. Verify bot token is correct
4. Ensure bot has proper permissions

### Commands Not Working

1. Verify command prefix in `config/discord.yaml`
2. Check bot has "Send Messages" permission
3. Try in a different channel

### Messages Not Forwarding

1. Ensure you've joined a session (`/colony join`)
2. Check Colony logs for errors
3. Verify session still exists (`/colony current`)

### Permission Errors

1. Check `permissions` in `config/discord.yaml`
2. Verify your user/server/role is allowed
3. Remove restrictions for testing

## Security Considerations

### Bot Token

- **Never commit bot token to Git**
- Store in `.env` file (which is gitignored)
- Regenerate token if compromised

### Permissions

Use `permissions` in config to restrict access:

```yaml
permissions:
  # Only allow specific servers
  allowedServers:
    - "1234567890"

  # Only allow specific roles
  allowedRoles:
    - "admin-role-id"

  # Only allow specific users
  allowedUsers:
    - "user-id-1"
    - "user-id-2"
```

### Rate Limiting

Discord has rate limits:
- 5 messages per 5 seconds per channel
- 50 messages per second globally

Colony handles this automatically, but be aware of limits.

## Advanced Configuration

### Custom Command Prefix

Change the command prefix:

```yaml
bot:
  prefix: "!colony"  # Now use !colony instead of /colony
```

### Multiple Notification Channels

```yaml
channels:
  notifications: "general-channel-id"
  errors: "error-channel-id"
  milestones: "milestone-channel-id"
```

### Selective Notifications

```yaml
notifications:
  enabled: true
  events:
    - milestone_completed  # Only milestone notifications
    # - task_finished
    # - error_occurred
    # - agent_response
```

## Disabling Discord Integration

To disable Discord:

1. Remove or comment out `DISCORD_BOT_TOKEN` in `.env`
2. Or set `enableDiscord: false` when creating Colony:

```typescript
const colony = new Colony({
    enableDiscord: false
});
```

## Mobile Usage

Discord integration works great on mobile:

1. Install Discord mobile app
2. Join your server
3. Use commands as normal
4. Chat with agents on the go!

## Next Steps

- Set up notifications for your team
- Create dedicated channels for different projects
- Integrate with your CI/CD pipeline
- Add custom commands (see Development Guide)

## Support

If you encounter issues:
1. Check Colony logs
2. Check Discord bot logs
3. Verify configuration
4. See [Troubleshooting](#troubleshooting) section

## Related Documentation

- [Phase 5 Implementation Plan](./phase5-plan.md)
- [Colony Architecture](../README.md)
- [API Documentation](./api-docs.md)
