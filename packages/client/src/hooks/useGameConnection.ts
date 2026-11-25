import { useCallback, useEffect, useRef, useState } from 'react';
import { ClientGameState, ClientMessage, ServerMessage } from '@zpy/shared';
import { DiscordIdentity, initDiscordIdentity } from '../discord';

export function useGameConnection() {
  const [identity, setIdentity] = useState<DiscordIdentity | null>(null);
  const [state, setState] = useState<ClientGameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    async function start() {
      try {
        const id = await initDiscordIdentity();
        if (cancelled) return;
        setIdentity(id);

        const connect = () => {
          if (cancelled) return;
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const wsUrl = `${protocol}//${window.location.host}/api/ws`;
          const ws = new WebSocket(wsUrl);
          wsRef.current = ws;

          ws.onopen = () => {
            setConnected(true);
            setError(null);
            const joinMsg: ClientMessage = {
              type: 'join',
              channelId: id.channelId,
              userId: id.userId,
              name: id.name,
              avatarUri: id.avatarUri,
            };
            ws.send(JSON.stringify(joinMsg));
          };

          ws.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data as string) as ServerMessage;
              if (msg.type === 'state') {
                setState(msg.state);
              } else if (msg.type === 'error') {
                setError(msg.message);
              }
            } catch {
              // ignore malformed message
            }
          };

          ws.onclose = () => {
            setConnected(false);
            if (!cancelled) {
              reconnectTimer = setTimeout(connect, 1500);
            }
          };
        };

        connect();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to initialize Discord SDK.');
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      setError(null);
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { identity, state, error, connected, send, clearError };
}
