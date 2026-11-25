import { describe, expect, it } from 'vitest';
import {
  BasicSuit,
  Card,
  Matcher,
  Play,
  ZpyGame,
  chooseBotBottomAndFriends,
  chooseBotDeclaration,
  chooseBotPlay,
  compareCards,
  computeNeeds,
  decomposeThrow,
  matchesPossibility,
  nextLargest,
  selectableCards,
} from '../src/index.js';

function suitedHand(str: string, suit: BasicSuit = 'C'): Card[] {
  return [...str].map((ch) => `${ch === 'T' ? '10' : ch}${suit}` as Card);
}

describe('cards & trump rules', () => {
  it('ranks trump declared card strictly above off-suit declared rank', () => {
    expect(compareCards('2S', '2C', '2S')).toBeGreaterThan(0);
    expect(compareCards('2C', '2H', '2S')).toBe(0);
    expect(compareCards('SJ', '2S', '2S')).toBeGreaterThan(0);
    expect(compareCards('BJ', 'SJ', '2S')).toBeGreaterThan(0);
  });

  it('does not wrap trump Ace and excludes off-suit declared rank from tractors by default', () => {
    expect(nextLargest('AS', '2S', true)).toBeNull();
    expect(nextLargest('2C', '2S', true)).toBeNull();
    expect(nextLargest('2S', '2S', true)).toBe('SJ');
    expect(nextLargest('SJ', '2S', true)).toBe('BJ');
    expect(nextLargest('AC', '2S', true)).toBe('3C');
    expect(nextLargest('AC', '3S', true)).toBe('2C');
    expect(nextLargest('AC', '3S', false)).toBeNull();
  });
});

describe('computeNeeds', () => {
  it('splits 2D tractor grids accurately', () => {
    expect(computeNeeds(3, 3, 2, 2)).toEqual([[3, 1], [1, 1], [1, 1]]);
    expect(computeNeeds(4, 4, 2, 2)).toEqual([[4, 2], [2, 2]]);
    expect(computeNeeds(4, 2, 2, 2)).toEqual([[2, 2]]);
    expect(computeNeeds(2, 4, 2, 2)).toEqual([[2, 2]]);
  });
});

