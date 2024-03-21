import { Schema, MapSchema, type } from '@colyseus/schema';
import { WIDTH, HEIGHT, FRAME_TIME, MAX_SPEED, KEYS_TO_RECORD, WALL_ELASTICITY, ACCELERATION, MAX_ACCELERATION } from '../shared/Constants';

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

  @type('number')
  public destX: number;

  @type('number')
  public destY: number;

  @type('boolean')
  public dest: boolean;

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
    this.x = Math.random() * (WIDTH - 2 * this.r) + this.r;
    this.y = Math.random() * (HEIGHT - 2 * this.r) + this.r;
    this.vx = 0;
    this.vy = 0;
    this.destX = 0;
    this.destY = 0;
    this.dest = false;
  }
}

function cap(x: number, y: number, m: number) {
  const m2 = Math.sqrt(x ** 2 + y ** 2);
  if (m2 > m) {
    return [x * m / m2, y * m / m2];
  }
  return [x, y];
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
  if (player.x > WIDTH - player.r) {
    player.x = WIDTH - player.r;
    player.vx *= -WALL_ELASTICITY;
  }
  if (player.x < player.r) {
    player.x = player.r;
    player.vx *= -WALL_ELASTICITY;
  }
  if (player.y > HEIGHT - player.r) {
    player.y = HEIGHT - player.r;
    player.vy *= -WALL_ELASTICITY;
  }
  if (player.y < player.r) {
    player.y = player.r;
    player.vy *= -WALL_ELASTICITY;
  }

  let ax = 0;
  let ay = 0;

  if (player.dest) {
    ax += (player.destX - player.x) / 1000;
    ay += (player.destY - player.y) / 1000;
  }

  if (player.keys.get('KeyW')) {
    ay += ACCELERATION * frameCt;
  }
  if (player.keys.get('KeyA')) {
    ax -= ACCELERATION * frameCt;
  }
  if (player.keys.get('KeyS')) {
    ay -= ACCELERATION * frameCt;
  }
  if (player.keys.get('KeyD')) {
    ax += ACCELERATION * frameCt;
  }

  [ax, ay] = cap(ax, ay, MAX_ACCELERATION);

  player.vx += ax;
  player.vy += ay;

  [player.vx, player.vy] = cap(player.vx, player.vy, MAX_SPEED);
}