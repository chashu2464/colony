import type { MessageBus } from '../../conversation/MessageBus.js';
import { Logger } from '../../utils/Logger.js';
import type { OpenClawConfig } from './types.js';
import { OpenClawClient } from './OpenClawClient.js';
import { SessionMappingStore } from './sessionMappingStore.js';

const log = new Logger('OpenClawBridge');

export interface OpenClawBridgeDeps {
    messageBus: MessageBus;
    client: OpenClawClient;
    mappingStore: SessionMappingStore;
    config: OpenClawConfig;
}

export class OpenClawBridge {
    private started = false;

    constructor(private readonly deps: OpenClawBridgeDeps) {}

    start(): void {
        if (this.started) {
            return;
        }
        this.started = true;

        this.deps.messageBus.events.on('message', (message) => {
            const isInboundReplay = Boolean(message.metadata?.openclawInbound);
            const skipByRoomPolicy = this.deps.config.roomIds.size > 0 && !this.deps.config.roomIds.has(message.roomId);
            if (isInboundReplay || skipByRoomPolicy || message.sender.type !== 'human') {
                return;
            }

            const mapping = this.deps.mappingStore.getOrCreate(
                message.roomId,
                message.roomId,
                this.deps.config.agentId,
            );

            this.deps.client.sendMessage({
                sessionKey: mapping.sessionKey,
                traceId: mapping.traceId,
                senderId: message.sender.id,
                content: message.content,
            }).catch((error) => {
                log.error(`OpenClaw outbound failed: ${(error as Error).message}`);
            });
        });
    }
}
