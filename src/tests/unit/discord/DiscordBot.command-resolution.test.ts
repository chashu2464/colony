import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscordBot } from '../../../discord/DiscordBot.js';

vi.mock('discord.js', () => {
    class MockClient {
        public channels = { fetch: vi.fn() };
        public guilds = { fetch: vi.fn() };
        public user = { tag: 'mock-bot#0001' };
        public on = vi.fn();
        public login = vi.fn();
        public destroy = vi.fn();
    }

    return {
        Client: MockClient,
        GatewayIntentBits: {
            Guilds: 1,
            GuildMessages: 2,
            MessageContent: 4,
            DirectMessages: 8,
        },
        ChannelType: {
            GuildText: 0,
        },
    };
});

function createHarness() {
    const roomById = new Map<string, any>();
    const roomByName = new Map<string, any[]>();
    const deleteRoom = vi.fn().mockResolvedValue(true);
    const stopRoom = vi.fn();

    const colony = {
        chatRoomManager: {
            getRoom: vi.fn((id: string) => roomById.get(id)),
            getRoomByName: vi.fn((name: string) => roomByName.get(name) ?? []),
            deleteRoom,
            stopRoom,
        },
        updateSessionAgents: vi.fn().mockResolvedValue(undefined),
    };

    const mapper = {
        getSessionByChannel: vi.fn().mockReturnValue(undefined),
        getChannelBySession: vi.fn().mockReturnValue(undefined),
        unbind: vi.fn().mockResolvedValue(undefined),
    };

    const config = {
        bot: {
            token: 't',
            prefix: '/colony',
        },
    };

    const bot = new DiscordBot(config as any, colony as any, mapper as any) as any;

    const message = {
        author: { id: 'u1', username: 'alice', bot: false },
        channelId: 'ch-1',
        guildId: 'g-1',
        reply: vi.fn().mockResolvedValue(undefined),
        content: '',
    } as any;

    return {
        bot,
        message,
        colony,
        mapper,
        roomById,
        roomByName,
        deleteRoom,
        stopRoom,
    };
}

