// ── Colony: Discord Bot ──────────────────────────────────
// Discord bot for Colony integration.

import { Client, GatewayIntentBits, Message, TextChannel, ChannelType } from 'discord.js';
import { Logger } from '../utils/Logger.js';
import type { DiscordConfig, UserSession, MappingMeta } from './types.js';
import type { Colony } from '../Colony.js';
import type { ChannelSessionMapper } from './ChannelSessionMapper.js';

const log = new Logger('DiscordBot');

export class DiscordBot {
    private client: Client;
    private config: DiscordConfig;
    private colony: Colony;
    private mapper: ChannelSessionMapper;
    private userSessions = new Map<string, UserSession>();
    private ready = false;
    private bridge?: any; // Will be set by DiscordManager

    constructor(config: DiscordConfig, colony: Colony, mapper: ChannelSessionMapper) {
        this.config = config;
        this.colony = colony;
        this.mapper = mapper;

        // Create Discord client with necessary intents
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages,
            ],
        });

        this.setupEventHandlers();
    }

    /**
     * Setup Discord event handlers.
     */
    private setupEventHandlers(): void {
        this.client.on('ready', () => {
            log.info(`Discord bot logged in as ${this.client.user?.tag}`);
            this.ready = true;
        });

        this.client.on('messageCreate', async (message) => {
            await this.handleMessage(message);
        });

        this.client.on('channelDelete', async (channel) => {
            await this.handleChannelDelete(channel);
        });

        this.client.on('channelCreate', async (channel) => {
            await this.handleChannelCreate(channel);
        });

        this.client.on('channelUpdate', async (oldChannel, newChannel) => {
            if (newChannel.isTextBased()) {
                await this.handleChannelUpdate(oldChannel as TextChannel, newChannel as TextChannel);
            }
        });

        this.client.on('error', (error) => {
            log.error('Discord client error:', error);
        });
    }

    /**
     * Handle incoming Discord messages.
     */
    private async handleMessage(message: Message): Promise<void> {
        // Ignore bot messages
        if (message.author.bot) return;

        // Check permissions
        if (!this.checkPermissions(message)) {
            return;
        }

        const content = message.content.trim();

        // Handle commands
        if (content.startsWith(this.config.bot.prefix)) {
            await this.handleCommand(message);
            return;
        }

        // Handle regular messages
        
        // 1. Check if channel is bound to a session
        const mappedSessionId = this.mapper.getSessionByChannel(message.channelId);
        if (mappedSessionId) {
            // Auto-join: ensure the Discord user is a participant in the Colony room
            const room = this.colony.chatRoomManager.getRoom(mappedSessionId);
            if (room && !room.getParticipantIds().includes(message.author.id)) {
                this.colony.joinSession(mappedSessionId, {
                    id: message.author.id,
                    type: 'human',
                    name: message.author.username,
                });
                log.debug(`Auto-joined user ${message.author.username} (${message.author.id}) to session ${mappedSessionId}`);
            }
            await this.forwardToColony(message, {
                userId: message.author.id,
                sessionId: mappedSessionId,
                channelId: message.channelId,
                joinedAt: new Date(), // Mapped channels are auto-joined
            });
            return;
        }

        // 2. Fallback to user session (legacy)
        const userSession = this.userSessions.get(message.author.id);
        if (userSession?.sessionId) {
            await this.forwardToColony(message, userSession);
        }
    }

    /**
     * Check if user has permission to use the bot.
     */
    private checkPermissions(message: Message): boolean {
        const perms = this.config.permissions;
        if (!perms) return true;

        // Check server
        if (perms.allowedServers && perms.allowedServers.length > 0) {
            if (!message.guildId || !perms.allowedServers.includes(message.guildId)) {
                return false;
            }
        }

        // Check user
        if (perms.allowedUsers && perms.allowedUsers.length > 0) {
            if (!perms.allowedUsers.includes(message.author.id)) {
                return false;
            }
        }

        // Check role (if in a guild)
        if (perms.allowedRoles && perms.allowedRoles.length > 0 && message.member) {
            const hasRole = message.member.roles.cache.some(role =>
                perms.allowedRoles!.includes(role.id)
            );
            if (!hasRole) {
                return false;
            }
        }

        return true;
    }

    /**
     * Handle command messages.
     */
    private async handleCommand(message: Message): Promise<void> {
        const content = message.content.slice(this.config.bot.prefix.length).trim();
        const args = content.split(/\s+/);
        const command = args.shift()?.toLowerCase();

        if (!command) return;

        try {
            switch (command) {
                case 'create':
                    await this.cmdCreate(message, args);
                    break;
                case 'list':
                    await this.cmdList(message);
                    break;
                case 'join':
                    await this.cmdJoin(message, args);
                    break;
                case 'leave':
                    await this.cmdLeave(message);
                    break;
                case 'current':
                    await this.cmdCurrent(message);
                    break;
                case 'stop':
                    await this.cmdStop(message);
                    break;
                case 'start':
                    await this.cmdStart(message);
                    break;
                case 'status':
                    await this.cmdStatus(message);
                    break;
                case 'agents':
                    await this.cmdAgents(message);
                    break;
                case 'delete':
                    await this.cmdDelete(message, args);
                    break;
                case 'update':
                    await this.cmdUpdate(message, args);
                    break;
                case 'help':
                    await this.cmdHelp(message);
                    break;
                default:
                    await message.reply(`Unknown command: ${command}. Use \`${this.config.bot.prefix} help\` for help.`);
            }
        } catch (error) {
            log.error(`Error executing command ${command}:`, error);
            await message.reply(`❌ Error: ${(error as Error).message}`);
        }
    }

    /**
     * Command: Create a new session.
     */
    private async cmdCreate(message: Message, args: string[]): Promise<void> {
        if (args.length === 0) {
            await message.reply(
                'Usage: `/colony create <name> [agent1,agent2,...] [--dir /path/to/project]`\n\n' +
                'Examples:\n' +
                '• `/colony create MyProject` - Create session in Colony directory\n' +
                '• `/colony create MyProject architect,developer` - With specific agents\n' +
                '• `/colony create MyProject --dir /Users/me/projects/app` - With custom working directory'
            );
            return;
        }

        const name = args[0];
        let agentIds: string[] | undefined;
        let workingDir: string | undefined;

        // Parse arguments
        for (let i = 1; i < args.length; i++) {
            if (args[i] === '--dir' && i + 1 < args.length) {
                workingDir = args[i + 1];
                i++; // Skip next arg
            } else if (!agentIds && !args[i].startsWith('--')) {
                agentIds = args[i].split(',').map(s => s.trim());
            }
        }

        // Create the session in Colony. 
        // IMPORTANT: We use skipDiscordSync: true here because cmdCreate handles 
        // its own Discord channel creation below to provide direct feedback to the user.
        const sessionId = this.colony.createSession(name, agentIds, workingDir, { skipDiscordSync: true });
        const room = this.colony.chatRoomManager.getRoom(sessionId);
        const actualAgents = room?.getInfo().participants.filter(p => p.type === 'agent').map(p => p.name) || [];

        let discordMsg = `✅ Session created: **${name}** (\`${sessionId}\`)\n` +
                        `Agents: ${actualAgents.join(', ')}\n` +
                        (workingDir ? `Working Dir: \`${workingDir}\`\n` : '');

        // Try to create Discord channel if configured
        const guildId = this.config.guild?.id || message.guildId;
        if (guildId) {
            const channelId = await this.createChannelForSession(sessionId, name, actualAgents, guildId);
            if (channelId) {
                discordMsg += `\n🔗 **Discord Channel created:** <#${channelId}>\n` +
                              `Users in this channel can chat directly with agents.`;
            } else {
                discordMsg += `\n⚠️ Failed to create Discord channel. ` +
                              `Use \`${this.config.bot.prefix} join ${name}\` to join manually.`;
            }
        } else {
            discordMsg += `\nUse \`${this.config.bot.prefix} join ${name}\` to join the session.`;
        }

        await message.reply(discordMsg);
    }

    /**
     * Create a Discord channel for an existing Colony session and bind the mapping.
     * Returns the created channel ID, or null if creation failed.
     * Used by both cmdCreate (Discord command) and DiscordManager (for Web/API-created sessions).
     */
    async createChannelForSession(
        sessionId: string,
        sessionName: string,
        agentNames: string[],
        guildId: string
    ): Promise<string | null> {
        // Re-entry guard: if this session is already mapped, skip
        if (this.mapper.getChannelBySession(sessionId)) {
            log.debug(`Session ${sessionId} already has a channel mapped, skipping creation.`);
            return this.mapper.getChannelBySession(sessionId) ?? null;
        }

        try {
            const guild = await this.client.guilds.fetch(guildId);
            const categoryId = this.config.guild?.sessionCategory;

            // Slugify name for channel name, fallback to 'session' if result is empty
            const slugified = sessionName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            const channelName = slugified || 'session';

            // Format topic
            const topic = `🤖 Colony Session | agents: ${agentNames.join(', ')} | id: ${sessionId}`;

            // Pre-register sessionId as "pending" BEFORE channel creation
            // so that channelCreate event sees the mapping and skips re-entry
            this.mapper.setPendingSession(sessionId);

            const channel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: categoryId,
                topic: topic,
                reason: `Colony Session creation: ${sessionName}`
            });

            // Bind mapping (replaces pending entry)
            await this.mapper.bind(channel.id, sessionId, {
                sessionName,
                guildId: guild.id,
                createdAt: new Date().toISOString()
            });

            log.info(`Discord channel created for session "${sessionName}" (${sessionId}): #${channel.name}`);
            return channel.id;
        } catch (error) {
            this.mapper.clearPendingSession(sessionId);
            log.error(`Failed to create Discord channel for session ${sessionId}:`, error);
            return null;
        }
    }


    /**
     * Delete the Discord channel bound to a session (cascade on session deletion from Web/API).
     * Unbinds the mapping regardless of whether channel deletion succeeds.
     */
    async deleteChannelForSession(channelId: string, sessionId: string): Promise<void> {
        try {
            const ch = await this.client.channels.fetch(channelId).catch(() => null);
            if (ch) {
                await ch.delete("Colony Session deleted").catch(err =>
                    log.warn(`Failed to delete Discord channel ${channelId}: ${err.message}`)
                );
            }
        } catch (error) {
            log.warn(`Error during channel cleanup for session ${sessionId}: ${(error as Error).message}`);
        }
        await this.mapper.unbind(channelId);
        log.info(`Unbound and deleted channel ${channelId} for session ${sessionId}`);
    }

    /**
     * Command: List all sessions.
     */
    private async cmdList(message: Message): Promise<void> {
        const rooms = this.colony.chatRoomManager.listRooms();

        if (rooms.length === 0) {
            await message.reply('No active sessions.');
            return;
        }

        const list = rooms.map(room => {
            const agents = room.participants.filter(p => p.type === 'agent').map(p => p.name).join(', ');
            return `• **${room.name}** (\`${room.id}\`)\n  Agents: ${agents}\n  Messages: ${room.messageCount}`;
        }).join('\n\n');

        await message.reply(`📋 Active Sessions:\n\n${list}`);
    }

    /**
     * Command: Join a session.
     */
    private async cmdJoin(message: Message, args: string[]): Promise<void> {
        if (args.length === 0) {
            await message.reply('Usage: `/colony join <session-id-or-name>`');
            return;
        }

        const identifier = args[0];
        let room = this.colony.chatRoomManager.getRoom(identifier);

        if (!room) {
            // Try to find by name
            const roomsByName = this.colony.chatRoomManager.getRoomByName(identifier);
            if (roomsByName.length === 1) {
                room = roomsByName[0];
            } else if (roomsByName.length > 1) {
                await message.reply(`❌ Multiple sessions found with the name "${identifier}". Please use the exact Session ID instead.`);
                return;
            }
        }

        if (!room) {
            await message.reply(`❌ Session not found: ${identifier}`);
            return;
        }

        const sessionId = room.id;

        // Add user as participant
        this.colony.joinSession(sessionId, {
            id: message.author.id,
            type: 'human',
            name: message.author.username,
        });

        // Store user session
        this.userSessions.set(message.author.id, {
            userId: message.author.id,
            sessionId,
            channelId: message.channelId,
            joinedAt: new Date(),
        });

        await message.reply(
            `✅ Joined session **${room.name}**\n\n` +
            `You can now send messages directly to chat with agents.\n` +
            `Use \`@agent-name\` to mention specific agents.`
        );
    }

    /**
     * Command: Leave current session.
     */
    private async cmdLeave(message: Message): Promise<void> {
        const userSession = this.userSessions.get(message.author.id);

        if (!userSession?.sessionId) {
            await message.reply('❌ You are not in any session.');
            return;
        }

        this.userSessions.delete(message.author.id);
        await message.reply('✅ Left the session.');
    }

    /**
     * Command: Show current session.
     */
    private async cmdCurrent(message: Message): Promise<void> {
        const userSession = this.userSessions.get(message.author.id);

        if (!userSession?.sessionId) {
            await message.reply('You are not in any session.');
            return;
        }

        const room = this.colony.chatRoomManager.getRoom(userSession.sessionId);
        if (!room) {
            await message.reply('❌ Session not found.');
            return;
        }

        const info = room.getInfo();
        const agents = info.participants
            .filter(p => p.type === 'agent')
            .map(p => {
                const healthStr = p.sessionHealth ? ` (${p.sessionHealth.label}, ${(p.sessionHealth.fillRatio * 100).toFixed(0)}%)` : '';
                return `${p.name}${healthStr}`;
            })
            .join(', ');

        await message.reply(
            `📍 Current Session\n\n` +
            `Name: **${info.name}**\n` +
            `ID: \`${info.id}\`\n` +
            `Agents: ${agents}\n` +
            `Messages: ${info.messageCount}\n` +
            `Joined: ${userSession.joinedAt.toLocaleString()}`
        );
    }

    /**
     * Command: Stop/Pause current session.
     */
    private async cmdStop(message: Message): Promise<void> {
        const userSession = this.userSessions.get(message.author.id);

        if (!userSession?.sessionId) {
            await message.reply('You are not in any session.');
            return;
        }

        try {
            this.colony.chatRoomManager.stopRoom(userSession.sessionId);
            await message.reply('🛑 All generating agent threads in this session have been stopped.');
        } catch (error) {
            await message.reply(`❌ Failed to stop agents: ${(error as Error).message}`);
        }
    }

    /**
     * Command: Start/Resume current session.
     */
    private async cmdStart(message: Message): Promise<void> {
        const userSession = this.userSessions.get(message.author.id);

        if (!userSession?.sessionId) {
            await message.reply('You are not in any session.');
            return;
        }

        try {
            await message.reply('▶ The session is already active. Global pausing was removed.');
        } catch (error) {
            await message.reply(`❌ Failed to resume session: ${(error as Error).message}`);
        }
    }

    /**
     * Command: Show system status.
     */
    private async cmdStatus(message: Message): Promise<void> {
        const status = this.colony.getStatus();
        const rooms = (status as any).rooms as Array<any>;
        const agents = (status as any).agents as Array<{ id: string; name: string; status: string }>;

        // Build a mapping of agent health from active rooms
        const healthMap = new Map<string, string>();
        for (const room of rooms) {
            for (const p of room.participants) {
                if (p.type === 'agent' && p.sessionHealth) {
                    healthMap.set(p.id, ` (${p.sessionHealth.label}, ${(p.sessionHealth.fillRatio * 100).toFixed(0)}%) in ${room.name}`);
                }
            }
        }

        await message.reply(
            `📊 Colony Status\n\n` +
            `**Active Sessions:** ${rooms.length}\n` +
            `**Online Agents:** ${agents.filter(a => a.status === 'idle').length}/${agents.length}\n\n` +
            `**Agents:**\n${agents.map(a => `• ${a.name}: ${a.status}${healthMap.get(a.id) || ''}`).join('\n')}`
        );
    }

    /**
     * Command: List all agents.
     */
    private async cmdAgents(message: Message): Promise<void> {
        const status = this.colony.getStatus();
        const agents = (status as any).agents as Array<{ id: string; name: string; role: string; status: string }>;

        const list = agents.map(a =>
            `• **${a.name}** (\`${a.id}\`)\n  Role: ${a.role}\n  Status: ${a.status}`
        ).join('\n\n');

        await message.reply(`🤖 Available Agents:\n\n${list}`);
    }

    /**
     * Command: Delete a session.
     */
    private async cmdDelete(message: Message, args: string[]): Promise<void> {
        if (args.length === 0) {
            await message.reply('Usage: `/colony delete <session-id-or-name>`');
            return;
        }

        const identifier = args[0];
        let room = this.colony.chatRoomManager.getRoom(identifier);

        if (!room) {
            // Try to find by name
            const roomsByName = this.colony.chatRoomManager.getRoomByName(identifier);
            if (roomsByName.length === 1) {
                room = roomsByName[0];
            } else if (roomsByName.length > 1) {
                await message.reply(`❌ Multiple sessions found with the name "${identifier}". Please use the exact Session ID instead.`);
                return;
            }
        }

        if (!room) {
            await message.reply(`❌ Session not found: \`${identifier}\``);
            return;
        }

        const sessionId = room.id;
        const roomName = room.getInfo().name;

        try {
            const deleted = await this.colony.chatRoomManager.deleteRoom(sessionId);
            if (deleted) {
                // Remove from user sessions if they were in this room
                for (const [userId, userSession] of this.userSessions.entries()) {
                    if (userSession.sessionId === sessionId) {
                        this.userSessions.delete(userId);
                    }
                }

                // Unbind mapping
                const channelId = this.mapper.getChannelBySession(sessionId);
                if (channelId) {
                    // Try to delete Discord channel before unbinding
                    try {
                        const ch = await this.client.channels.fetch(channelId).catch(() => null);
                        if (ch) {
                            await ch.delete('Colony Session deleted').catch(err => 
                                log.warn(`Failed to delete Discord channel ${channelId}: ${err.message}`)
                            );
                        }
                    } catch (error) {
                        log.warn(`Error during channel cleanup: ${(error as Error).message}`);
                    }

                    await this.mapper.unbind(channelId);
                    log.info(`Unbound channel ${channelId} for deleted session ${sessionId}`);
                }

                await message.reply(`✅ Session deleted: **${roomName}** (\`${sessionId}\`)`);
            } else {
                await message.reply(`❌ Failed to delete session: \`${sessionId}\``);
            }
        } catch (error) {
            await message.reply(`❌ Error deleting session: ${(error as Error).message}`);
        }
    }

    /**
     * Command: Update agents in a session.
     */
    private async cmdUpdate(message: Message, args: string[]): Promise<void> {
        // 1. Identify session
        const mappedSessionId = this.mapper.getSessionByChannel(message.channelId);
        const userSession = this.userSessions.get(message.author.id);
        const sessionId = mappedSessionId || userSession?.sessionId;

        if (!sessionId) {
            await message.reply('❌ You are not in a session. Use `/colony join <name>` first or use this command in a session channel.');
            return;
        }

        if (args.length === 0) {
            await message.reply('Usage: `/colony update <agent1,agent2,...>`');
            return;
        }

        const agentIds = args[0].split(',').map(s => s.trim()).filter(Boolean);
        
        try {
            await this.colony.updateSessionAgents(sessionId, agentIds);
            const room = this.colony.chatRoomManager.getRoom(sessionId);
            const actualAgents = room?.getInfo().participants.filter(p => p.type === 'agent').map(p => p.name) || [];
            
            await message.reply(`✅ Session agents updated.\n**Current Agents**: ${actualAgents.join(', ')}`);
        } catch (error) {
            await message.reply(`❌ Failed to update agents: ${(error as Error).message}`);
        }
    }

    /**
     * Command: Show help.
     */
    private async cmdHelp(message: Message): Promise<void> {
        const prefix = this.config.bot.prefix;
        await message.reply(
            `**Colony Discord Bot Commands**\n\n` +
            `**Session Management:**\n` +
            `\`${prefix} create <name> [agents] [--dir /path]\` - Create a new session\n` +
            `\`${prefix} list\` - List all sessions\n` +
            `\`${prefix} join <name|id>\` - Join a session\n` +
            `\`${prefix} leave\` - Leave current session\n` +
            `\`${prefix} delete <name|id>\` - Delete a session\n` +
            `\`${prefix} update <agent1,agent2,...>\` - Update session agents\n` +
            `\`${prefix} current\` - Show current session\n` +
            `\`${prefix} stop\` - Pause current session\n` +
            `\`${prefix} start\` - Resume current session\n\n` +
            `**Status:**\n` +
            `\`${prefix} status\` - Show system status\n` +
            `\`${prefix} agents\` - List all agents\n\n` +
            `**Messaging:**\n` +
            `After joining a session, send messages directly to chat with agents.\n` +
            `Use \`@agent-name\` to mention specific agents.`
        );
    }

    /**
     * Handle Discord channel deletion.
     */
    private async handleChannelDelete(channel: any): Promise<void> {
        const channelId = channel.id;
        const sessionId = this.mapper.getSessionByChannel(channelId);

        if (sessionId) {
            log.info(`Channel ${channelId} deleted. Triggering cascade deletion for session ${sessionId}`);
            
            try {
                // Delete the session from Colony
                await this.colony.chatRoomManager.deleteRoom(sessionId);
                
                // Unbind the mapping
                await this.mapper.unbind(channelId);
                
                log.info(`Successfully deleted session ${sessionId} after channel ${channelId} was deleted.`);
            } catch (error) {
                log.error(`Failed to delete session ${sessionId} during channel ${channelId} deletion:`, error);
            }
        }
    }

    /**
     * Handle Discord channel creation (Direction B).
     */
    private async handleChannelCreate(channel: any): Promise<void> {
        // 1. Filter only Guild Text channels
        if (channel.type !== ChannelType.GuildText) return;

        const textChannel = channel as TextChannel;

        // 2. Check if auto-creation is enabled and in target category
        const categoryId = this.config.guild?.sessionCategory;
        const autoCreate = this.config.guild?.autoCreateOnChannelCreate === true;

        if (!autoCreate || !categoryId || textChannel.parentId !== categoryId) {
            return;
        }

        // 3. Re-entry prevention: check if already bound (Direction A creates channel then binds)
        if (this.mapper.getSessionByChannel(textChannel.id)) {
            log.debug(`Channel ${textChannel.id} already mapped, skipping auto-create.`);
            return;
        }

        // 3b. Re-entry prevention: check if this channel was created by Direction A (pending guard)
        // We detect Direction A channels by their topic containing '| id: <sessionId>'
        const topicSessionMatch = textChannel.topic?.match(/\| id: ([a-f0-9-]{36})/);
        if (topicSessionMatch) {
            const embeddedSessionId = topicSessionMatch[1];
            if (this.mapper.isSessionPending(embeddedSessionId) || this.mapper.getChannelBySession(embeddedSessionId)) {
                log.debug(`Channel ${textChannel.id} was created by Direction A (session ${embeddedSessionId}), skipping Direction B.`);
                return;
            }
        }

        log.info(`New channel detected in session category: "${textChannel.name}" (${textChannel.id}). Triggering auto-creation.`);

        try {
            // 4. Parse agents from topic
            let agentIds = this.parseAgentsFromTopic(textChannel.topic);
            if (!agentIds) {
                agentIds = this.config.guild?.defaultAgents;
            }

            // 4b. Parse working directory from topic
            const workingDir = this.parseWorkdirFromTopic(textChannel.topic);

            // 5. Create Colony session
            // IMPORTANT: Use skipDiscordSync: true to prevent Direction A from triggering
            // and creating yet another channel, which would cause an infinite loop.
            const sessionName = textChannel.name;
            const sessionId = this.colony.createSession(sessionName, agentIds, workingDir, { skipDiscordSync: true });
            
            log.info(`Auto-created session "${sessionName}" (${sessionId}) for channel ${textChannel.id}`);

            // 6. Bind mapping
            await this.mapper.bind(textChannel.id, sessionId, {
                sessionName,
                guildId: textChannel.guildId,
                createdAt: new Date().toISOString()
            });

            // 7. Update topic with sessionId
            const room = this.colony.chatRoomManager.getRoom(sessionId);
            const actualAgents = room?.getInfo().participants.filter(p => p.type === 'agent').map(p => p.name) || [];
            
            const idSuffix = ` | id: ${sessionId}`;
            let newTopic = textChannel.topic || `🤖 Colony Session | agents: ${actualAgents.join(', ')}`;
            
            if (!newTopic.includes(idSuffix)) {
                newTopic += idSuffix;
                await textChannel.setTopic(newTopic).catch(err => 
                    log.warn(`Failed to update topic for channel ${textChannel.id}: ${err.message}`)
                );
            }

            // 8. Send welcome message
            await textChannel.send(
                `✅ **Colony Session Joined**\n` +
                `This channel is now bound to session: **${sessionName}**\n` +
                `Agents: ${actualAgents.join(', ')}\n` +
                `ID: \`${sessionId}\`\n\n` +
                `*You can now chat directly with the agents in this channel.*`
            ).catch(err => log.warn(`Failed to send welcome message to ${textChannel.id}: ${err.message}`));

        } catch (error) {
            log.error(`Error during auto-creation for channel ${textChannel.id}:`, error);
        }
    }

    /**
     * Parse agents from topic string.
     * Format: "agents: architect, developer" or "agents: architect"
     */
    private parseAgentsFromTopic(topic: string | null): string[] | undefined {
        if (!topic) return undefined;

        // Match "agents: agent1, agent2" (case insensitive)
        const match = topic.match(/agents:\s*([^|]+)/i);
        if (match && match[1]) {
            const agents = match[1].split(',').map(s => s.trim()).filter(Boolean);
            return agents.length > 0 ? agents : undefined;
        }

        return undefined;
    }

    /**
     * Parse working directory from topic string.
     * Format: "workdir: /path/to/project" or "workdir:/path/to/project"
     * Returns the validated path if it's in the whitelist, otherwise undefined.
     * Creates the directory if it doesn't exist.
     */
    private parseWorkdirFromTopic(topic: string | null): string | undefined {
        if (!topic) return undefined;

        // Match "workdir: /path/to/project" (case insensitive)
        const match = topic.match(/workdir:\s*([^|]+)/i);
        if (!match || !match[1]) {
            return undefined;
        }

        const requestedPath = match[1].trim();
        if (!requestedPath) {
            return undefined;
        }

        // Validate against whitelist
        const allowedWorkdirs = this.config.guild?.allowedWorkdirs;
        if (!allowedWorkdirs || allowedWorkdirs.length === 0) {
            log.warn(`Working directory "${requestedPath}" requested but no whitelist configured. Ignoring.`);
            return undefined;
        }

        // Check if the requested path is in the whitelist (exact match or subdirectory)
        const isAllowed = allowedWorkdirs.some(allowed => {
            // Normalize paths for comparison
            const normalizedAllowed = allowed.replace(/\/$/, '');
            const normalizedRequested = requestedPath.replace(/\/$/, '');

            // Allow exact match or subdirectory
            return normalizedRequested === normalizedAllowed ||
                   normalizedRequested.startsWith(normalizedAllowed + '/');
        });

        if (!isAllowed) {
            log.warn(`Working directory "${requestedPath}" not in whitelist. Allowed: ${allowedWorkdirs.join(', ')}`);
            return undefined;
        }

        // Create directory if it doesn't exist
        try {
            const fs = require('fs');
            if (!fs.existsSync(requestedPath)) {
                fs.mkdirSync(requestedPath, { recursive: true });
                log.info(`Created working directory: "${requestedPath}"`);
            }
        } catch (error) {
            log.error(`Failed to create working directory "${requestedPath}":`, error);
            return undefined;
        }

        log.info(`Working directory "${requestedPath}" validated successfully.`);
        return requestedPath;
    }

    /**
     * Update Discord channel topic with new agents.
     */
    async updateChannelTopic(sessionId: string, agentNames: string[]): Promise<void> {
        const channelId = this.mapper.getChannelBySession(sessionId);
        if (!channelId) return;

        try {
            const channel = await this.client.channels.fetch(channelId);
            if (channel && channel.type === ChannelType.GuildText) {
                const textChannel = channel as TextChannel;
                
                // Reconstruct topic
                const idSuffix = ` | id: ${sessionId}`;
                const baseTopic = textChannel.topic?.split('|')[0].trim() || '🤖 Colony Session';
                const newTopic = `${baseTopic} | agents: ${agentNames.join(', ')}${idSuffix}`;
                
                if (textChannel.topic !== newTopic) {
                    await textChannel.setTopic(newTopic);
                    log.info(`Updated Discord topic for channel ${channelId}`);
                }
            }
        } catch (error) {
            log.warn(`Failed to update Discord topic for session ${sessionId}:`, error);
        }
    }

    /**
     * Handle manual Discord topic changes.
     */
    private async handleChannelUpdate(oldChannel: TextChannel, newChannel: TextChannel): Promise<void> {
        // Only care about topic changes
        if (oldChannel.topic === newChannel.topic) return;

        const sessionId = this.mapper.getSessionByChannel(newChannel.id);
        if (!sessionId) return;

        // Extract agents from new topic
        const newAgents = this.parseAgentsFromTopic(newChannel.topic);
        if (!newAgents) return;

        // Compare with current state in Colony
        const room = this.colony.chatRoomManager.getRoom(sessionId);
        if (!room) return;

        const currentAgents = room.getInfo().participants
            .filter(p => p.type === 'agent')
            .map(p => p.id); // ChatRoomManager.updateRoomAgents matches against IDs or names

        // Simple check if lists are identical
        if (JSON.stringify([...newAgents].sort()) === JSON.stringify([...currentAgents].sort())) {
            return;
        }

        log.info(`Topic change detected for channel ${newChannel.id}. Syncing agents to session ${sessionId}.`);
        
        try {
            // Update session agents (this will also trigger a topic update back, but should be caught by re-entry check)
            await this.colony.updateSessionAgents(sessionId, newAgents);
        } catch (error) {
            log.error(`Failed to sync agents from topic for channel ${newChannel.id}:`, error);
        }
    }

    /**
     * Forward Discord message to Colony.
     */
    private async forwardToColony(message: Message, userSession: UserSession): Promise<void> {
        try {
            // Check if room is paused before processing mentions
            if (userSession.sessionId) {
                const room = this.colony.chatRoomManager.getRoom(userSession.sessionId);
                if (room?.getIsPaused()) {
                    await message.reply('⏸ Current session is paused. Use `/colony start` to resume.');
                    return;
                }
            }

            // Parse mentions (@agent-name)
            const mentions: string[] = [];
            const mentionRegex = /@(\S+)/g;
            let match;
            while ((match = mentionRegex.exec(message.content)) !== null) {
                mentions.push(match[1]);
            }

            // Send to Colony, tagging as fromDiscord to prevent echo back to Discord
            const room = this.colony.chatRoomManager.getRoom(userSession.sessionId!);
            if (!room) throw new Error(`Room not found: ${userSession.sessionId}`);
            room.sendHumanMessage(
                message.author.id,
                message.content,
                mentions.length > 0 ? mentions : undefined,
                { fromDiscord: true }
            );

            // React to show message was received
            await message.react('✅');
        } catch (error) {
            log.error('Error forwarding message to Colony:', error);
            await message.reply(`❌ Failed to send message: ${(error as Error).message}`);
        }
    }

    /**
     * Split a long message into chunks that fit Discord's 2000 character limit.
     * Tries to split at natural boundaries (code blocks, paragraphs) to preserve formatting.
     */
    private splitMessage(content: string, maxLength: number = 1900): string[] {
        if (content.length <= maxLength) {
            return [content];
        }

        const chunks: string[] = [];
        let remaining = content;

        while (remaining.length > 0) {
            if (remaining.length <= maxLength) {
                chunks.push(remaining);
                break;
            }

            // Try to find a good split point
            let splitIndex = maxLength;

            // Look for code block boundary (```)
            const codeBlockEnd = remaining.lastIndexOf('```', maxLength);
            if (codeBlockEnd > maxLength * 0.5) {
                // Find the end of this code block
                const nextCodeBlock = remaining.indexOf('```', codeBlockEnd + 3);
                if (nextCodeBlock !== -1 && nextCodeBlock <= maxLength) {
                    splitIndex = nextCodeBlock + 3;
                } else {
                    splitIndex = codeBlockEnd;
                }
            } else {
                // Look for paragraph break (\n\n)
                const paragraphBreak = remaining.lastIndexOf('\n\n', maxLength);
                if (paragraphBreak > maxLength * 0.5) {
                    splitIndex = paragraphBreak + 2;
                } else {
                    // Look for single line break
                    const lineBreak = remaining.lastIndexOf('\n', maxLength);
                    if (lineBreak > maxLength * 0.5) {
                        splitIndex = lineBreak + 1;
                    } else {
                        // Look for space
                        const space = remaining.lastIndexOf(' ', maxLength);
                        if (space > maxLength * 0.5) {
                            splitIndex = space + 1;
                        }
                        // Otherwise use maxLength (hard cut)
                    }
                }
            }

            chunks.push(remaining.substring(0, splitIndex).trim());
            remaining = remaining.substring(splitIndex).trim();
        }

        return chunks;
    }

    /**
     * Send a message to Discord channel.
     * Automatically splits messages that exceed Discord's 2000 character limit.
     */
    async sendToDiscord(channelId: string, content: string): Promise<void> {
        if (!this.ready) {
            log.warn('Discord bot not ready, cannot send message');
            return;
        }

        log.debug(`Attempting to send message to Discord channel ${channelId} (length: ${content.length})`);

        try {
            const channel = await this.client.channels.fetch(channelId);
            if (!channel || !channel.isTextBased()) {
                log.warn(`Channel ${channelId} not found or not text-based`);
                return;
            }

            const textChannel = channel as TextChannel;

            // Split message if needed
            const chunks = this.splitMessage(content);

            if (chunks.length > 1) {
                log.info(`Message split into ${chunks.length} chunks due to length (${content.length} chars)`);
            }

            // Send each chunk with pagination markers
            for (let i = 0; i < chunks.length; i++) {
                let chunkContent = chunks[i];

                // Add pagination marker if multiple chunks
                if (chunks.length > 1) {
                    chunkContent = `**[${i + 1}/${chunks.length}]**\n${chunkContent}`;
                }

                await textChannel.send(chunkContent);
                log.debug(`Sent chunk ${i + 1}/${chunks.length} to Discord channel ${channelId}`);

                // Small delay between chunks to avoid rate limiting
                if (i < chunks.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            log.info(`Message sent to Discord channel ${channelId} successfully (${chunks.length} chunk(s))`);
        } catch (error) {
            log.error(`Error sending message to Discord channel ${channelId}:`, error);
        }
    }

    /**
     * Start the Discord bot.
     */
    async start(): Promise<void> {
        log.info('Starting Discord bot...');
        await new Promise<void>((resolve) => {
            this.client.once('ready', () => resolve());
            this.client.login(this.config.bot.token);
        });
    }

    /**
     * Stop the Discord bot.
     */
    async stop(): Promise<void> {
        log.info('Stopping Discord bot...');
        this.client.destroy();
        this.ready = false;
    }

    /**
     * Get user session.
     */
    getUserSession(userId: string): UserSession | undefined {
        return this.userSessions.get(userId);
    }

    /**
     * Get all user sessions for a room.
     */
    getUserSessionsForRoom(roomId: string): UserSession[] {
        const sessions: UserSession[] = [];
        for (const session of this.userSessions.values()) {
            if (session.sessionId === roomId) {
                sessions.push(session);
            }
        }
        return sessions;
    }

    /**
     * Set bridge reference.
     */
    setBridge(bridge: any): void {
        this.bridge = bridge;
    }
}
