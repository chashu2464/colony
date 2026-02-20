"use strict";
// ── Colony: Event Emitter Utility ─────────────────────────
// Type-safe event bus for decoupled component communication.
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventBus = void 0;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
class EventBus {
    listeners = new Map();
    on(event, listener) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        const set = this.listeners.get(event);
        set.add(listener);
        return () => set.delete(listener);
    }
    emit(event, data) {
        const set = this.listeners.get(event);
        if (set) {
            for (const listener of set) {
                try {
                    listener(data);
                }
                catch (err) {
                    console.error(`[EventBus] Error in listener for "${String(event)}":`, err);
                }
            }
        }
    }
    off(event, listener) {
        this.listeners.get(event)?.delete(listener);
    }
    removeAllListeners(event) {
        if (event) {
            this.listeners.delete(event);
        }
        else {
            this.listeners.clear();
        }
    }
}
exports.EventBus = EventBus;
//# sourceMappingURL=EventBus.js.map