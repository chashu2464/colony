export declare class SessionManager {
    private dataDir;
    constructor(dataDir?: string);
    /**
     * Save a session (room state) to disk.
     */
    saveSession(sessionId: string, data: object): Promise<void>;
    /**
     * Load a session from disk.
     */
    loadSession(sessionId: string): Promise<object | null>;
    /**
     * List all saved session IDs.
     */
    listSessions(): Promise<string[]>;
    /**
     * Delete a saved session.
     */
    deleteSession(sessionId: string): Promise<boolean>;
    private sessionPath;
}
