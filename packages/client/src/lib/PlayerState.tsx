import * as React from 'react';
import { MAX_X, MAX_Y, MIN_X, MIN_Y, FRAME_TIME, MAX_SPEED, KEYS_TO_RECORD, WALL_ELASTICITY, ACCELERATION } from '../../../server/src/shared/Constants';

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

function normalizeVelocity(player: PlayerState) {
    const m = Math.sqrt(player.vx ** 2 + player.vy ** 2);
    if (m > MAX_SPEED) {
        return [player.vx * MAX_SPEED / m, player.vy * MAX_SPEED / m];
    } else {
        return [player.vx, player.vy];
    }
}

export function nextState(player: PlayerState, deltaTime: number, keys: Map<string, boolean>) {
    const newPlayer = { ...player };
    if (!newPlayer.local) {
        newPlayer.localX = lerp(newPlayer.localX, newPlayer.x, 0.2);
        newPlayer.localY = lerp(newPlayer.localY, newPlayer.y, 0.2);
        return newPlayer;
    }
    const frameCt = deltaTime / FRAME_TIME;
    newPlayer.x += newPlayer.vx * frameCt;
    newPlayer.y += newPlayer.vy * frameCt;
    if (newPlayer.x > MAX_X - player.r) {
        newPlayer.x = MAX_X - player.r;
        newPlayer.vx *= -WALL_ELASTICITY;
    }
    if (newPlayer.x < MIN_X + player.r) {
        newPlayer.x = MIN_X + player.r;
        newPlayer.vx *= -WALL_ELASTICITY;
    }
    if (newPlayer.y > MAX_Y - player.r) {
        newPlayer.y = MAX_Y - player.r;
        newPlayer.vy *= -WALL_ELASTICITY;
    }
    if (newPlayer.y < MIN_Y + player.r) {
        newPlayer.y = MIN_Y + player.r;
        newPlayer.vy *= -WALL_ELASTICITY;
    }

    if (keys.get('KeyW')) {
        newPlayer.vy += ACCELERATION * frameCt;
    }
    if (keys.get('KeyA')) {
        newPlayer.vx -= ACCELERATION * frameCt;
    }
    if (keys.get('KeyS')) {
        newPlayer.vy -= ACCELERATION * frameCt;
    }
    if (keys.get('KeyD')) {
        newPlayer.vx += ACCELERATION * frameCt;
    }

    normalizeVelocity(newPlayer);

    newPlayer.localX = newPlayer.x;
    newPlayer.localY = newPlayer.y;

    return newPlayer;
}