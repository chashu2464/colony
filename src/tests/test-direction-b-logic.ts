import { DiscordBot } from '../discord/DiscordBot.js';
import { ChannelType } from 'discord.js';

async function testDirectionBLogic() {
    console.log('=== Integration Logic Test: Direction B ===');

    const categoryId = '1234567890';
    const mockConfig = {
        bot: { prefix: '/' },
        guild: {
            sessionCategory: categoryId,
            autoCreateOnChannelCreate: true
        }
    };

    let sessionCreated = false;
    let bound = false;
    let topicUpdated = false;
    let messageSent = false;

    const mockColony = {
        createSession: (name: string, agents: string[]) => {
            console.log(`Mock: Colony creating session "${name}" with agents: ${agents}`);
            sessionCreated = true;
            return 'new-session-id';
        },
        chatRoomManager: {
            getRoom: () => ({
                getInfo: () => ({
                    participants: [
                        { type: 'agent', name: 'architect' },
                        { type: 'agent', name: 'developer' }
                    ]
                })
            })
        }
    };

    const mockMapper = {
        getSessionByChannel: () => undefined,
        bind: () => {
            console.log('Mock: Mapping bound');
            bound = true;
            return Promise.resolve();
        }
    };

    const bot = new DiscordBot(mockConfig as any, mockColony as any, mockMapper as any) as any;

    const mockChannel = {
        id: 'channel-id',
        name: 'test-room',
        type: ChannelType.GuildText,
        parentId: categoryId,
        topic: 'agents: architect, developer',
        guildId: 'guild-id',
        setTopic: (topic: string) => {
            console.log(`Mock: Channel topic updated to "${topic}"`);
            topicUpdated = topic.includes('id: new-session-id');
            return Promise.resolve();
        },
        send: (msg: string) => {
            console.log(`Mock: Message sent: ${msg}`);
            messageSent = true;
            return Promise.resolve();
        }
    };

    await bot.handleChannelCreate(mockChannel);

    if (sessionCreated && bound && topicUpdated && messageSent) {
        console.log('\n✓ ALL LOGIC STEPS PASSED');
        process.exit(0);
    } else {
        console.error('\n✗ LOGIC TEST FAILED');
        console.log({ sessionCreated, bound, topicUpdated, messageSent });
        process.exit(1);
    }
}

testDirectionBLogic().catch(err => {
    console.error(err);
    process.exit(1);
});