describe('DiscordBot command session resolution', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('prefers mapped channel session over user session', () => {
        const { bot, mapper } = createHarness();
        mapper.getSessionByChannel.mockReturnValue('mapped-session');
        bot.userSessions.set('u1', {
            userId: 'u1',
            sessionId: 'joined-session',
            channelId: 'legacy-channel',
            joinedAt: new Date('2026-03-21T08:00:00.000Z'),
        });

        const result = bot.resolveSessionIdForCommand({
            author: { id: 'u1' },
            channelId: 'ch-1',
        } as any);

        expect(result).toEqual({
            sessionId: 'mapped-session',
            source: 'mapped_channel',
        });
    });

    it('supports /colony current in mapped channels without join', async () => {
        const { bot, message, mapper, roomById } = createHarness();
        mapper.getSessionByChannel.mockReturnValue('s-1');
        roomById.set('s-1', {
            id: 's-1',
            getInfo: () => ({
                id: 's-1',
                name: 'Mapped Room',
                messageCount: 3,
                participants: [{ type: 'agent', name: 'architect' }],
            }),
        });

        await bot.cmdCurrent(message);

        expect(message.reply).toHaveBeenCalledTimes(1);
        const reply = message.reply.mock.calls[0][0] as string;
        expect(reply).toContain('Mapped Room');
        expect(reply).toContain('`s-1`');
        expect(reply).toContain('Joined: via mapped Discord channel');
    });

    it('returns not-found when mapped session points to missing room for /colony current', async () => {
        const { bot, message, mapper } = createHarness();
        mapper.getSessionByChannel.mockReturnValue('ghost-session');

        await bot.cmdCurrent(message);

        expect(message.reply).toHaveBeenCalledWith('❌ Session not found.');
    });

    it('returns mapped-channel guidance for /colony leave', async () => {
        const { bot, message, mapper } = createHarness();
        mapper.getSessionByChannel.mockReturnValue('s-1');

        await bot.cmdLeave(message);

        expect(message.reply).toHaveBeenCalledWith(
            '✅ This channel is already bound to a session. `/colony leave` is only needed for sessions joined via `/colony join`.'
        );
    });

    it('rejects /colony delete with no args in an unmapped channel', async () => {
        const { bot, message, mapper, deleteRoom } = createHarness();
        mapper.getSessionByChannel.mockReturnValue(undefined);

        await bot.cmdDelete(message, []);

        expect(deleteRoom).not.toHaveBeenCalled();
        expect(message.reply).toHaveBeenCalledWith(
            '❌ This channel is not mapped to a session. Use `/colony delete <session-id-or-name>` to avoid accidental deletion.'
        );
    });

    it('deletes mapped session with /colony delete and no args', async () => {
        const { bot, message, mapper, roomById, deleteRoom } = createHarness();
        mapper.getSessionByChannel.mockReturnValue('s-2');
        roomById.set('s-2', {
            id: 's-2',
            getInfo: () => ({ name: 'Session Two' }),
        });

        await bot.cmdDelete(message, []);

        expect(deleteRoom).toHaveBeenCalledWith('s-2');
        expect(message.reply).toHaveBeenCalledWith('✅ Session deleted: **Session Two** (`s-2`)');
    });

    it('rejects /colony delete when mapped session no longer exists', async () => {
        const { bot, message, mapper, deleteRoom } = createHarness();
        mapper.getSessionByChannel.mockReturnValue('stale-session');

        await bot.cmdDelete(message, []);

        expect(deleteRoom).not.toHaveBeenCalled();
        expect(message.reply).toHaveBeenCalledWith('❌ Session not found for mapped channel: `stale-session`');
    });

    it('reports duplicate room names when deleting by identifier', async () => {
        const { bot, message, roomByName, deleteRoom } = createHarness();
        roomByName.set('same', [
            { id: 's-1', getInfo: () => ({ name: 'same' }) },
            { id: 's-2', getInfo: () => ({ name: 'same' }) },
        ]);

        await bot.cmdDelete(message, ['same']);

        expect(deleteRoom).not.toHaveBeenCalled();
        expect(message.reply).toHaveBeenCalledWith(
            '❌ Multiple sessions found with the name "same". Please use the exact Session ID instead.'
        );
    });

    it('stops mapped session via /colony stop', async () => {
        const { bot, message, mapper, stopRoom } = createHarness();
        mapper.getSessionByChannel.mockReturnValue('s-stop');

        await bot.cmdStop(message);

        expect(stopRoom).toHaveBeenCalledWith('s-stop');
        expect(message.reply).toHaveBeenCalledWith('🛑 All generating agent threads in this session have been stopped.');
    });

    it('surfaces deleteRoom errors in /colony delete response', async () => {
        const { bot, message, roomById, deleteRoom } = createHarness();
        deleteRoom.mockRejectedValueOnce(new Error('permission denied'));
        roomById.set('s-err', {
            id: 's-err',
            getInfo: () => ({ name: 'Err Room' }),
        });

        await bot.cmdDelete(message, ['s-err']);

        expect(message.reply).toHaveBeenCalledWith('❌ Error deleting session: permission denied');
    });

    it('shows joined timestamp when resolved from user session', async () => {
        const { bot, message, roomById } = createHarness();
        bot.userSessions.set('u1', {
            userId: 'u1',
            sessionId: 'joined-room',
            channelId: 'legacy-channel',
            joinedAt: new Date('2026-03-21T08:00:00.000Z'),
        });
        roomById.set('joined-room', {
            id: 'joined-room',
            getInfo: () => ({
                id: 'joined-room',
                name: 'Joined Room',
                messageCount: 1,
                participants: [{ type: 'agent', name: 'developer' }],
            }),
        });

        await bot.cmdCurrent(message);

        const reply = message.reply.mock.calls[0][0] as string;
        expect(reply).toContain('Joined:');
        expect(reply).not.toContain('via mapped Discord channel');
    });
});
