// @ts-nocheck
// ── Colony: Discord Types ────────────────────────────────
// Type definitions for Discord integration.

export interface DiscordConfig {
    bot: {
        token: string;
        prefix: string;
    };
    guild?: {
        id: string;               // Guild ID (required for channel creation)
        sessionCategory?: string; // Category ID where session channels will be created
        autoCreateOnChannelCreate?: boolean; // Direction B: Automatically create session when channel is created
        defaultAgents?: string[];            // Direction B: Default agents if topic parsing fails
        allowedWorkdirs?: string[];          // Direction B: Whitelist of allowed working directories (for security)
    };
    channels?: {
        notifications?: string;
        sessions?: Record<string, string>;
    };
    notifications?: {
        enabled: boolean;
        events: string[];
    };
    permissions?: {
        allowedServers?: string[];
        allowedRoles?: string[];
        allowedUsers?: string[];
    };
}

export interface MappingMeta {
    sessionName: string;
    guildId: string;
    createdAt: string; // ISO 8601
}

export interface MappingRecord {
    channelId: string;
    sessionId: string;
    sessionName: string;
    guildId: string;
    createdAt: string;
}

export interface DiscordCommand {
    name: string;
    description: string;
    args?: string[];
    execute: (args: string[], context: CommandContext) => Promise<void>;
}

export interface CommandContext {
    userId: string;
    userName: string;
    channelId: string;
    guildId?: string;
    reply: (content: string) => Promise<void>;
}

export interface UserSession {
    userId: string;
    sessionId: string | null;
    channelId: string;
    joinedAt: Date;
}

export interface NotificationEvent {
    type: 'milestone_completed' | 'task_finished' | 'error_occurred' | 'agent_response';
    sessionId: string;
    sessionName: string;
    message: string;
    details?: Record<string, unknown>;
    timestamp: Date;
}
