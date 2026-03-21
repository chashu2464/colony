import { describe, it, expect, vi } from 'vitest';
import { MessageBus } from '../../../conversation/MessageBus.js';
import { OpenClawBridge } from '../../../integrations/openclaw/OpenClawBridge.js';
import { SessionMappingStore } from '../../../integrations/openclaw/sessionMappingStore.js';
import type { OpenClawConfig } from '../../../integrations/openclaw/types.js';

describe('OpenClawBridge', () => {
    it('forwards human messages and skips inbound replay messages', async () => {
        const messageBus = new MessageBus();
        const sendMessage = vi.fn().mockResolvedValue({ status: 200, data: {} });
        const config: OpenClawConfig = {
            enabled: true,
            baseUrl: 'https://openclaw.example.com',
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
            sender: { id: 'system', type: 'human', name: 'System' },
            content: 'inbound',
            mentions: [],
            timestamp: new Date(),
            metadata: { openclawInbound: true },
        });

        await Promise.resolve();
        expect(sendMessage).toHaveBeenCalledTimes(1);
        expect(sendMessage.mock.calls[0][0].content).toBe('hello');
    });
});
