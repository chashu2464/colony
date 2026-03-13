// @ts-nocheck
import { ChatRoomManager } from '../conversation/ChatRoomManager.js';
import { Colony } from '../Colony.js';
import { ChatRoom } from '../conversation/ChatRoom.js';

async function testDynamicAgentLogic() {
    console.log('=== Integration Logic Test: Dynamic Agent Management ===');

    let abortCalled = false;
    let saveCalled = false;
    let topicSyncCalled = false;

    // 1. Mock Agent with abort
    const mockAgent = {
        id: 'dev',
        name: 'developer',
        config: { isDefault: false },
        abortRoomInvocation: (roomId: string) => {
            console.log(`Mock: Aborting agent in room ${roomId}`);
            abortCalled = true;
        },
        getSessionHealth: () => ({ status: 'healthy' })
    };

    const mockAgent2 = {
        id: 'arch',
        name: 'architect',
        config: { isDefault: true },
        abortRoomInvocation: () => {},
        getSessionHealth: () => ({ status: 'healthy' })
    };

    // 2. Mock Registry
    const mockRegistry = {
        getByIdOrName: (id: string) => id === 'developer' || id === 'dev' ? mockAgent : (id === 'architect' || id === 'arch' ? mockAgent2 : undefined),
        getAll: () => [mockAgent, mockAgent2]
    };

    // 3. Mock ChatRoomManager
    const mockBus = {
        subscribe: () => (() => {}),
        publish: () => {},
        emitColonyEvent: () => {}
    };

    const manager = new ChatRoomManager(mockBus as any, mockRegistry as any, {
        saveSession: () => { saveCalled = true; return Promise.resolve(); },
        deleteSession: () => Promise.resolve(),
        deleteWorkflow: () => Promise.resolve(),
        listSessions: () => Promise.resolve([])
    } as any);

    const room = manager.createRoom('test-room', ['architect', 'developer']);
    console.log(`Initial agents: ${room.getAgents().map(a => a.name)}`);

    // 4. Mock Colony and DiscordBot
    const colony = {
        chatRoomManager: manager,
        discordManager: {
            getBot: () => ({
                updateChannelTopic: (id: string, names: string[]) => {
                    console.log(`Mock: Syncing topic for ${id} with agents: ${names}`);
                    topicSyncCalled = true;
                    return Promise.resolve();
                }
            })
        },
        updateSessionAgents: async function(id: string, ids: string[]) {
            console.log(`Mock: Colony updating session ${id}...`);
            this.chatRoomManager.updateRoomAgents(id, ids);
            await this.chatRoomManager.saveRoom(id);
            const r = this.chatRoomManager.getRoom(id);
            const names = r.getInfo().participants.filter((p: any) => p.type === 'agent').map((p: any) => p.name);
            await this.discordManager.getBot().updateChannelTopic(id, names);
        }
    } as any;

    // 5. Test: Remove 'developer'
    console.log('\n--- Action: Update agents to [architect] only ---');
    await colony.updateSessionAgents(room.id, ['architect']);

    const finalAgents = room.getAgents();
    console.log(`Final agents: ${finalAgents.map(a => a.name)}`);

    if (finalAgents.length === 1 && finalAgents[0].id === 'arch' && abortCalled && saveCalled && topicSyncCalled) {
        console.log('\n✓ DYNAMIC UPDATE LOGIC VERIFIED');
        process.exit(0);
    } else {
        console.error('\n✗ LOGIC TEST FAILED');
        console.log({ 
            agentCount: finalAgents.length, 
            abortCalled, 
            saveCalled, 
            topicSyncCalled 
        });
        process.exit(1);
    }
}

testDynamicAgentLogic().catch(err => {
    console.error(err);
    process.exit(1);
});
