type Listener<T> = (data: T) => void;
export declare class EventBus<EventMap extends {}> {
    private listeners;
    on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): () => void;
    emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void;
    off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void;
    removeAllListeners(event?: keyof EventMap): void;
}
export {};
