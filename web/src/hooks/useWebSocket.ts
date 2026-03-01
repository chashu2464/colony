// ── Colony: WebSocket Hook ───────────────────────────────
// Manages real-time connection to the Colony server.

import { useEffect, useRef, useCallback } from 'react';

export interface WSEvent {
    type: string;
    data?: unknown;
    agentId?: string;
    status?: string;
    model?: string;
    remaining?: number;
    roomId?: string;
}

export function useWebSocket(url: string, onEvent: (event: WSEvent) => void) {
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimer = useRef<number>(undefined);

    const connect = useCallback(() => {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('[WS] Connected');
        };

        ws.onmessage = (e) => {
            try {
                const event = JSON.parse(e.data) as WSEvent;
                onEvent(event);
            } catch {
                console.warn('[WS] Invalid message:', e.data);
            }
        };

        ws.onclose = () => {
            console.log('[WS] Disconnected, reconnecting in 2s...');
            reconnectTimer.current = window.setTimeout(connect, 2000);
        };

        ws.onerror = (err) => {
            console.error('[WS] Error:', err);
        };
    }, [url, onEvent]);

    useEffect(() => {
        connect();
        return () => {
            clearTimeout(reconnectTimer.current);
            wsRef.current?.close();
        };
    }, [connect]);

    return wsRef;
}
