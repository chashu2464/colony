// @ts-nocheck
import { DiscordBot } from '../discord/DiscordBot.js';

// Mock objects for testing
const mockConfig = { bot: { token: 'test', prefix: '/' } };
const mockColony = {} as any;
const mockMapper = {} as any;

// Access private method for testing
const bot = new DiscordBot(mockConfig as any, mockColony, mockMapper) as any;

function testParsing() {
    console.log('=== Unit Test: Agent Parsing from Topic ===');

    const cases = [
        {
            topic: '🎯 Research | agents: architect, developer',
            expected: ['architect', 'developer']
        },
        {
            topic: 'agents: architect',
            expected: ['architect']
        },
        {
            topic: 'AGENTS: architect, developer, strategist',
            expected: ['architect', 'developer', 'strategist']
        },
        {
            topic: 'No agents here',
            expected: undefined
        },
        {
            topic: 'agents: ',
            expected: undefined
        },
        {
            topic: null,
            expected: undefined
        },
        {
            topic: 'agents: architect | id: 123',
            expected: ['architect']
        }
    ];

    let passed = 0;
    for (const c of cases) {
        const result = bot.parseAgentsFromTopic(c.topic);
        const match = JSON.stringify(result) === JSON.stringify(c.expected);
        if (match) {
            console.log(`✓ PASS: "${c.topic}" -> ${JSON.stringify(result)}`);
            passed++;
        } else {
            console.error(`✗ FAIL: "${c.topic}" -> Expected ${JSON.stringify(c.expected)}, got ${JSON.stringify(result)}`);
        }
    }

    console.log(`\nResult: ${passed}/${cases.length} passed`);
    if (passed === cases.length) {
        process.exit(0);
    } else {
        process.exit(1);
    }
}

testParsing();
