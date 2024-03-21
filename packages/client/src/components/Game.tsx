import * as React from 'react';
import { Player } from './Player';
import { PlayerState, nextState } from '../lib/PlayerState';
import { WIDTH, HEIGHT, KEYS_TO_RECORD, IGNORE_PROPS } from '../../../server/src/shared/Constants';
import { useAuthenticatedContext } from '../hooks/useAuthenticatedContext';

import './Game.css';

export function Game() {
  const authenticatedContext = useAuthenticatedContext();

  const keyMap = new Map<string, boolean>();
  let dest: [number, number] | null = null;
  let frameCt = 0;

  const requestRef = React.useRef<number>();
  const prevTimeRef = React.useRef<number>();
  const containerRef = React.useRef<HTMLDivElement>(null);

  const players = React.useRef<PlayerState[]>([]);
  const [playersState, setPlayersState] = React.useState<PlayerState[]>([]);

  function handleKeyDown(e: KeyboardEvent) {
    if (KEYS_TO_RECORD.has(e.code)) {
      keyMap.set(e.code, true);
      authenticatedContext.room.send('keyDown', e.code);
    }
  }
  function handleKeyUp(e: KeyboardEvent) {
    if (KEYS_TO_RECORD.has(e.code)) {
      keyMap.set(e.code, false);
      authenticatedContext.room.send('keyUp', e.code);
    }
  }

  function sendDest(e: PointerEvent) {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    dest = [(e.x - rect.x) * WIDTH / rect.width, (rect.height - e.y - rect.y) * HEIGHT / rect.height];
    authenticatedContext.room.send('newDest', dest);
  }

  function handlePointerMove(e: PointerEvent) {
    if (dest) sendDest(e);
  }

  function handlePointerUp() {
    dest = null;
    authenticatedContext.room.send('clearDest');
  }

  React.useEffect(() => {
    try {
      authenticatedContext.room.state.players.onAdd = function (player, _key) {
        const playerState = new PlayerState({ ...player, local: player.sessionId === authenticatedContext.room.sessionId });
        players.current.push(playerState);
        player.onChange = function (changes) {
          players.current = players.current.map((p) => {
            if (p.userId !== player.userId) {
              return p;
            }
            // Ignore changes to local player unless there's a velocity change
            if (p.sessionId === authenticatedContext.room.sessionId && !changes.find(change => change.field === 'vx' || change.field === 'vy')) {
              return p;
            }
            changes.forEach(({ field, value }) => {
              if (IGNORE_PROPS.has(field)) return;
              // @ts-expect-error
              p[field] = value;
            });
            return p;
          });
        };
      };

      authenticatedContext.room.state.players.onRemove = function (player, _key) {
        players.current = players.current.filter((p) => p.userId !== player.userId);
      };

      authenticatedContext.room.onLeave((code) => {
        console.log("You've been disconnected.", code);
      });
    } catch (e) {
      console.error("Couldn't connect:", e);
    }
  }, [authenticatedContext.room]);

  const animate = (timestamp: number) => {
    frameCt = (frameCt + 1) % 100;
    if (frameCt === 0) {
      if (!dest) authenticatedContext.room.send('clearDest');
      for (const k in KEYS_TO_RECORD) {
        if (!keyMap.get(k)) {
          authenticatedContext.room.send('keyUp', k);
        }
      }
    }
    const deltaTime = prevTimeRef.current ? timestamp - prevTimeRef.current : 16.6;
    prevTimeRef.current = timestamp;
    requestRef.current = requestAnimationFrame(animate);
    players.current = players.current.map(player => nextState(player, deltaTime, keyMap, dest));
    setPlayersState([...players.current]);
  }

  React.useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current!);
  }, []);

  React.useEffect(() => {
    addEventListener('keydown', handleKeyDown);
    addEventListener('keyup', handleKeyUp);
    addEventListener('pointerdown', sendDest);
    addEventListener('pointermove', handlePointerMove);
    addEventListener('pointerup', handlePointerUp);
    return () => {
      removeEventListener('keydown', handleKeyDown);
      removeEventListener('keyup', handleKeyUp);
      removeEventListener('pointerdown', sendDest);
      removeEventListener('pointermove', handlePointerMove);
      removeEventListener('pointerup', handlePointerUp);
    };
  }, [authenticatedContext]);

  return (
    <div className="game__root">
      <div ref={containerRef} className="game__container">
        {playersState.map((p) => (
          <Player key={p.userId} {...p} />
        ))}
        <div className="game__stats">
          <span>Total kinetic energy: {playersState.map(p => Math.floor(p.r ** 2 * (p.vx ** 2 + p.vy ** 2) / 100)).reduce((sum, current) => sum + current, 0)}</span>
          <span>Your speed: {playersState.filter(p => p.local).map(p => Math.sqrt(p.vx ** 2 + p.vy ** 2) * 60)[0]}</span>
        </div>
      </div>
    </div>
  );
}
