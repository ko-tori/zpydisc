import { useEffect, useMemo, useState } from 'react';
import {
  BASIC_NUMS,
  BASIC_SUITS,
  Card,
  ClientGameState,
  ClientMessage,
  Play,
  countCards,
  formatCard,
  getPointValue,
  selectableCards,
} from '@zpy/shared';
import { CardView } from './CardView';

interface GameTableProps {
  state: ClientGameState;
  send: (msg: ClientMessage) => void;
}

const ALL_CALLABLE_CARDS: Card[] = [
  'BJ',
  'SJ',
  ...BASIC_SUITS.flatMap((s) => [...BASIC_NUMS].reverse().map((n) => `${n}${s}` as Card)),
];

export function GameTable({ state, send }: GameTableProps) {
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [showLastTrick, setShowLastTrick] = useState(false);

  const expectedFriendCalls = Math.max(0, state.teamSize - 1);
  const [friendCalls, setFriendCalls] = useState<{ card: Card; nth: number }[]>([]);

  // Reset selection when phase, turn, or hand changes
  useEffect(() => {
    setSelectedIndices([]);
  }, [state.phase, state.myHand.length, state.currentTurn]);

  useEffect(() => {
    if (state.phase === 'bottom') {
      setFriendCalls(
        Array.from({ length: expectedFriendCalls }, () => ({ card: 'AS' as Card, nth: 1 }))
      );
    }
  }, [state.phase, expectedFriendCalls]);

  const myPlayer = state.myIndex >= 0 ? state.players[state.myIndex] : null;
  const isMyTurn = state.phase === 'play' && state.currentTurn === state.myIndex;
  const isDealerBottom = state.phase === 'bottom' && state.dealerIndex === state.myIndex;

  const selectedCards = useMemo(
    () => selectedIndices.map((idx) => state.myHand[idx]).filter(Boolean),
    [selectedIndices, state.myHand]
  );

  // Compute legal selectable cards during play phase
  const allowedCardSet = useMemo(() => {
    if (!isMyTurn || !state.declared) return null;
    const leadPlays =
      state.currentTrick.length > 0
        ? state.currentTrick[0].plays.map((p) => Play.fromJSON(p))
        : [];
    return selectableCards(
      state.myHand,
      selectedCards,
      leadPlays,
      state.declared,
      state.settings.wraparound
    );
  }, [isMyTurn, state.declared, state.currentTrick, state.myHand, selectedCards, state.settings.wraparound]);

  // Available declarations during deal phase
  const declarationOptions = useMemo(() => {
    if (state.phase !== 'deal' || !myPlayer) return [];
    const counts = countCards(state.myHand);
    const prev = state.declarations[state.declarations.length - 1];
    const minAmount = prev ? prev.amount + 1 : 1;
    const options: { card: Card; amount: number }[] = [];

    for (const suit of BASIC_SUITS) {
      const card = `${myPlayer.rank}${suit}` as Card;
      const owned = counts.get(card) ?? 0;
      for (let amt = minAmount; amt <= owned; amt++) {
        options.push({ card, amount: amt });
      }
      // Reinforce option
      if (
        prev &&
        prev.canPrevPlayerReinforce &&
        prev.prevPlayer === state.myIndex &&
        owned >= prev.amount
      ) {
        const orig = state.declarations[state.declarations.length - 2];
        if (orig && orig.card === card) {
          options.push({ card, amount: prev.amount });
        }
      }
    }
    return options;
  }, [state.phase, state.myHand, state.declarations, state.myIndex, myPlayer]);

  const toggleCardIndex = (idx: number) => {
    setSelectedIndices((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  const defenderPoints = useMemo(() => {
    let total = 0;
    for (const p of state.players) {
      if (!p.isFriend) {
        for (const c of p.points) total += getPointValue(c);
      }
    }
    return total;
  }, [state.players]);

  const cutoff = state.settings.numDecks * state.settings.cutoffPerDeck;

  const displayedTrick = showLastTrick ? state.lastTrick : state.currentTrick;

  return (
    <div className="table-layout">
      <header className="hud">
        <div className="hud__group">
          <span className="hud__pill">Phase: {state.phase.toUpperCase()}</span>
          <span className="hud__pill">
            Trump: <strong>{state.declared ? formatCard(state.declared) : 'Undeclared'}</strong>
          </span>
          <span className="hud__pill">
            Defender Pts: <strong>{defenderPoints}</strong> / {cutoff}
          </span>
        </div>
        <div className="hud__group">
          {state.friendCalls.length > 0 && (
            <span className="hud__pill">
              Friends:{' '}
              {state.friendCalls.map((fc, i) => (
                <strong key={i} className={fc.revealedBy !== undefined ? 'revealed' : ''}>
                  {i > 0 ? ', ' : ''}
                  #{fc.nth} {formatCard(fc.card)}
                  {fc.revealedBy !== undefined ? ` (${state.players[fc.revealedBy]?.name})` : ''}
                </strong>
              ))}
            </span>
          )}
          {state.lastTrick.length > 0 && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setShowLastTrick((v) => !v)}
            >
              {showLastTrick ? 'Current Trick' : 'Last Trick'}
            </button>
          )}
        </div>
      </header>

      {state.lastNotice && <div className="notice">{state.lastNotice}</div>}

      <section className="seats">
        {state.players.map((p, idx) => {
          const isTurn =
            (state.phase === 'play' && state.currentTurn === idx) ||
            (state.phase === 'bottom' && state.dealerIndex === idx);
          const trickEntry = displayedTrick.find((t) => t.player === idx);
          const pts = p.points.reduce((s, c) => s + getPointValue(c), 0);

          return (
            <div
              key={p.id}
              className={`seat ${isTurn ? 'seat--active' : ''} ${idx === state.myIndex ? 'seat--me' : ''}`}
            >
              <div className="seat__header">
                <span className="seat__name">
                  {p.name} {p.isBot ? '🤖' : ''}
                </span>
                <div className="seat__badges">
                  <span className="rank-pill">R:{p.rank}</span>
                  {p.isDealer && <span className="badge badge--dealer">Dealer</span>}
                  {p.isFriend && !p.isDealer && <span className="badge badge--friend">Friend</span>}
                </div>
              </div>
              <div className="seat__meta">
                <span>Cards: {p.handCount}</span>
                {!p.isFriend && <span>Pts: {pts}</span>}
              </div>
              <div className="seat__trick">
                {trickEntry ? (
                  trickEntry.cards.map((c, ci) => (
                    <CardView key={ci} card={c} declared={state.declared} compact />
                  ))
                ) : (
                  <span className="seat__empty">—</span>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* Phase Action Area */}
      <section className="action-bar">
        {state.phase === 'deal' && (
          <div className="deal-controls">
            <span>
              {state.deckRemaining > state.bottomSize
                ? `Dealing... (${state.deckRemaining - state.bottomSize} cards left)`
                : 'Dealing complete — finalize trump!'}
            </span>
            <div className="deal-controls__btns">
              {declarationOptions.map((opt, i) => (
                <button
                  key={i}
                  type="button"
                  className="btn btn--primary"
                  onClick={() => send({ type: 'declare', card: opt.card, amount: opt.amount })}
                >
                  Declare {opt.amount}× {formatCard(opt.card)}
                </button>
              ))}
              {state.deckRemaining <= state.bottomSize && (
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => send({ type: 'endDealPhase' })}
                >
                  Start Bottom Phase
                </button>
              )}
            </div>
          </div>
        )}

        {state.phase === 'bottom' && (
          <div className="bottom-controls">
            {isDealerBottom ? (
              <>
                <div className="bottom-controls__row">
                  <span>
                    Select <strong>{state.bottomSize}</strong> cards to bury ({selectedCards.length}/
                    {state.bottomSize})
                  </span>
                  {friendCalls.map((fc, i) => (
                    <span key={i} className="friend-picker">
                      Friend #{i + 1}:
                      <select
                        value={fc.nth}
                        onChange={(e) => {
                          const next = [...friendCalls];
                          next[i] = { ...next[i], nth: Number(e.target.value) };
                          setFriendCalls(next);
                        }}
                      >
                        {Array.from({ length: state.settings.numDecks }, (_, k) => k + 1).map(
                          (n) => (
                            <option key={n} value={n}>
                              {n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`}
                            </option>
                          )
                        )}
                      </select>
                      <select
                        value={fc.card}
                        onChange={(e) => {
                          const next = [...friendCalls];
                          next[i] = { ...next[i], card: e.target.value as Card };
                          setFriendCalls(next);
                        }}
                      >
                        {ALL_CALLABLE_CARDS.map((c) => (
                          <option key={c} value={c}>
                            {formatCard(c)}
                          </option>
                        ))}
                      </select>
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={selectedCards.length !== state.bottomSize}
                  onClick={() =>
                    send({
                      type: 'endBottomPhase',
                      bottom: selectedCards,
                      friendCalls,
                    })
                  }
                >
                  Bury Bottom & Start Play
                </button>
              </>
            ) : (
              <span>
                Waiting for dealer ({state.players[state.dealerIndex]?.name}) to bury bottom & call
                friends...
              </span>
            )}
          </div>
        )}

        {state.phase === 'play' && (
          <div className="play-controls">
            <span>
              {isMyTurn
                ? state.currentTrick.length === 0
                  ? 'Your turn — lead any single, pair, tractor, or suited throw'
                  : `Your turn — follow the trick (${state.currentTrick[0].cards.length} card${state.currentTrick[0].cards.length > 1 ? 's' : ''})`
                : `Waiting for ${state.players[state.currentTurn]?.name}...`}
            </span>
            {isMyTurn && (
              <div className="play-controls__btns">
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={selectedIndices.length === 0}
                  onClick={() => setSelectedIndices([])}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={selectedCards.length === 0}
                  onClick={() => send({ type: 'makePlay', cards: selectedCards })}
                >
                  Play Selected ({selectedCards.length})
                </button>
              </div>
            )}
          </div>
        )}

        {state.phase === 'score' && state.lastRoundResult && (
          <div className="score-panel">
            <h2>Round Complete</h2>
            <p>
              Defender Points: <strong>{state.lastRoundResult.points}</strong> (Cutoff: {cutoff})
              {state.lastRoundResult.bottomCapturedByDefenders &&
                ` — includes +${state.lastRoundResult.bottomPoints} from bottom!`}
            </p>
            <p>
              Winners:{' '}
              <strong>
                {state.lastRoundResult.winners.map((i) => state.players[i]?.name).join(', ')}
              </strong>{' '}
              (+{state.lastRoundResult.levelChange} level
              {state.lastRoundResult.levelChange > 1 ? 's' : ''})
            </p>
            <div className="score-panel__bottom">
              <span>Bottom cards:</span>
              {state.lastRoundResult.bottom.map((c, i) => (
                <CardView key={i} card={c} declared={state.declared} compact />
              ))}
            </div>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => send({ type: 'startRound' })}
            >
              Start Next Round
            </button>
          </div>
        )}
      </section>

      {/* Player Hand */}
      {state.myIndex >= 0 && (
        <section className="hand-area">
          <div className="hand">
            {state.myHand.map((card, idx) => {
              const isSelected = selectedIndices.includes(idx);
              let disabled = false;
              if (state.phase === 'play') {
                if (!isMyTurn) {
                  disabled = true;
                } else if (!isSelected && allowedCardSet && !allowedCardSet.has(card)) {
                  disabled = true;
                }
              } else if (state.phase === 'bottom') {
                disabled = !isDealerBottom || (!isSelected && selectedCards.length >= state.bottomSize);
              } else {
                disabled = true;
              }

              return (
                <CardView
                  key={`${card}-${idx}`}
                  card={card}
                  declared={state.declared}
                  selected={isSelected}
                  disabled={disabled}
                  onClick={() => toggleCardIndex(idx)}
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
