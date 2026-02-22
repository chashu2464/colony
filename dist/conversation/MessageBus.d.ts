import { EventBus } from '../utils/EventBus.js';
import type { Message, ColonyEvent } from '../types.js';
interface MessageBusEvents {
    'message': Message;
    'colony_event': ColonyEvent;
}
export declare class MessageBus {
    readonly events: EventBus<MessageBusEvents>;
    private roomSubscribers;
    /**
     * Subscribe to messages in a specific room.
     * Returns unsubscribe function.
     */
    subscribe(roomId: string, callback: (message: Message) => void): () => void;
    /**
     * Publish a message to a room — delivered to all subscribers.
     */
    publish(message: Message): void;
    /**
     * Dispatch a ColonyEvent to subscribers.
     */
    emitColonyEvent(event: ColonyEvent): void;
    /**
     * Remove all subscribers for a room.
     */
    clearRoom(roomId: string): void;
}
export {};
