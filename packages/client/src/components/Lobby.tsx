import { ClientGameState, ClientMessage } from '@zpy/shared';
import { DiscordIdentity } from '../discord';

interface LobbyProps {
  state: ClientGameState;
  identity: DiscordIdentity;
  send: (msg: ClientMessage) => void;
}

export function Lobby({ state, identity, send }: LobbyProps) {
  const { players, settings } = state;

  return (
    <div className="lobby">
      <div className="lobby__header">
        <h1>Zhaopengyou (找朋友)</h1>
        <p className="lobby__subtitle">
          Channel: <code>{identity.channelId}</code>
          {!identity.isEmbedded && ' · Local Test Mode (open more tabs with ?user_id=p2)'}
        </p>
      </div>

      <div className="lobby__grid">
        <section className="panel">
          <div className="panel__title-row">
            <h2>Players ({players.length})</h2>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => send({ type: 'addBot' })}
            >
              + Add Bot
            </button>
          </div>
          <ul className="player-list">
            {players.map((p, idx) => (
              <li key={p.id} className="player-list__item">
                <div className="player-list__info">
                  {p.avatarUri ? (
                    <img src={p.avatarUri} alt={p.name} className="avatar" />
                  ) : (
                    <div className="avatar avatar--placeholder">
                      {p.isBot ? '🤖' : p.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span>
                    <strong>{p.name}</strong>
                    {p.id === identity.userId && <span className="badge badge--you">You</span>}
                    {p.isBot && <span className="badge">Bot</span>}
                  </span>
                </div>
                <div className="player-list__right">
                  <span className="rank-pill">Rank {p.rank}</span>
                  {p.isBot && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => send({ type: 'removeBot', botId: p.id })}
                    >
                      Remove
                    </button>
                  )}
                  <span className="seat-label">Seat {idx + 1}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Table Settings</h2>
          <div className="settings-form">
            <label className="setting-row">
              <span>Number of Decks</span>
              <select
                value={settings.numDecks}
                onChange={(e) =>
                  send({
                    type: 'updateSettings',
                    settings: { numDecks: Number(e.target.value) },
                  })
                }
              >
                {[1, 2, 3, 4].map((d) => (
                  <option key={d} value={d}>
                    {d} Deck{d > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="setting-row">
              <span>Ace-Low Wraparound Tractors (AA2233)</span>
              <input
                type="checkbox"
                checked={settings.wraparound}
                onChange={(e) =>
                  send({
                    type: 'updateSettings',
                    settings: { wraparound: e.target.checked },
                  })
                }
              />
            </label>

            <label className="setting-row">
              <span>Only Previous Winners Declare</span>
              <input
                type="checkbox"
                checked={settings.winnersDeclare}
                onChange={(e) =>
                  send({
                    type: 'updateSettings',
                    settings: { winnersDeclare: e.target.checked },
                  })
                }
              />
            </label>

            <label className="setting-row">
              <span>Bottom Point Multiplier</span>
              <select
                value={settings.bottomMultiplier}
                onChange={(e) =>
                  send({
                    type: 'updateSettings',
                    settings: { bottomMultiplier: Number(e.target.value) },
                  })
                }
              >
                {[1, 2, 3, 4].map((m) => (
                  <option key={m} value={m}>
                    {m}x
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="button"
            className="btn btn--primary btn--lg lobby__start"
            disabled={players.length < 2}
            onClick={() => send({ type: 'startRound' })}
          >
            Start Round ({players.length} Players)
          </button>
          {players.length < 2 && (
            <p className="hint">Add at least 1 more player or bot to start.</p>
          )}
        </section>
      </div>
    </div>
  );
}
