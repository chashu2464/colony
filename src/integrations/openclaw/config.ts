import type { OpenClawConfig } from './types.js';

export function loadOpenClawConfig(env: NodeJS.ProcessEnv = process.env): OpenClawConfig {
    const hasAnyOpenClawEnv = Object.keys(env).some((key) => key.startsWith('OPENCLAW_'));
    const enabledFlag = (env.OPENCLAW_ENABLED ?? '').toLowerCase();
    const enabled = enabledFlag === '1' || enabledFlag === 'true' || (hasAnyOpenClawEnv && enabledFlag !== 'false');

    if (!enabled) {
        return {
            enabled: false,
            baseUrl: '',
            outboundPath: '/hooks/colony',
            apiKey: '',
            agentId: '',
            timeoutMs: 10000,
            webhookSecret: '',
            allowedSkewMs: 300000,
            roomIds: new Set<string>(),
        };
    }

    const baseUrl = mustGetString(env, 'OPENCLAW_BASE_URL');
    const outboundPath = parseOutboundPath(env.OPENCLAW_OUTBOUND_PATH);
    const apiKey = mustGetString(env, 'OPENCLAW_API_KEY');
    const agentId = mustGetString(env, 'OPENCLAW_AGENT_ID');
    const webhookSecret = mustGetString(env, 'OPENCLAW_WEBHOOK_SECRET');
    const timeoutMs = parsePositiveInt(env.OPENCLAW_TIMEOUT_MS, 'OPENCLAW_TIMEOUT_MS', 15000);
    const allowedSkewMs = parseNonNegativeInt(env.OPENCLAW_ALLOWED_SKEW_MS, 'OPENCLAW_ALLOWED_SKEW_MS', 300000);
    const roomIds = new Set((env.OPENCLAW_ROOM_IDS ?? '').split(',').map((item) => item.trim()).filter(Boolean));

    return { enabled: true, baseUrl, outboundPath, apiKey, agentId, timeoutMs, webhookSecret, allowedSkewMs, roomIds };
}

function mustGetString(env: NodeJS.ProcessEnv, key: string): string {
    const raw = env[key];
    if (!raw || !raw.trim()) {
        throw new Error(`Missing required env: ${key}`);
    }
    return raw.trim();
}

function parsePositiveInt(raw: string | undefined, key: string, fallback: number): number {
    const value = raw ? Number(raw) : fallback;
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${key} must be an integer > 0`);
    }
    return value;
}

function parseNonNegativeInt(raw: string | undefined, key: string, fallback: number): number {
    const value = raw ? Number(raw) : fallback;
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`${key} must be an integer >= 0`);
    }
    return value;
}

function parseOutboundPath(raw: string | undefined): string {
    const value = (raw ?? '/hooks/colony').trim();
    if (!value) {
        return '/hooks/colony';
    }
    if (!value.startsWith('/')) {
        throw new Error('OPENCLAW_OUTBOUND_PATH must start with "/"');
    }
    return value;
}
