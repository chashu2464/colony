import { describe, expect, it, vi } from 'vitest';
import { ChatRoom } from '../../conversation/ChatRoom.js';
import { MessageBus } from '../../conversation/MessageBus.js';

function makeAgent(id: string, name: string, routable: boolean) {
    return {
        id,
        name,
        config: {
            id,
            name,
            model: { primary: 'codex' as const },
            personality: `${name} personality`,
            routable,
        },
        receiveMessage: vi.fn().mockResolvedValue(undefined),
        getSessionHealth: vi.fn().mockReturnValue(undefined),
    };
}

describe('ChatRoom mention routing with non-routable agents', () => {
    it('keeps mention id for integration but skips direct routing to non-routable agent', () => {
        const bus = new MessageBus();
        const room = new ChatRoom('test-room', bus, 'room-1');
        const main = makeAgent('main', 'main', false);

        room.addAgent(main as any);
        room.addHuman({ id: 'user-1', type: 'human', name: 'User' });

        const message = room.sendHumanMessage('user-1', '@main 测试');

        expect(message.mentions).toEqual(['main']);
        expect(main.receiveMessage).not.toHaveBeenCalled();
    });

    it('routes to routable mentioned agent', () => {
        const bus = new MessageBus();
        const room = new ChatRoom('test-room', bus, 'room-2');
        const developer = makeAgent('developer', '开发者', true);

        room.addAgent(developer as any);
        room.addHuman({ id: 'user-1', type: 'human', name: 'User' });

        room.sendHumanMessage('user-1', '@开发者 请处理');

        expect(developer.receiveMessage).toHaveBeenCalledTimes(1);
    });

    it('routes to first routable agent when first mention is non-routable', () => {
        const bus = new MessageBus();
        const room = new ChatRoom('test-room', bus, 'room-3');
        const main = makeAgent('main', 'main', false);
        const developer = makeAgent('developer', '开发者', true);

        room.addAgent(main as any);
        room.addAgent(developer as any);
        room.addHuman({ id: 'user-1', type: 'human', name: 'User' });

        room.sendHumanMessage('user-1', '@main @开发者 请处理');

        expect(main.receiveMessage).not.toHaveBeenCalled();
        expect(developer.receiveMessage).toHaveBeenCalledTimes(1);
    });
});
