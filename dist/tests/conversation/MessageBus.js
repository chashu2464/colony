"use strict";
// ── Colony: Message Bus ──────────────────────────────────
// Pub-sub message routing for chat rooms.
// Supports broadcast and targeted (@mention) delivery.
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageBus = void 0;
const EventBus_js_1 = require("../utils/EventBus.js");
const Logger_js_1 = require("../utils/Logger.js");
const log = new Logger_js_1.Logger('MessageBus');
class MessageBus {
    events = new EventBus_js_1.EventBus();
    // Per-room subscriber callbacks
    roomSubscribers = new Map();
    /**
     * Subscribe to messages in a specific room.
     * Returns unsubscribe function.
     */
    subscribe(roomId, callback) {
        if (!this.roomSubscribers.has(roomId)) {
            this.roomSubscribers.set(roomId, new Set());
        }
        const subs = this.roomSubscribers.get(roomId);
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
    publish(message) {
        log.debug(`Publishing message in room ${message.roomId} from ${message.sender.name}`);
        // Room-specific delivery
        const subs = this.roomSubscribers.get(message.roomId);
        if (subs) {
            for (const callback of subs) {
                try {
                    callback(message);
                }
                catch (err) {
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
    emitColonyEvent(event) {
        this.events.emit('colony_event', event);
    }
    /**
     * Remove all subscribers for a room.
     */
    clearRoom(roomId) {
        this.roomSubscribers.delete(roomId);
    }
}
exports.MessageBus = MessageBus;
