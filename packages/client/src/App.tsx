import { GameTable } from './components/GameTable';
import { Lobby } from './components/Lobby';
import { useGameConnection } from './hooks/useGameConnection';

export function App() {
  const { identity, state, status, error, send, clearError } = useGameConnection();

  if (!identity || !state) {
    return (
      <div className="loading">
        <div className="loading__card">
          <h1>Zhaopengyou (找朋友)</h1>
          <p>{error ? error : status}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {error && (
        <div className="toast-error" onClick={clearError}>
          <span>{error}</span>
          <button type="button" className="btn btn--ghost btn--sm">
            ✕
          </button>
        </div>
      )}
      {state.phase === 'lobby' ? (
        <Lobby state={state} identity={identity} send={send} />
      ) : (
        <GameTable state={state} send={send} />
      )}
    </div>
  );
}
