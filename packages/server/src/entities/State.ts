import { Client } from 'colyseus';
import { Schema, MapSchema, type, filter } from '@colyseus/schema';
import { TPlayerOptions, Player } from './Player';
import { FriendCall, GameState } from './GameState';
import { Card } from "zpy/src/Card";
import { Play } from 'zpy/src/Play';

export interface IState {
  roomName: string;
  channelId: string;
  inLobby: boolean;
}

export class State extends Schema {
  @type({ map: Player })
  players = new MapSchema<Player>();

  @type('string')
  public roomName: string;

  @type('string')
  public channelId: string;

  @type('boolean')
  public inLobby: boolean;

  @filter(function (this: State, client: Client, value: GameState, root: Schema) { return !this.inLobby; })
  @type(GameState) gameState?: GameState;

  constructor(attributes: IState) {
    super();
    this.roomName = attributes.roomName;
    this.channelId = attributes.channelId;
    this.inLobby = attributes.inLobby;
  }

  private _getPlayer(sessionId: string): Player | undefined {
    return Array.from(this.players.values()).find((p) => p.sessionId === sessionId);
  }

  createPlayer(sessionId: string, playerOptions: TPlayerOptions) {
    const existingPlayer = Array.from(this.players.values()).find((p) => p.sessionId === sessionId);
    if (existingPlayer == null) {
      this.players.set(playerOptions.userId, new Player({ ...playerOptions, sessionId }));
    }
  }

  removePlayer(sessionId: string) {
    const player = Array.from(this.players.values()).find((p) => p.sessionId === sessionId);
    if (player != null) {
      this.players.delete(player.userId);
    }
  }

  startRound(playerId: string) {

  }

  declare(playerId: string, card: Card, amount?: number) {

  }
  endDealPhase(playerId: string) {

  }
  endBottomPhase(playerId: string, card: Card, friendCalls: FriendCall[]) {

  }
  makePlay(playerId: string, play: Play[]) {

  }
}
