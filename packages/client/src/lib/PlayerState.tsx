import * as React from 'react';
import { WIDTH, HEIGHT, FRAME_TIME, MAX_SPEED, WALL_ELASTICITY, ACCELERATION, MAX_ACCELERATION } from '../../../server/src/shared/Constants';

const lerp = (x: number, y: number, a: number) => x * (1 - a) + y * a;

// Client side player state
export class PlayerState {
    sessionId: string;
    userId: string;
    local: boolean;
    avatarUri: string;
    name: string;
    localX: number;
    localY: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;

    constructor({ sessionId, userId, local, avatarUri, name, x, y, vx, vy, r }: { sessionId: string, userId: string, name: string, avatarUri: string, local: boolean, x: number, y: number, vx: number, vy: number, r: number }) {
        this.sessionId = sessionId;
        this.userId = userId;
        this.local = local;
        this.avatarUri = avatarUri;
        this.name = name;
        this.localX = x;
        this.localY = y;
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.r = r;
    }
}

function cap(x: number, y: number, m: number) {
    const m2 = Math.sqrt(x ** 2 + y ** 2);
    if (m2 > m) {
        return [x * m / m2, y * m / m2];
    }
    return [x, y];
}

export function nextState(player: PlayerState, deltaTime: number, keys: Map<string, boolean>, dest: [number, number] | null) {
    const newPlayer = { ...player };
    if (!newPlayer.local) {
        newPlayer.localX = lerp(newPlayer.localX, newPlayer.x, 0.2);
        newPlayer.localY = lerp(newPlayer.localY, newPlayer.y, 0.2);
        return newPlayer;
    }
    const frameCt = deltaTime / FRAME_TIME;
    newPlayer.x += newPlayer.vx * frameCt;
    newPlayer.y += newPlayer.vy * frameCt;
    if (newPlayer.x > WIDTH - player.r) {
        newPlayer.x = WIDTH - player.r;
        newPlayer.vx *= -WALL_ELASTICITY;
    }
    if (newPlayer.x < player.r) {
        newPlayer.x = player.r;
        newPlayer.vx *= -WALL_ELASTICITY;
    }
    if (newPlayer.y > HEIGHT - player.r) {
        newPlayer.y = HEIGHT - player.r;
        newPlayer.vy *= -WALL_ELASTICITY;
    }
    if (newPlayer.y < player.r) {
        newPlayer.y = player.r;
        newPlayer.vy *= -WALL_ELASTICITY;
    }

    let ax = 0;
    let ay = 0;

    if (dest) {
        ax += (dest[0] - player.x) / 1000;
        ay += (dest[1] - player.y) / 1000;
    }

    if (keys.get('KeyW')) {
        ay += ACCELERATION * frameCt;
    }
    if (keys.get('KeyA')) {
        ax -= ACCELERATION * frameCt;
    }
    if (keys.get('KeyS')) {
        ay -= ACCELERATION * frameCt;
    }
    if (keys.get('KeyD')) {
        ax += ACCELERATION * frameCt;
    }

    [ax, ay] = cap(ax, ay, MAX_ACCELERATION);

    newPlayer.vx += ax;
    newPlayer.vy += ay;

    [newPlayer.vx, newPlayer.vy] = cap(newPlayer.vx, newPlayer.vy, MAX_SPEED);

    //newPlayer.localX = lerp(newPlayer.localX, newPlayer.x, 0.2);
    //newPlayer.localY = lerp(newPlayer.localY, newPlayer.y, 0.2);
    newPlayer.localX = newPlayer.x;
    newPlayer.localY = newPlayer.y;

    return newPlayer;
}