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

        const sessionId = this.colony.createSession(name, agentIds, workingDir);
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
        try {
            const guild = await this.client.guilds.fetch(guildId);
            const categoryId = this.config.guild?.sessionCategory;

            // Slugify name for channel name
            const channelName = sessionName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

            // Format topic
            const topic = `🤖 Colony Session | agents: ${agentNames.join(', ')} | id: ${sessionId}`;

            const channel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: categoryId,
                topic: topic,
                reason: `Colony Session creation: ${sessionName}`
            });

            // Bind mapping
            await this.mapper.bind(channel.id, sessionId, {
                sessionName,
                guildId: guild.id,
                createdAt: new Date().toISOString()
            });

            log.info(`Discord channel created for session "${sessionName}" (${sessionId}): #${channel.name}`);
            return channel.id;
        } catch (error) {
            log.error(`Failed to create Discord channel for session ${sessionId}:`, error);
            return null;
        }
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

        log.info(`New channel detected in session category: "${textChannel.name}" (${textChannel.id}). Triggering auto-creation.`);

        try {
            // 4. Parse agents from topic
            let agentIds = this.parseAgentsFromTopic(textChannel.topic);
            if (!agentIds) {
                agentIds = this.config.guild?.defaultAgents;
            }

            // 5. Create Colony session
            // Discord channel name is already slugified, use it as session name
            const sessionName = textChannel.name;
            const sessionId = this.colony.createSession(sessionName, agentIds);
            
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

            // Send to Colony
            this.colony.sendMessage(
                userSession.sessionId!,
                message.author.id,
                message.content,
                mentions.length > 0 ? mentions : undefined
            );

            // React to show message was received
            await message.react('✅');
        } catch (error) {
            log.error('Error forwarding message to Colony:', error);
            await message.reply(`❌ Failed to send message: ${(error as Error).message}`);
        }
    }

    /**
     * Send a message to Discord channel.
     */
    async sendToDiscord(channelId: string, content: string): Promise<void> {
        if (!this.ready) {
            log.warn('Discord bot not ready, cannot send message');
            return;
        }

        try {
            const channel = await this.client.channels.fetch(channelId);
            if (channel && channel.isTextBased()) {
                await (channel as TextChannel).send(content);
            }
        } catch (error) {
            log.error(`Error sending message to Discord channel ${channelId}:`, error);
        }
    }

    /**
     * Start the Discord bot.
     */
    async start(): Promise<void> {
        log.info('Starting Discord bot...');
        await this.client.login(this.config.bot.token);
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
