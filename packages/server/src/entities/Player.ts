import { Schema, MapSchema, type } from '@colyseus/schema';
import { MAX_X, MAX_Y, MIN_X, MIN_Y, FRAME_TIME, MAX_SPEED, KEYS_TO_RECORD, WALL_ELASTICITY, ACCELERATION } from '../shared/Constants';

export type TPlayerOptions = Pick<Player, 'sessionId' | 'userId' | 'name' | 'avatarUri' | 'x' | 'y'>;

export class Player extends Schema {
  @type('string')
  public sessionId: string;

  @type('string')
  public userId: string;

  @type('string')
  public avatarUri: string;

  @type('string')
  public name: string;

  @type('number')
  public x: number;

  @type('number')
  public y: number;

  @type('number')
  public vx: number;

  @type('number')
  public vy: number;

  @type('number')
  public r: number;

  @type({ map: "boolean" })
  public keys = new MapSchema<boolean>();

  // Init
  constructor({ name, userId, avatarUri, sessionId }: TPlayerOptions) {
    super();
    this.userId = userId;
    this.avatarUri = avatarUri;
    this.name = name;
    this.sessionId = sessionId;
    this.r = Math.random() * 100 + 50;
    this.x = Math.random() * (MAX_X - 2 * this.r) + this.r;
    this.y = Math.random() * (MAX_Y - 2 * this.r) + this.r;
    this.vx = 0;
    this.vy = 0;
  }
}

function normalizeVelocity(player: Player) {
  const m = Math.sqrt(player.vx ** 2 + player.vy ** 2);
  if (m > MAX_SPEED) {
    player.vx *= MAX_SPEED / m;
    player.vy *= MAX_SPEED / m;
  }
}

export function handleKeyDown(player: Player, code: string) {
  if (!KEYS_TO_RECORD.has(code)) return;
  player.keys.set(code, true);
}

export function handleKeyUp(player: Player, code: string) {
  if (!KEYS_TO_RECORD.has(code)) return;
  player.keys.set(code, false);
}

export function updatePlayer(player: Player, deltaTime: number) {
  const frameCt = deltaTime / FRAME_TIME;
  player.x += player.vx * frameCt;
  player.y += player.vy * frameCt;
  if (player.x > MAX_X - player.r) {
    player.x = MAX_X - player.r;
    player.vx *= -WALL_ELASTICITY;
  }
  if (player.x < MIN_X + player.r) {
    player.x = MIN_X + player.r;
    player.vx *= -WALL_ELASTICITY;
  }
  if (player.y > MAX_Y - player.r) {
    player.y = MAX_Y - player.r;
    player.vy *= -WALL_ELASTICITY;
  }
  if (player.y < MIN_Y + player.r) {
    player.y = MIN_Y + player.r;
    player.vy *= -WALL_ELASTICITY;
  }

  if (player.keys.get('KeyW')) {
    player.vy += ACCELERATION * frameCt;
  }
  if (player.keys.get('KeyA')) {
    player.vx -= ACCELERATION * frameCt;
  }
  if (player.keys.get('KeyS')) {
    player.vy -= ACCELERATION * frameCt;
  }
  if (player.keys.get('KeyD')) {
    player.vx += ACCELERATION * frameCt;
  }

  normalizeVelocity(player);
}