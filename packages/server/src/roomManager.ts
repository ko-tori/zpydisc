import { WebSocket } from 'ws';
import {
  ClientMessage,
  ServerMessage,
  ZpyGame,
  chooseBotBottomAndFriends,
  chooseBotDeclaration,
  chooseBotPlay,
} from '@zpy/shared';

interface ConnectedClient {
  userId: string;
  ws: WebSocket;
}

class GameRoom {
  public readonly game = new ZpyGame();
  private clients = new Map<string, ConnectedClient>();
  private botCounter = 0;
  private dealTimer: ReturnType<typeof setInterval> | null = null;
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private dealEndTime?: number;

  constructor(public readonly channelId: string) {}

  handleJoin(
    ws: WebSocket,
    userId: string,
    name: string,
    avatarUri: string
  ): void {
    this.clients.set(userId, { userId, ws });
    try {
      this.game.addPlayer(userId, name, avatarUri, false);
    } catch {
      // Player joined mid-round as spectator; still receives state updates
    }
    this.broadcastState();
  }

  handleDisconnect(userId: string, ws: WebSocket): void {
    const existing = this.clients.get(userId);
    if (existing && existing.ws === ws) {
      this.clients.delete(userId);
      if (this.game.phase === 'lobby') {
        this.game.removePlayer(userId);
        this.broadcastState();
      }
    }
  }

  isEmpty(): boolean {
    return this.clients.size === 0;
  }

  dispose(): void {
    if (this.dealTimer) clearInterval(this.dealTimer);
    if (this.botTimer) clearTimeout(this.botTimer);
  }

  handleMessage(userId: string, msg: ClientMessage): void {
    const playerIndex = this.game.players.findIndex((p) => p.id === userId);
    try {
      switch (msg.type) {
        case 'addBot': {
          if (this.game.phase !== 'lobby') {
            throw new Error('Can only add bots in lobby.');
          }
          this.botCounter++;
          const botId = `bot-${this.botCounter}`;
          this.game.addPlayer(botId, `Bot ${this.botCounter}`, '', true);
          this.broadcastState();
          break;
        }
        case 'removeBot': {
          if (this.game.phase !== 'lobby') {
            throw new Error('Can only remove bots in lobby.');
          }
          const target = this.game.players.find((p) => p.id === msg.botId && p.isBot);
          if (target) {
            this.game.removePlayer(target.id);
            this.broadcastState();
          }
          break;
        }
        case 'updateSettings': {
          this.game.updateSettings(msg.settings);
          this.broadcastState();
          break;
        }
        case 'startRound': {
          this.clearTimers();
          this.game.startRound();
          this.broadcastState();
          this.startDealLoop();
          break;
        }
        case 'declare': {
          if (playerIndex === -1) throw new Error('Spectators cannot declare.');
          this.game.declare(playerIndex, msg.card, msg.amount);
          this.broadcastState();
          break;
        }
        case 'endDealPhase': {
          // Fixed 5-second overturn window after dealing; cannot skip early
          break;
        }
        case 'endBottomPhase': {
          if (playerIndex !== this.game.dealerIndex) {
            throw new Error('Only the dealer can submit the bottom.');
          }
          this.game.endBottomPhase(msg.bottom, msg.friendCalls);
          this.broadcastState();
          this.scheduleBotAction();
          break;
        }
        case 'makePlay': {
          if (playerIndex === -1) throw new Error('Spectators cannot play.');
          this.game.makePlay(playerIndex, msg.cards);
          this.broadcastState();
          this.scheduleBotAction();
          break;
        }
        case 'resetGame': {
          const didReset = this.game.voteReset(userId);
          if (didReset) {
            this.clearTimers();
          }
          this.broadcastState();
          break;
        }
        default:
          break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid action.';
      this.sendTo(userId, { type: 'error', message });
    }
  }

  private startDealLoop(): void {
    const interval = Math.max(30, this.game.settings.dealIntervalMs);
    this.dealTimer = setInterval(() => {
      if (this.game.phase !== 'deal') {
        this.clearTimers();
        return;
      }
      const dealt = this.game.dealCard();
      if (dealt) {
        // Give bots a chance to declare if nobody has declared yet
        const p = this.game.players[dealt.playerIndex];
        if (p?.isBot) {
          const decl = chooseBotDeclaration(this.game, dealt.playerIndex);
          if (decl) {
            try {
              this.game.declare(dealt.playerIndex, decl.card, decl.amount);
            } catch {
              // ignore invalid bot declaration
            }
          }
        }
        this.broadcastState();
      } else {
        // Finished dealing all non-bottom cards — fixed 5s window to allow overturns
        if (this.dealTimer) {
          clearInterval(this.dealTimer);
          this.dealTimer = null;
        }
        this.dealEndTime = Date.now() + 5000;
        this.broadcastState();
        this.botTimer = setTimeout(() => {
          this.dealEndTime = undefined;
          if (this.game.phase === 'deal') {
            this.game.endDealPhase();
            this.broadcastState();
            this.scheduleBotAction();
          }
        }, 5000);
      }
    }, interval);
  }

  private scheduleBotAction(): void {
    if (this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }

    if (this.game.phase === 'bottom') {
      const dealer = this.game.players[this.game.dealerIndex];
      if (dealer?.isBot) {
        this.botTimer = setTimeout(() => {
          if (this.game.phase !== 'bottom') return;
          const { bottom, friendCalls } = chooseBotBottomAndFriends(
            this.game,
            this.game.dealerIndex
          );
          this.game.endBottomPhase(bottom, friendCalls);
          this.broadcastState();
          this.scheduleBotAction();
        }, 600);
      }
      return;
    }

    if (this.game.phase === 'play') {
      const active = this.game.players[this.game.currentTurn];
      if (active?.isBot) {
        this.botTimer = setTimeout(() => {
          if (this.game.phase !== 'play') return;
          const cards = chooseBotPlay(this.game, this.game.currentTurn);
          this.game.makePlay(this.game.currentTurn, cards);
          this.broadcastState();
          this.scheduleBotAction();
        }, 500);
      }
    }
  }

  private clearTimers(): void {
    if (this.dealTimer) {
      clearInterval(this.dealTimer);
      this.dealTimer = null;
    }
    if (this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
    this.dealEndTime = undefined;
  }

  private sendTo(userId: string, msg: ServerMessage): void {
    const client = this.clients.get(userId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(msg));
    }
  }

  private broadcastState(): void {
    for (const [userId, client] of this.clients) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;
      const idx = this.game.players.findIndex((p) => p.id === userId);
      const view = this.game.getClientView(idx);
      if (this.dealEndTime !== undefined) {
        view.dealEndTime = this.dealEndTime;
      }
      const msg: ServerMessage = {
        type: 'state',
        state: view,
      };
      client.ws.send(JSON.stringify(msg));
    }
  }
}

export class RoomManager {
  private rooms = new Map<string, GameRoom>();

  getOrCreateRoom(channelId: string): GameRoom {
    let room = this.rooms.get(channelId);
    if (!room) {
      room = new GameRoom(channelId);
      this.rooms.set(channelId, room);
    }
    return room;
  }

  cleanupIfEmpty(channelId: string): void {
    const room = this.rooms.get(channelId);
    if (room && room.isEmpty()) {
      room.dispose();
      this.rooms.delete(channelId);
    }
  }
}
