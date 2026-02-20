export interface DiscordConfig {
    bot: {
        token: string;
        prefix: string;
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
