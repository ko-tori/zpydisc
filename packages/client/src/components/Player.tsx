import * as React from 'react';
import { PlayerState } from '../lib/PlayerState';
import { WIDTH, HEIGHT } from '../../../server/src/shared/Constants';
import './Player.css';

export function Player(player: PlayerState) {
  return (
    <img className="player__avatar" src={player.avatarUri} width="100%" height="100%" style={{ top: `${100 - 100 * player.localY / HEIGHT}%`, left: `${100 * player.localX / WIDTH}%`, width: `${100 * player.r * 2 / WIDTH}%`, height: `${100 * player.r * 2 / HEIGHT}%` }} />
  );
}
