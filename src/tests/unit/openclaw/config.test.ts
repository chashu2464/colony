import { describe, it, expect } from 'vitest';
import { loadOpenClawConfig } from '../../../integrations/openclaw/config.js';

describe('loadOpenClawConfig', () => {
    it('returns disabled config when no OPENCLAW env is set', () => {
        const config = loadOpenClawConfig({});
        expect(config.enabled).toBe(false);
        expect(config.outboundPath).toBe('/hooks/colony');
    });

    it('throws when enabled config has invalid timeout', () => {
        expect(() => loadOpenClawConfig({
            OPENCLAW_ENABLED: 'true',
            OPENCLAW_BASE_URL: 'https://openclaw.example.com',
            OPENCLAW_API_KEY: 'k',
            OPENCLAW_AGENT_ID: 'a',
            OPENCLAW_WEBHOOK_SECRET: 's',
            OPENCLAW_TIMEOUT_MS: '0',
        })).toThrow('OPENCLAW_TIMEOUT_MS must be an integer > 0');
    });

    it('parses required enabled configuration', () => {
        const config = loadOpenClawConfig({
            OPENCLAW_ENABLED: 'true',
            OPENCLAW_BASE_URL: 'https://openclaw.example.com',
            OPENCLAW_API_KEY: 'k',
            OPENCLAW_AGENT_ID: 'a',
            OPENCLAW_WEBHOOK_SECRET: 's',
            OPENCLAW_TIMEOUT_MS: '2000',
            OPENCLAW_ALLOWED_SKEW_MS: '1000',
            OPENCLAW_ROOM_IDS: 'room-a, room-b',
            OPENCLAW_OUTBOUND_PATH: '/custom/openclaw/send',
        });

        expect(config.enabled).toBe(true);
        expect(config.outboundPath).toBe('/custom/openclaw/send');
        expect(config.timeoutMs).toBe(2000);
        expect(config.allowedSkewMs).toBe(1000);
        expect(config.roomIds.has('room-a')).toBe(true);
        expect(config.roomIds.has('room-b')).toBe(true);
    });

    it('throws when enabled config has invalid outbound path', () => {
        expect(() => loadOpenClawConfig({
            OPENCLAW_ENABLED: 'true',
            OPENCLAW_BASE_URL: 'https://openclaw.example.com',
            OPENCLAW_API_KEY: 'k',
            OPENCLAW_AGENT_ID: 'a',
            OPENCLAW_WEBHOOK_SECRET: 's',
            OPENCLAW_OUTBOUND_PATH: 'hooks/colony',
        })).toThrow('OPENCLAW_OUTBOUND_PATH must start with "/"');
    });
});
