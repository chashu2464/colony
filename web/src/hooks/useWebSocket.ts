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

export function useWebSocket(
    url: string,
    onEvent: (event: WSEvent) => void,
    currentRoomId?: string | null
) {
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimer = useRef<number>(undefined);
    // Use ref to avoid closure trap - always read the latest values without reconnecting
    const roomIdRef = useRef(currentRoomId);
    const onEventRef = useRef(onEvent);

    // Update refs immediately during render to avoid race conditions
    // This ensures that any incoming message processed after the render started
    // will use the latest roomId and event handler.
    roomIdRef.current = currentRoomId;
    onEventRef.current = onEvent;

    const connect = useCallback(() => {
        // Clear any existing timer
        if (reconnectTimer.current) {
            window.clearTimeout(reconnectTimer.current);
            reconnectTimer.current = undefined;
        }

        // Close existing connection if any
        if (wsRef.current) {
            wsRef.current.onclose = null;
            wsRef.current.close();
        }

        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('[WS] Connected');
        };

        ws.onmessage = (e) => {
            try {
                const event = JSON.parse(e.data) as WSEvent;

                // Filter messages by roomId at WebSocket level to prevent cross-session contamination
                if (roomIdRef.current && (event.type === 'message' || event.type === 'message_updated')) {
                    const msg = event.data as { roomId?: string };
                    if (msg.roomId && msg.roomId !== roomIdRef.current) {
                        return;
                    }
                }

                onEventRef.current(event);
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
    }, [url]); // Only depend on url now

    useEffect(() => {
        connect();
        return () => {
            if (reconnectTimer.current) {
                window.clearTimeout(reconnectTimer.current);
            }
            if (wsRef.current) {
                wsRef.current.onclose = null; // Prevent reconnect on intentional close
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [connect]);

    return wsRef;
}