describe('Matcher', () => {
  it('finds wraparound tractors of length >= 3 (AA2233)', () => {
    const m = Matcher.fromHand(suitedHand('AA2233'), [new Play('10C', 2, 3)], '4S', true);
    expect(m.getPossibilities()).toEqual([[new Play('AC', 2, 3)]]);
  });

  it('does not break a 2x2 tractor when matching a 4x1 + 2x2 trick', () => {
    const hand = suitedHand('334499JQK');
    const trick = [new Play('10C', 4, 1), new Play('QC', 2, 2)];
    const m = Matcher.fromHand(hand, trick, '2S');
    const poss = m.getPossibilities();
    expect(poss).toHaveLength(1);
    expect(matchesPossibility([new Play('9C', 2), new Play('3C', 2, 2), new Play('JC'), new Play('QC')], poss[0], '2S')).toBe(true);
    // Playing 33 + 99 + 4 + J + Q + K breaks 3344 and must be rejected
    expect(matchesPossibility([new Play('3C', 2), new Play('9C', 2), new Play('4C'), new Play('JC'), new Play('QC'), new Play('KC')], poss[0], '2S')).toBe(false);
  });

  it('matchesPossibility enforces required concrete Play cards', () => {
    const hand = suitedHand('334444466666');
    const trick = [new Play('9C', 5), new Play('JC', 2, 2)];
    const poss = Matcher.fromHand(hand, trick, '2S').getPossibilities();
    expect(poss).toEqual([[new Play('6C', 5), new Play('3C', 2, 2)]]);
    expect(matchesPossibility([new Play('6C', 5), new Play('3C', 2, 2)], poss[0], '2S')).toBe(true);
    expect(matchesPossibility([new Play('4C', 5), new Play('3C', 2, 2)], poss[0], '2S')).toBe(false);
  });

  it('beatsTrick treats Ace-low wraparound tractors as the lowest tractor', () => {
    // KKAA beats AA22
    expect(Matcher.fromHand(suitedHand('KKAA'), [new Play('AC', 2, 2)], '3S', true).beatsTrick()).toBe(true);
    // 2244 beats AA22
    expect(Matcher.fromHand(suitedHand('2244'), [new Play('AC', 2, 2)], '3S', true).beatsTrick()).toBe(true);
    // AA22 does NOT beat 2244
    expect(Matcher.fromHand(suitedHand('AA22'), [new Play('2C', 2, 2)], '3S', true).beatsTrick()).toBe(false);
    // Trump declared card beats off-suit declared rank
    expect(Matcher.fromHand(['2S', '2S'], [new Play('2C', 2)], '2S').beatsTrick()).toBe(true);
  });

  it('decomposeThrow properly groups 2x3 in 3-deck and does not split trailing pairs', () => {
    expect(decomposeThrow(suitedHand('334455'), 3, '2S')).toEqual([new Play('3C', 2, 3)]);
    expect(decomposeThrow(suitedHand('334466'), 3, '2S')).toEqual([
      new Play('3C', 2, 2),
      new Play('6C', 2, 1),
    ]);
  });

  it('selectableCards restricts choices accurately when following a tractor', () => {
    const hand: Card[] = ['2C', '2C', '3H', '3H', '4H', '4H', '5H', '5H', '5H', '7H', 'KH', 'AH'];
    const trick = [new Play('QH', 3, 3)];
    expect(selectableCards(hand, ['3H', '3H', '4H', '5H', '5H', '7H', 'KH', 'AH'], trick, '2C')).toEqual(
      new Set(['4H'])
    );
    expect(selectableCards(hand, ['3H', '3H', '4H', '4H', '5H', '5H', '7H', 'KH', 'AH'], trick, '2C')).toEqual(
      new Set()
    );
  });
});

describe('ZpyGame full round simulation with bots', () => {
  it('completes a full 4-player 2-deck round from lobby to score', () => {
    const game = new ZpyGame({ numDecks: 2, wraparound: true });
    for (let i = 0; i < 4; i++) {
      game.addPlayer(`bot-${i}`, `Bot ${i + 1}`, '', true);
    }

    game.startRound();
    expect(game.phase).toBe('deal');

    while (game.dealCard() !== null) {
      for (let i = 0; i < 4; i++) {
        const decl = chooseBotDeclaration(game, i);
        if (decl) {
          game.declare(i, decl.card, decl.amount);
          break;
        }
      }
    }

    const dealRes = game.endDealPhase();
    expect(game.phase).toBe('bottom');
    expect(dealRes.declared).toBeDefined();

    const { bottom, friendCalls } = chooseBotBottomAndFriends(game, dealRes.dealer);
    game.endBottomPhase(bottom, friendCalls);
    expect(game.phase).toBe('play');

    let safety = 0;
    while (game.phase === 'play' && safety < 500) {
      const turn = game.currentTurn;
      const cards = chooseBotPlay(game, turn);
      game.makePlay(turn, cards);
      safety++;
    }

    expect(game.phase).toBe('score');
    expect(game.lastRoundResult).toBeDefined();
    expect(game.players.every((p) => p.hand.length === 0)).toBe(true);
  });
});

