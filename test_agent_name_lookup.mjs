import { Colony } from './dist/Colony.js';
import * as path from 'path';

async function test() {
    const colony = new Colony({
        agentConfigDir: path.join(process.cwd(), 'config', 'agents'),
        enableLongTermMemory: false,
        enableDiscord: false
    });

    await colony.initialize();

    // Try to create a session using agent names instead of IDs
    // IDs are: architect, developer, etc.
    // Names are: "架构师", "开发者", etc.
    const agentNames = ["架构师", "开发者"];
    console.log(`Creating session with agent names: ${agentNames.join(', ')}`);
    
    const sessionId = colony.createSession("TestNameLookup", agentNames);
    const room = colony.chatRoomManager.getRoom(sessionId);
    
    if (room) {
        const participants = room.getInfo().participants;
        const agentsInRoom = participants.filter(p => p.type === 'agent');
        console.log("Agents in created room:");
        agentsInRoom.forEach(a => console.log(`- ${a.name} (ID: ${a.id})`));
        
        if (agentsInRoom.length === 2) {
            console.log("SUCCESS: Both agents found by name.");
        } else {
            console.log(`FAILURE: Expected 2 agents, but found ${agentsInRoom.length}.`);
        }
    }

    // Test with IDs and mixed case
    const mixArgs = ["Architect", "开发者"];
    console.log(`Creating session with mixed IDs/names: ${mixArgs.join(', ')}`);
    const sessionId2 = colony.createSession("MixedLookup", mixArgs);
    const room2 = colony.chatRoomManager.getRoom(sessionId2);
    if (room2 && room2.getInfo().participants.filter(p => p.type === 'agent').length === 2) {
        console.log("SUCCESS: Mixed lookup worked.");
    } else {
        console.log("FAILURE: Mixed lookup failed.");
    }
}

test().catch(console.error);
