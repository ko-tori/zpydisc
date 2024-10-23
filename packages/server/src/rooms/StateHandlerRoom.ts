import { Room, Client } from 'colyseus';
import { TPlayerOptions } from '../entities/Player';
import { State, IState } from '../entities/State';

export class StateHandlerRoom extends Room<State> {
  maxClients = 1000;

  onCreate(options: IState) {
    this.setState(new State(options));

    this.onMessage('startRound', (client) => {
      this.state.startRound(client.sessionId);
    });

    this.onMessage('declare', (client, _data) => {
      this.state.declare(client.sessionId, _data.card, _data.amount);
    });

    this.onMessage('endDealPhase', client => {
      this.state.endDealPhase(client.sessionId);
    });

    this.onMessage('endBottomPhase', (client, _data) => {
      this.state.endBottomPhase(client.sessionId, _data.card, _data.friendCalls);
    });

    this.onMessage('makePlay', (client, _data) => {
      this.state.makePlay(client.sessionId, _data.play);
    });
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
}
