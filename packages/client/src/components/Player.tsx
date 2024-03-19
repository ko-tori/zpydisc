import * as React from 'react';
import { PlayerState } from '../lib/PlayerState';
import { MAX_Y } from '../../../server/src/shared/Constants';
import './Player.css';

export function Player(player: PlayerState) {
  return (
    <img className="player__avatar" src={player.avatarUri} width="100%" height="100%" style={{ top: MAX_Y - player.localY, left: player.localX, width: player.r * 2, height: player.r * 2 }} />
  );
}
