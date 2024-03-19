import * as React from 'react';
import { Player } from './Player';
import { PlayerState, nextState } from '../lib/PlayerState';
import { MAX_X, MIN_X, MAX_Y, MIN_Y, KEYS_TO_RECORD } from '../../../server/src/shared/Constants';
import { useAuthenticatedContext } from '../hooks/useAuthenticatedContext';

import './Game.css';

export function Game() {
  const authenticatedContext = useAuthenticatedContext();

  const keyMap = new Map<string, boolean>();

  const requestRef = React.useRef<number>();
  const prevTimeRef = React.useRef<number>();

  const players = React.useRef<PlayerState[]>([]);
  const [playersState, setPlayersState] = React.useState<PlayerState[]>([]);

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
            changes.forEach(({ field, value }) => {
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
    const deltaTime = prevTimeRef.current ? timestamp - prevTimeRef.current : 16.6;
    prevTimeRef.current = timestamp;
    requestRef.current = requestAnimationFrame(animate);
    players.current = players.current.map(player => nextState(player, deltaTime, keyMap));
    setPlayersState([...players.current]);
  }

  React.useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current!);
  }, []);

  React.useEffect(() => {
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

    addEventListener('keydown', handleKeyDown);
    addEventListener('keyup', handleKeyUp);
    return () => {
      removeEventListener('keydown', handleKeyDown);
      removeEventListener('keyup', handleKeyUp);
    };
  }, [authenticatedContext]);

  return (
    <div>
      <div className="game__container" style={{ top: MIN_Y, left: MIN_X, height: MAX_Y - MIN_Y, width: MAX_X - MIN_X }}>
        {playersState.map((p) => (
          <Player key={p.userId} {...p} />
        ))}
      </div>
      <span>Total kinetic energy: {playersState.map(p => Math.floor(p.r ** 2 * (p.vx ** 2 + p.vy ** 2) / 100)).reduce((sum, current) => sum + current, 0)}</span>
      <span>Your speed: {playersState.filter(p => p.local).map(p => Math.sqrt(p.vx ** 2 + p.vy ** 2) * 60)[0]}</span>
    </div>
  );
}
