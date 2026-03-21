import { describe, it, expect, vi } from 'vitest';
import { MessageBus } from '../../../conversation/MessageBus.js';
import { OpenClawBridge } from '../../../integrations/openclaw/OpenClawBridge.js';
import { SessionMappingStore } from '../../../integrations/openclaw/sessionMappingStore.js';
import type { OpenClawConfig } from '../../../integrations/openclaw/types.js';

describe('OpenClawBridge', () => {
    it('forwards only when OpenClaw agent is explicitly mentioned', async () => {
        const messageBus = new MessageBus();
        const sendMessage = vi.fn().mockResolvedValue({ status: 200, data: {} });
        const config: OpenClawConfig = {
            enabled: true,
            baseUrl: 'https://openclaw.example.com',
            outboundPath: '/hooks/colony',
            apiKey: 'k',
            agentId: 'agent-1',
            timeoutMs: 1000,
            webhookSecret: 's',
            allowedSkewMs: 1000,
            roomIds: new Set<string>(),
        };

        const bridge = new OpenClawBridge({
            messageBus,
            client: { sendMessage } as any,
            mappingStore: new SessionMappingStore(),
            config,
        });
        bridge.start();

        messageBus.publish({
            id: 'm1',
            roomId: 'room-a',
            sender: { id: 'u1', type: 'human', name: 'User' },
            content: 'hello',
            mentions: [],
            timestamp: new Date(),
        });

        messageBus.publish({
            id: 'm2',
            roomId: 'room-a',
            sender: { id: 'u1', type: 'human', name: 'User' },
            content: 'hi @agent-1 please handle this',
            mentions: ['agent-1'],
            timestamp: new Date(),
        });

        await Promise.resolve();
        expect(sendMessage).toHaveBeenCalledTimes(1);
        expect(sendMessage.mock.calls[0][0].content).toBe('hi please handle this');
    });

    it('skips inbound replay and non-human messages even when mentioned', async () => {
        const messageBus = new MessageBus();
        const sendMessage = vi.fn().mockResolvedValue({ status: 200, data: {} });
        const config: OpenClawConfig = {
            enabled: true,
            baseUrl: 'https://openclaw.example.com',
            outboundPath: '/hooks/colony',
            apiKey: 'k',
            agentId: 'agent-1',
            timeoutMs: 1000,
            webhookSecret: 's',
            allowedSkewMs: 1000,
            roomIds: new Set<string>(),
        };

        const bridge = new OpenClawBridge({
            messageBus,
            client: { sendMessage } as any,
            mappingStore: new SessionMappingStore(),
            config,
        });
        bridge.start();

        messageBus.publish({
            id: 'm1',
            roomId: 'room-a',
            sender: { id: 'system', type: 'human', name: 'System' },
            content: '@agent-1 inbound',
            mentions: ['agent-1'],
            timestamp: new Date(),
            metadata: { openclawInbound: true },
        });

        messageBus.publish({
            id: 'm2',
            roomId: 'room-a',
            sender: { id: 'a1', type: 'agent', name: 'Architect' },
            content: '@agent-1 from agent',
            mentions: [],
            timestamp: new Date(),
        });

        messageBus.publish({
            id: 'm3',
            roomId: 'room-a',
            sender: { id: 'u1', type: 'human', name: 'User' },
            content: '@agent-1 normal human message',
            mentions: ['agent-1'],
            timestamp: new Date(),
        });

        await Promise.resolve();
        expect(sendMessage).toHaveBeenCalledTimes(1);
    });

    it('respects room whitelist before mention routing', async () => {
        const messageBus = new MessageBus();
        const sendMessage = vi.fn().mockResolvedValue({ status: 200, data: {} });
        const config: OpenClawConfig = {
            enabled: true,
            baseUrl: 'https://openclaw.example.com',
            outboundPath: '/hooks/colony',
            apiKey: 'k',
            agentId: 'agent-1',
            timeoutMs: 1000,
            webhookSecret: 's',
            allowedSkewMs: 1000,
            roomIds: new Set<string>(['room-allowed']),
        };

        const bridge = new OpenClawBridge({
            messageBus,
            client: { sendMessage } as any,
            mappingStore: new SessionMappingStore(),
            config,
        });
        bridge.start();

        messageBus.publish({
            id: 'm1',
            roomId: 'room-denied',
            sender: { id: 'u1', type: 'human', name: 'User' },
            content: '@agent-1 hello',
            mentions: ['agent-1'],
            timestamp: new Date(),
        });

        messageBus.publish({
            id: 'm2',
            roomId: 'room-allowed',
            sender: { id: 'u1', type: 'human', name: 'User' },
            content: '@agent-1 hello',
            mentions: ['agent-1'],
            timestamp: new Date(),
        });

        await Promise.resolve();
        expect(sendMessage).toHaveBeenCalledTimes(1);
        expect(sendMessage.mock.calls[0][0].sessionKey).toBe('room-allowed');
    });

    it('matches mention by stable agentId, not display name aliases', async () => {
        const messageBus = new MessageBus();
        const sendMessage = vi.fn().mockResolvedValue({ status: 200, data: {} });
        const config: OpenClawConfig = {
            enabled: true,
            baseUrl: 'https://openclaw.example.com',
            outboundPath: '/hooks/colony',
            apiKey: 'k',
            agentId: 'agent-1',
            timeoutMs: 1000,
            webhookSecret: 's',
            allowedSkewMs: 1000,
            roomIds: new Set<string>(),
        };

        const bridge = new OpenClawBridge({
            messageBus,
            client: { sendMessage } as any,
            mappingStore: new SessionMappingStore(),
            config,
        });
        bridge.start();

        messageBus.publish({
            id: 'm1',
            roomId: 'room-a',
            sender: { id: 'u1', type: 'human', name: 'User' },
            content: 'hi @openclaw please handle this',
            mentions: ['openclaw'],
            timestamp: new Date(),
        });

        await Promise.resolve();
        expect(sendMessage).not.toHaveBeenCalled();
    });
});
