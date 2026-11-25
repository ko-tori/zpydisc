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
