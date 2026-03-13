// @ts-nocheck
// ── Colony: Event Emitter Utility ─────────────────────────
// Type-safe event bus for decoupled component communication.

type Listener<T> = (data: T) => void;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export class EventBus<EventMap extends {}> {
    private listeners = new Map<keyof EventMap, Set<Listener<never>>>();

    on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        const set = this.listeners.get(event)!;
        set.add(listener as Listener<never>);
        return () => set.delete(listener as Listener<never>);
    }

    emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
        const set = this.listeners.get(event);
        if (set) {
            for (const listener of set) {
                try {
                    (listener as Listener<EventMap[K]>)(data);
                } catch (err) {
                    console.error(`[EventBus] Error in listener for "${String(event)}":`, err);
                }
            }
        }
    }

    off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
        this.listeners.get(event)?.delete(listener as Listener<never>);
    }

    removeAllListeners(event?: keyof EventMap): void {
        if (event) {
            this.listeners.delete(event);
        } else {
            this.listeners.clear();
        }
    }
}
