import { Card } from './cards.js';
import { ClientGameState } from './gameState.js';
import { GameSettings } from './settings.js';

export type ClientMessage =
  | {
      type: 'join';
      channelId: string;
      userId: string;
      name: string;
      avatarUri: string;
    }
  | { type: 'addBot' }
  | { type: 'removeBot'; botId: string }
  | { type: 'updateSettings'; settings: Partial<GameSettings> }
  | { type: 'startRound' }
  | { type: 'declare'; card: Card; amount: number }
  | { type: 'endDealPhase' }
  | { type: 'endBottomPhase'; bottom: Card[]; friendCalls: { card: Card; nth: number }[] }
  | { type: 'makePlay'; cards: Card[] };

export type ServerMessage =
  | { type: 'state'; state: ClientGameState }
  | { type: 'error'; message: string };
