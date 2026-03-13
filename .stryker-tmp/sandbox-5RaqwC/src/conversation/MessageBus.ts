// @ts-nocheck
// ── Colony: Message Bus ──────────────────────────────────
// Pub-sub message routing for chat rooms.
// Supports broadcast and targeted (@mention) delivery.

import { EventBus } from '../utils/EventBus.js';
import { Logger } from '../utils/Logger.js';
import type { Message, ColonyEvent } from '../types.js';

const log = new Logger('MessageBus');

interface MessageBusEvents {
    'message': Message;
    'colony_event': ColonyEvent;
}

export class MessageBus {
    readonly events = new EventBus<MessageBusEvents>();

    // Per-room subscriber callbacks
    private roomSubscribers = new Map<string, Set<(message: Message) => void>>();

    /**
     * Subscribe to messages in a specific room.
     * Returns unsubscribe function.
     */
    subscribe(roomId: string, callback: (message: Message) => void): () => void {
        if (!this.roomSubscribers.has(roomId)) {
            this.roomSubscribers.set(roomId, new Set());
        }
        const subs = this.roomSubscribers.get(roomId)!;
        subs.add(callback);

        log.debug(`New subscriber for room ${roomId} (total: ${subs.size})`);

        return () => {
            subs.delete(callback);
            if (subs.size === 0) {
                this.roomSubscribers.delete(roomId);
            }
        };
    }

    /**
     * Publish a message to a room — delivered to all subscribers.
     */
    publish(message: Message): void {
        log.debug(`Publishing message in room ${message.roomId} from ${message.sender.name}`);

        // Room-specific delivery
        const subs = this.roomSubscribers.get(message.roomId);
        if (subs) {
            for (const callback of subs) {
                try {
                    callback(message);
                } catch (err) {
                    log.error('Subscriber error:', err);
                }
            }
        }

        // Global event
        this.events.emit('message', message);
        this.events.emit('colony_event', { type: 'message', data: message });
    }

    /**
     * Dispatch a ColonyEvent to subscribers.
     */
    emitColonyEvent(event: ColonyEvent): void {
        this.events.emit('colony_event', event);
    }

    /**
     * Remove all subscribers for a room.
     */
    clearRoom(roomId: string): void {
        this.roomSubscribers.delete(roomId);
    }
}
