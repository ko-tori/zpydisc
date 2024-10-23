import * as React from 'react';
import { Player as PlayerState } from '../../../server/src/entities/Player';
import './Player.css';

export function Player(player: PlayerState) {
  return (
    <img className="player__avatar" src={player.avatarUri} width="100%" height="100%" />
  );
}
