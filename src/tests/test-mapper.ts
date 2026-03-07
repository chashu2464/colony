import { ChannelSessionMapper } from '../discord/ChannelSessionMapper.js';
import * as fs from 'fs';
import * as path from 'path';

async function runTests() {
    console.log('=== Unit Test: ChannelSessionMapper ===');
    const testDir = path.join(process.cwd(), '.tmp/mapper_test');
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true });
    fs.mkdirSync(testDir, { recursive: true });

    const mapper = new ChannelSessionMapper(testDir);

    try {
        // Test 1: Binding
        console.log('Test 1: Binding');
        await mapper.bind('channel1', 'session1', {
            sessionName: 'Test Session',
            guildId: 'guild1',
            createdAt: new Date().toISOString()
        });

        if (mapper.getSessionByChannel('channel1') === 'session1' &&
            mapper.getChannelBySession('session1') === 'channel1') {
            console.log('✓ PASS: Binding successful');
        } else {
            console.error('✗ FAIL: Binding failed');
        }

        // Test 2: Unbinding
        console.log('Test 2: Unbinding');
        await mapper.unbind('channel1');
        if (mapper.getSessionByChannel('channel1') === undefined &&
            mapper.getChannelBySession('session1') === undefined) {
            console.log('✓ PASS: Unbinding successful');
        } else {
            console.error('✗ FAIL: Unbinding failed');
        }

        // Test 3: Persistence
        console.log('Test 3: Persistence');
        await mapper.bind('channel2', 'session2', {
            sessionName: 'Persistent Session',
            guildId: 'guild1',
            createdAt: new Date().toISOString()
        });
        await mapper.save();

        const mapper2 = new ChannelSessionMapper(testDir);
        await mapper2.load();

        if (mapper2.getSessionByChannel('channel2') === 'session2') {
            console.log('✓ PASS: Persistence successful');
        } else {
            console.error('✗ FAIL: Persistence failed');
        }

        // Test 4: Re-binding (Overwrite)
        console.log('Test 4: Re-binding (Overwrite)');
        await mapper.bind('channel2', 'session3', {
            sessionName: 'New Session',
            guildId: 'guild1',
            createdAt: new Date().toISOString()
        });
        if (mapper.getSessionByChannel('channel2') === 'session3' &&
            mapper.getChannelBySession('session2') === undefined) {
            console.log('✓ PASS: Overwrite successful');
        } else {
            console.error('✗ FAIL: Overwrite failed');
        }

    } catch (error) {
        console.error('Error during tests:', error);
    } finally {
        if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true });
    }

    console.log('=== Test Completed ===');
}

runTests();
