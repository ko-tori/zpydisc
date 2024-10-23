import { Client } from "colyseus";
import { Schema, filter, type, ArraySchema } from '@colyseus/schema';
import { Card, BasicNum, BASIC_NUMS } from 'zpy/src/Card';

export type TPlayerOptions = Pick<Player, 'sessionId' | 'userId' | 'name' | 'avatarUri' | 'index'>;

export class Player extends Schema {
  @type('string')
  public sessionId: string;

  @type('string')
  public userId: string;

  @type('string')
  public avatarUri: string;

  @type('string')
  public name: string;

  @type('number') index: number;

  @filter(function (this: Player, client: Client) {
    return client.sessionId === this.sessionId;
  })
  @type(['string']) hand = new ArraySchema<Card>();

  @type(['string']) points = new ArraySchema<Card>();

  @type('string') rank: BasicNum;

  // Init
  constructor({ name, userId, avatarUri, sessionId, index }: TPlayerOptions) {
    super();
    this.userId = userId;
    this.avatarUri = avatarUri;
    this.name = name;
    this.sessionId = sessionId;
    this.rank = '2';
    this.index = index;
  }

  /** Returns true if the player has won. */
  incrementRank(n = 1) {
    this.rank = BASIC_NUMS[BASIC_NUMS.indexOf(this.rank) + n];
    return !this.rank;
  }

  newRound() {
    this.points = new ArraySchema<Card>();
    this.hand = new ArraySchema<Card>();
  }
}