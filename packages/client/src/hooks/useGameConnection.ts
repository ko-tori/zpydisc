import { useCallback, useEffect, useRef, useState } from 'react';
import { ClientGameState, ClientMessage, ServerMessage } from '@zpy/shared';
import { DiscordIdentity, initDiscordIdentity } from '../discord';

export function useGameConnection() {
  const [identity, setIdentity] = useState<DiscordIdentity | null>(null);
  const [state, setState] = useState<ClientGameState | null>(null);
  const [status, setStatus] = useState('Initializing...');
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    async function start() {
      try {
        const id = await initDiscordIdentity((s) => {
          if (!cancelled) setStatus(s);
        });
        if (cancelled) return;
        setIdentity(id);

        const connect = () => {
          if (cancelled) return;
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const wsUrl = `${protocol}//${window.location.host}/api/ws`;
          setStatus(`Connecting WebSocket (${wsUrl})...`);
          const ws = new WebSocket(wsUrl);
          wsRef.current = ws;

          ws.onopen = () => {
            setConnected(true);
            setError(null);
            setStatus('Joining table...');
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

          ws.onclose = (ev) => {
            setConnected(false);
            if (!cancelled) {
              setStatus(`Disconnected (code ${ev.code}), retrying...`);
              reconnectTimer = setTimeout(connect, 1500);
            }
          };
        };

        connect();
      } catch (err) {
        console.error('Discord SDK initialization error:', err);
        if (!cancelled) {
          const detail =
            err instanceof Error
              ? err.message
              : typeof err === 'object' && err !== null && 'message' in err
                ? String((err as { message: unknown }).message)
                : String(err);
          setError(`Failed to initialize Discord SDK: ${detail}`);
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

  return { identity, state, status, error, connected, send, clearError };
}