describe('rejected throws', () => {
  function setupPlayPhase(hands: Card[][], declared: Card = '2S'): ZpyGame {
    const game = new ZpyGame({ numDecks: 2, wraparound: true });
    hands.forEach((_, i) => game.addPlayer(`p${i}`, `P${i}`, '', false));
    game.phase = 'play';
    game.declared = declared;
    game.dealerIndex = 0;
    game.currentTurn = 0;
    game.trickLeader = 0;
    hands.forEach((h, i) => {
      game.players[i].hand = [...h];
    });
    return game;
  }

  it('forces the beaten pair when throwing A + 55 against KK', () => {
    const game = setupPlayPhase([
      ['AC', '5C', '5C', '3D'],
      ['KC', 'KC', '4D', '5D'],
    ]);
    const res = game.makePlay(0, ['AC', '5C', '5C']);
    expect(res).toEqual({
      type: 'rejected_throw',
      forcedPlay: { card: '5C', multiplicity: 2, length: 1 },
    });
    expect(game.currentTrick[0].cards).toEqual(['5C', '5C']);
    expect(game.players[0].hand).toEqual(['AC', '3D']);
  });

  it('forces the smallest losing set when multiple components are beaten', () => {
    const game = setupPlayPhase([
      ['KC', 'KC', '5C', '3D'],
      ['AC', 'AC', '4D', '5D'],
    ]);
    const res = game.makePlay(0, ['KC', 'KC', '5C']);
    expect(res).toEqual({
      type: 'rejected_throw',
      forcedPlay: { card: '5C', multiplicity: 1, length: 1 },
    });
    expect(game.currentTrick[0].cards).toEqual(['5C']);
    expect(game.players[0].hand).toEqual(['KC', 'KC', '3D']);
  });

  it('forces the beaten tractor when throwing 4455 + A against 6677', () => {
    const game = setupPlayPhase([
      ['4C', '4C', '5C', '5C', 'AC'],
      ['6C', '6C', '7C', '7C', '3D'],
    ]);
    const res = game.makePlay(0, ['4C', '4C', '5C', '5C', 'AC']);
    expect(res).toEqual({
      type: 'rejected_throw',
      forcedPlay: { card: '4C', multiplicity: 2, length: 2 },
    });
    expect(game.currentTrick[0].cards).toEqual(['4C', '4C', '5C', '5C']);
    expect(game.players[0].hand).toEqual(['AC']);
  });

  it('allows valid throws when no opponent holds a beating set', () => {
    const game = setupPlayPhase([
      ['KC', 'KC', '3C', '3C'],
      ['AC', '4D', '5D', '6D'],
    ]);
    const res = game.makePlay(0, ['KC', 'KC', '3C', '3C']);
    expect(res).toBeNull();
    expect(game.currentTrick[0].cards).toEqual(['KC', 'KC', '3C', '3C']);
    expect(game.players[0].hand).toEqual([]);
  });
});

