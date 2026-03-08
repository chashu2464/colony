// ── Colony: Discord Channel-Session Mapper ─────────────────
// Manages 1:1 bidirectional mapping between Discord Channels and Colony Sessions.

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/Logger.js';
import type { MappingRecord, MappingMeta } from './types.js';

const log = new Logger('ChannelSessionMapper');

export class ChannelSessionMapper {
    private mappings: MappingRecord[] = [];
    private filePath: string;
    private channelToSession = new Map<string, string>();
    private sessionToChannel = new Map<string, string>();
    /** In-flight sessions being created by Direction A — prevents channelCreate re-entry */
    private pendingSessions = new Set<string>();

    constructor(dataDir: string = '.data') {
        this.filePath = path.join(dataDir, 'discord-channel-map.json');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
    }

    /**
     * Bind a Discord channel to a Colony session.
     */
    async bind(channelId: string, sessionId: string, meta: MappingMeta): Promise<void> {
        // Remove any existing mappings for this channel or session
        this.unbind(channelId);
        const existingChannelId = this.getChannelBySession(sessionId);
        if (existingChannelId) {
            this.unbind(existingChannelId);
        }

        const record: MappingRecord = {
            channelId,
            sessionId,
            sessionName: meta.sessionName,
            guildId: meta.guildId,
            createdAt: meta.createdAt || new Date().toISOString(),
        };

        this.mappings.push(record);
        this.channelToSession.set(channelId, sessionId);
        this.sessionToChannel.set(sessionId, channelId);
        // Clear pending guard if present
        this.pendingSessions.delete(sessionId);

        log.info(`Bound channel ${channelId} to session ${sessionId} (${meta.sessionName})`);
        await this.save();
    }

    /**
     * Unbind a Discord channel.
     */
    async unbind(channelId: string): Promise<void> {
        const sessionId = this.channelToSession.get(channelId);
        if (sessionId) {
            this.mappings = this.mappings.filter(m => m.channelId !== channelId);
            this.channelToSession.delete(channelId);
            this.sessionToChannel.delete(sessionId);
            log.info(`Unbound channel ${channelId} from session ${sessionId}`);
            await this.save();
        }
    }

    /**
     * Get session ID by channel ID.
     */
    getSessionByChannel(channelId: string): string | undefined {
        return this.channelToSession.get(channelId);
    }

    /**
     * Get channel ID by session ID.
     */
    getChannelBySession(sessionId: string): string | undefined {
        return this.sessionToChannel.get(sessionId);
    }

    /**
     * Mark a session as pending channel creation (Direction A in-flight guard).
     * Prevents channelCreate event from triggering Direction B re-entry.
     */
    setPendingSession(sessionId: string): void {
        this.pendingSessions.add(sessionId);
    }

    /**
     * Remove pending session guard (called on error path).
     */
    clearPendingSession(sessionId: string): void {
        this.pendingSessions.delete(sessionId);
    }

    /**
     * Check if a session is pending channel creation (in-flight Direction A).
     */
    isSessionPending(sessionId: string): boolean {
        return this.pendingSessions.has(sessionId);
    }

    /**
     * Get all mappings.
     */
    getAllMappings(): MappingRecord[] {
        return [...this.mappings];
    }

    /**
     * Prune mappings for sessions that no longer exist.
     */
    async pruneOrphans(existingSessionIds: Set<string>): Promise<number> {
        const orphans = this.mappings.filter(m => !existingSessionIds.has(m.sessionId));
        const count = orphans.length;
        for (const orphan of orphans) {
            await this.unbind(orphan.channelId);
        }
        return count;
    }

    /**
     * Load mappings from disk.
     */
    async load(): Promise<void> {
        if (!fs.existsSync(this.filePath)) {
            this.mappings = [];
            return;
        }

        try {
            const content = fs.readFileSync(this.filePath, 'utf-8');
            const data = JSON.parse(content);
            this.mappings = data.mappings || [];

            // Rebuild maps
            this.channelToSession.clear();
            this.sessionToChannel.clear();
            for (const m of this.mappings) {
                this.channelToSession.set(m.channelId, m.sessionId);
                this.sessionToChannel.set(m.sessionId, m.channelId);
            }

            log.info(`Loaded ${this.mappings.length} mappings from ${this.filePath}`);
        } catch (error) {
            log.error('Failed to load mappings:', error);
            this.mappings = [];
        }
    }

    /**
     * Save mappings to disk.
     */
    async save(): Promise<void> {
        try {
            const data = {
                version: 1,
                mappings: this.mappings,
                updatedAt: new Date().toISOString(),
            };
            fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
        } catch (error) {
            log.error('Failed to save mappings:', error);
        }
    }
}
