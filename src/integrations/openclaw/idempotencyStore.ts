export class IdempotencyStore {
    private readonly processed = new Map<string, number>();

    constructor(private readonly ttlMs: number = 60 * 60 * 1000) {}

    has(eventId: string): boolean {
        const exp = this.processed.get(eventId);
        if (!exp) {
            return false;
        }
        if (Date.now() > exp) {
            this.processed.delete(eventId);
            return false;
        }
        return true;
    }

    markProcessed(eventId: string): void {
        this.processed.set(eventId, Date.now() + this.ttlMs);
        this.gc();
    }

    private gc(): void {
        const now = Date.now();
        for (const [eventId, exp] of this.processed.entries()) {
            if (exp <= now) {
                this.processed.delete(eventId);
            }
        }
    }
}
