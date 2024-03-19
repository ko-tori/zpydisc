import { Room, Client } from 'colyseus';
import { TPlayerOptions, updatePlayer } from '../entities/Player';
import { State, IState } from '../entities/State';

export class StateHandlerRoom extends Room<State> {
  maxClients = 1000;

  onCreate(options: IState) {
    this.setState(new State(options));

    this.onMessage('keyDown', (client, _data) => {
      this.state.handleKeyDown(client.sessionId, _data);
    });

    this.onMessage('keyUp', (client, _data) => {
      this.state.handleKeyUp(client.sessionId, _data);
    });

    this.setSimulationInterval((deltaTime) => this.update(deltaTime));
  }

  onAuth(_client: any, _options: any, _req: any) {
    return true;
  }

  onJoin(client: Client, options: TPlayerOptions) {
    this.state.createPlayer(client.sessionId, options);
  }

  onLeave(client: Client) {
    this.state.removePlayer(client.sessionId);
  }

  onDispose() {
    console.log('Dispose StateHandlerRoom');
  }

  update(deltaTime: number) {
    this.state.players.forEach(player => {
      updatePlayer(player, deltaTime);
    });

    const players = [...this.state.players.values()];
    for (let i = 0; i < players.length; i++) {
      for (let j = 0; j < i; j++) {
        const player = players[i];
        const player2 = players[j];
        const m1 = player.r ** 2;
        const m2 = player2.r ** 2;
        const r1 = player.r;
        const r2 = player2.r;
        const v1: Vec2 = [player.vx, player.vy];
        const v2: Vec2 = [player2.vx, player2.vy];
        const x1: Vec2 = [player.x, player.y];
        const x2: Vec2 = [player2.x, player2.y];
        if (mag(sub(x1, x2)) > r1 + r2) continue;
        const coll: Vec2 = lerp(x1, x2, r1 / (r1 + r2));
        const cx1 = sub(x1, coll);
        const cx2 = sub(x2, coll);
        [player.x, player.y] = add(coll, mul(r1 / mag(cx1), cx1));
        [player2.x, player2.y] = add(coll, mul(r2 / mag(cx2), cx2));
        [player.vx, player.vy] = sub(v1, mul(2 * m2 / (m1 + m2) * dot(sub(v1, v2), sub(x1, x2)) / mag(sub(x1, x2)) ** 2, sub(x1, x2)));
        [player2.vx, player2.vy] = sub(v2, mul(2 * m1 / (m1 + m2) * dot(sub(v2, v1), sub(x2, x1)) / mag(sub(x2, x1)) ** 2, sub(x2, x1)));
      }
    }
  }
}

type Vec2 = [x: number, y: number];
const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];
const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const mul = (a: number, b: Vec2): Vec2 => [a * b[0], a * b[1]];
const mag = (a: Vec2) => Math.sqrt(a[0] ** 2 + a[1] ** 2);
const lerp = (a: Vec2, b: Vec2, t: number) => add(a, mul(t, sub(b, a)));