describe('scoring table & winners-only declare', () => {
  function finishRoundWithDefenderPoints(
    defenderPoints: number,
    friends: number[] = [0, 1]
  ): { game: ZpyGame; result: ReturnType<ZpyGame['makePlay']> } {
    const game = new ZpyGame({ numDecks: 2 });
    for (let i = 0; i < 4; i++) {
      game.addPlayer(`p${i}`, `P${i}`, '', false);
    }
    game.phase = 'play';
    game.declared = '2S';
    game.dealerIndex = 0;
    game.teamSize = 2;
    game.friends = new Set(friends);
    game.bottom = [];
    game.currentTurn = 0;
    game.trickLeader = 0;

    // Seed defender points on player 2 using 5-point cards
    const fiveCount = Math.floor(defenderPoints / 5);
    game.players[2].points = Array.from({ length: fiveCount }, () => '5C' as Card);

    // Final 1-card trick won by dealer (player 0) so bottom isn't captured
    game.players[0].hand = ['BJ'];
    game.players[1].hand = ['3C'];
    game.players[2].hand = ['4C'];
    game.players[3].hand = ['6C'];

    game.makePlay(0, ['BJ']);
    game.makePlay(1, ['3C']);
    game.makePlay(2, ['4C']);
    const result = game.makePlay(3, ['6C']);
    return { game, result };
  }

  it('defaults winnersDeclare to true', () => {
    expect(new ZpyGame().settings.winnersDeclare).toBe(true);
  });

  it('levels up dealer team by +3 (0 pts), +2 (<40 pts), +1 (40-75 pts) and applies solo multiplier', () => {
    const r0 = finishRoundWithDefenderPoints(0);
    expect(r0.game.lastRoundResult?.levelChange).toBe(3);
    expect(r0.game.players[0].rank).toBe('5');
    expect(r0.game.players[1].rank).toBe('5');
    expect(r0.game.players[2].rank).toBe('2');

    const r35 = finishRoundWithDefenderPoints(35);
    expect(r35.game.lastRoundResult?.levelChange).toBe(2);
    expect(r35.game.players[0].rank).toBe('4');

    const r40 = finishRoundWithDefenderPoints(40);
    expect(r40.game.lastRoundResult?.levelChange).toBe(1);
    expect(r40.game.players[0].rank).toBe('3');

    // Solo dealer (1v3) doubles level gain: 40 pts -> +1 * 2 = +2
    const rSolo = finishRoundWithDefenderPoints(40, [0]);
    expect(rSolo.game.lastRoundResult?.levelChange).toBe(2);
    expect(rSolo.game.players[0].rank).toBe('4');
  });

  it('gives defenders +0 levels when winning and restricts next-round declarations to them', () => {
    const { game } = finishRoundWithDefenderPoints(160);
    expect(game.lastRoundResult?.winners).toEqual([2, 3]);
    expect(game.lastRoundResult?.levelChange).toBe(0);
    expect(game.players.every((p) => p.rank === '2')).toBe(true);

    // Start next round: only defenders (players 2 & 3) may declare
    game.startRound();
    game.players[0].hand = ['2H'];
    game.players[2].hand = ['2D'];
    expect(() => game.declare(0, '2H', 1)).toThrow('Only previous round winners may declare.');
    expect(game.declare(2, '2D', 1).player).toBe(2);
  });
});

