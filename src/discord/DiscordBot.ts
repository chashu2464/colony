// ── Colony: Discord Bot ──────────────────────────────────
// Discord bot for Colony integration.

import { Client, GatewayIntentBits, Message, TextChannel } from 'discord.js';
import { Logger } from '../utils/Logger.js';
import type { DiscordConfig, UserSession } from './types.js';
import type { Colony } from '../Colony.js';

const log = new Logger('DiscordBot');

export class DiscordBot {
    private client: Client;
    private config: DiscordConfig;
    private colony: Colony;
    private userSessions = new Map<string, UserSession>();
    private ready = false;
    private bridge?: any; // Will be set by DiscordManager

    constructor(config: DiscordConfig, colony: Colony) {
        this.config = config;
        this.colony = colony;

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

        // Handle regular messages (if user is in a session)
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

        await message.reply(
            `✅ Session created\n` +
            `ID: \`${sessionId}\`\n` +
            `Name: ${name}\n` +
            `Agents: ${room?.getInfo().participants.filter(p => p.type === 'agent').map(p => p.name).join(', ')}\n` +
            (workingDir ? `Working Dir: \`${workingDir}\`\n` : '') +
            `\nUse \`${this.config.bot.prefix} join ${name}\` to join the session.`
        );
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
        const agents = info.participants.filter(p => p.type === 'agent').map(p => p.name).join(', ');

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
        const rooms = (status as any).rooms as Array<{ name: string; messageCount: number }>;
        const agents = (status as any).agents as Array<{ name: string; status: string }>;

        await message.reply(
            `📊 Colony Status\n\n` +
            `**Active Sessions:** ${rooms.length}\n` +
            `**Online Agents:** ${agents.filter(a => a.status === 'idle').length}/${agents.length}\n\n` +
            `**Agents:**\n${agents.map(a => `• ${a.name}: ${a.status}`).join('\n')}`
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