describe('no-trump joker overturns & non-trump friend calls', () => {
  it('allows overturning with a pair of jokers (SJ > rank cards, BJ > SJ) to remove trump suit', () => {
    const game = new ZpyGame({ numDecks: 2 });
    for (let i = 0; i < 4; i++) {
      game.addPlayer(`p${i}`, `P${i}`, '', false);
    }
    game.startRound();
    game.players[0].hand = ['2S', '2S'];
    game.players[1].hand = ['SJ', 'SJ'];
    game.players[2].hand = ['BJ', 'BJ'];

    // Single joker cannot declare
    expect(() => game.declare(1, 'SJ', 1)).toThrow('Must use at least a pair of jokers');

    // 2x 2S sets Spades trump
    game.declare(0, '2S', 2);
    expect(game.declared).toBe('2S');

    // 2x SJ overturns 2x 2S and removes trump suit (2NT)
    game.declare(1, 'SJ', 2);
    expect(game.declared).toBe('2NT');

    // 2x BJ overturns 2x SJ (still 2NT)
    game.declare(2, 'BJ', 2);
    expect(game.declared).toBe('2NT');

    // In 2NT: only jokers and 2s are trump, and all 2s are equal
    expect(compareCards('2S', '2C', '2NT')).toBe(0);
    expect(compareCards('2H', '2D', '2NT')).toBe(0);
    expect(compareCards('SJ', '2S', '2NT')).toBeGreaterThan(0);
    expect(compareCards('2C', 'AS', '2NT')).toBeGreaterThan(0);
    expect(compareCards('AS', 'AC', '2NT')).toBe(0);
  });

  it('rejects calling any trump card (trump suit, rank card, or joker) as a friend', () => {
    const game = new ZpyGame({ numDecks: 2 });
    for (let i = 0; i < 4; i++) {
      game.addPlayer(`p${i}`, `P${i}`, '', false);
    }
    game.phase = 'bottom';
    game.declared = '2S';
    game.dealerIndex = 0;
    game.teamSize = 2;
    game.bottomSize = 2;
    game.players[0].hand = ['3C', '4C', '5C'];

    expect(() => game.endBottomPhase(['3C', '4C'], [{ card: 'AS', nth: 1 }])).toThrow(
      'Cannot call a trump card as a friend.'
    );
    expect(() => game.endBottomPhase(['3C', '4C'], [{ card: '2H', nth: 1 }])).toThrow(
      'Cannot call a trump card as a friend.'
    );
    expect(() => game.endBottomPhase(['3C', '4C'], [{ card: 'BJ', nth: 1 }])).toThrow(
      'Cannot call a trump card as a friend.'
    );

    // Non-trump card succeeds
    expect(() => game.endBottomPhase(['3C', '4C'], [{ card: 'AC', nth: 1 }])).not.toThrow();
    expect(game.phase).toBe('play');
  });

  it('multiplies bottom points by last winning play size * 2 (pair -> 4x, 6-card tractor -> 12x)', () => {
    // Pair winning last trick -> 4x (10 pts in bottom -> 40 pts)
    const gPair = new ZpyGame({ numDecks: 2 });
    for (let i = 0; i < 2; i++) gPair.addPlayer(`p${i}`, `P${i}`, '', false);
    gPair.phase = 'play';
    gPair.declared = '2S';
    gPair.dealerIndex = 0;
    gPair.friends = new Set([0]);
    gPair.bottom = ['10D']; // 10 pts
    gPair.currentTurn = 0;
    gPair.trickLeader = 0;
    gPair.players[0].hand = ['3C', '3C'];
    gPair.players[1].hand = ['AC', 'AC']; // defender wins with pair
    gPair.makePlay(0, ['3C', '3C']);
    gPair.makePlay(1, ['AC', 'AC']);
    expect(gPair.lastRoundResult?.bottomMultiplier).toBe(4);
    expect(gPair.lastRoundResult?.bottomPoints).toBe(40);

    // 6-card tractor winning last trick -> 12x (10 pts in bottom -> 120 pts)
    const gTractor = new ZpyGame({ numDecks: 2 });
    for (let i = 0; i < 2; i++) gTractor.addPlayer(`p${i}`, `P${i}`, '', false);
    gTractor.phase = 'play';
    gTractor.declared = '2S';
    gTractor.dealerIndex = 0;
    gTractor.friends = new Set([0]);
    gTractor.bottom = ['KD']; // 10 pts
    gTractor.currentTurn = 0;
    gTractor.trickLeader = 0;
    gTractor.players[0].hand = ['3C', '3C', '4C', '4C', '5C', '5C'];
    gTractor.players[1].hand = ['8C', '8C', '9C', '9C', '10C', '10C']; // defender wins with 2x3 tractor
    gTractor.makePlay(0, ['3C', '3C', '4C', '4C', '5C', '5C']);
    gTractor.makePlay(1, ['8C', '8C', '9C', '9C', '10C', '10C']);
    expect(gTractor.lastRoundResult?.bottomMultiplier).toBe(12);
    expect(gTractor.lastRoundResult?.bottomPoints).toBe(120);
  });

  it('requires unanimous vote from all human players to reset the game', () => {
    const game = new ZpyGame({ numDecks: 2 });
    game.addPlayer('h1', 'Alice', '', false);
    game.addPlayer('h2', 'Bob', '', false);
    game.addPlayer('b1', 'Bot 1', '', true);
    game.startRound();

    expect(game.voteReset('h1')).toBe(false);
    expect(game.phase).toBe('deal');
    expect([...game.resetVotes]).toEqual(['h1']);

    // Toggling cancels vote
    expect(game.voteReset('h1')).toBe(false);
    expect([...game.resetVotes]).toEqual([]);

    // Both humans voting resets to lobby
    expect(game.voteReset('h1')).toBe(false);
    expect(game.voteReset('h2')).toBe(true);
    expect(game.phase).toBe('lobby');
    expect([...game.resetVotes]).toEqual([]);
  });
});
