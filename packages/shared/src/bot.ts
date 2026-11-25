import {
  BASIC_SUITS,
  Card,
  compareCardsForSort,
  countCards,
  getPointValue,
  getSuit,
  parseCard,
} from './cards.js';
import { ZpyGame } from './gameState.js';
import { Matcher, sortPossibilities } from './matcher.js';
import { Play } from './play.js';

/**
 * Simple legal Bot AI so single players or small groups can fill a table and play full games.
 */
export function chooseBotDeclaration(
  game: ZpyGame,
  playerIndex: number
): { card: Card; amount: number } | null {
  if (game.phase !== 'deal') return null;
  if (game.declarations.length > 0) return null; // Keep bot declarations conservative
  const player = game.players[playerIndex];
  if (!player) return null;
  if (game.settings.winnersDeclare && !game.winners.includes(playerIndex)) return null;

  const counts = countCards(player.hand);
  for (const suit of BASIC_SUITS) {
    const candidate = `${player.rank}${suit}` as Card;
    const count = counts.get(candidate) ?? 0;
    if (count >= 1) {
      return { card: candidate, amount: count };
    }
  }
  return null;
}

export function chooseBotBottomAndFriends(
  game: ZpyGame,
  playerIndex: number
): { bottom: Card[]; friendCalls: { card: Card; nth: number }[] } {
  const declared = game.declared!;
  const hand = [...game.players[playerIndex].hand];

  // Bury lowest non-trump, non-point cards first
  const sortedForBury = [...hand].sort((a, b) => {
    const aTrump = getSuit(a, declared) === 'T' ? 1 : 0;
    const bTrump = getSuit(b, declared) === 'T' ? 1 : 0;
    if (aTrump !== bTrump) return aTrump - bTrump;
    const aPts = getPointValue(a);
    const bPts = getPointValue(b);
    if (aPts !== bPts) return aPts - bPts;
    return compareCardsForSort(a, b, declared);
  });

  const bottom = sortedForBury.slice(0, game.bottomSize);
  const expectedCalls = Math.max(0, game.teamSize - 1);
  const friendCalls: { card: Card; nth: number }[] = [];

  // Call Aces of non-trump suits (or Big Joker) that dealer doesn't hold all copies of
  const remainingHand = [...hand];
  for (const c of bottom) {
    const i = remainingHand.indexOf(c);
    if (i !== -1) remainingHand.splice(i, 1);
  }
  const owned = countCards(remainingHand);
  const [, trumpSuit] = parseCard(declared);

  const candidates: Card[] = [
    ...BASIC_SUITS.filter((s) => s !== trumpSuit).map((s) => `A${s}` as Card),
    'BJ',
    'SJ',
  ];

  for (const card of candidates) {
    if (friendCalls.length >= expectedCalls) break;
    if ((owned.get(card) ?? 0) < game.settings.numDecks) {
      friendCalls.push({ card, nth: 1 });
    }
  }
  while (friendCalls.length < expectedCalls) {
    friendCalls.push({ card: 'BJ', nth: 1 });
  }

  return { bottom, friendCalls };
}

export function chooseBotPlay(game: ZpyGame, playerIndex: number): Card[] {
  const declared = game.declared!;
  const hand = game.players[playerIndex].hand;

  if (game.currentTrick.length === 0) {
    // Lead highest single non-trump card if available, else lowest card
    const nonTrump = hand.filter((c) => getSuit(c, declared) !== 'T');
    if (nonTrump.length > 0) {
      return [nonTrump[nonTrump.length - 1]];
    }
    return [hand[0]];
  }

  const leadPlays = game.currentTrick[0].plays;
  const trickSize = leadPlays.reduce((s, p) => s + p.size, 0);
  const leadSuit = leadPlays[0].getSuit(declared);
  const suited = hand.filter((c) => getSuit(c, declared) === leadSuit);

  if (suited.length <= trickSize) {
    const chosen = [...suited];
    const nonSuited = hand.filter((c) => getSuit(c, declared) !== leadSuit);
    // Slough lowest non-point non-trump cards first
    nonSuited.sort((a, b) => {
      const aTrump = getSuit(a, declared) === 'T' ? 1 : 0;
      const bTrump = getSuit(b, declared) === 'T' ? 1 : 0;
      if (aTrump !== bTrump) return aTrump - bTrump;
      return getPointValue(a) - getPointValue(b) || compareCardsForSort(a, b, declared);
    });
    while (chosen.length < trickSize && nonSuited.length > 0) {
      chosen.push(nonSuited.shift()!);
    }
    return chosen;
  }

  // Follow suit legally using first possibility from Matcher
  const possibilities = Matcher.fromHand(
    suited,
    leadPlays,
    declared,
    game.settings.wraparound
  ).getPossibilities();

  const poss = sortPossibilities(possibilities[0], declared);
  const remaining = countCards(suited);
  const chosen: Card[] = [];

  for (const item of poss) {
    if (item instanceof Play) {
      for (const c of item.getCards(declared, game.settings.wraparound)) {
        chosen.push(c);
        const cur = remaining.get(c)!;
        if (cur === 1) remaining.delete(c);
        else remaining.set(c, cur - 1);
      }
    }
  }

  for (const item of poss) {
    if (!(item instanceof Play)) {
      let picked: Card | null = null;
      for (const [card, count] of remaining) {
        if (count === item.m) {
          picked = card;
          break;
        }
        if (count > item.m && picked === null) {
          picked = card;
        }
      }
      if (picked) {
        for (let i = 0; i < item.m; i++) chosen.push(picked);
        const cur = remaining.get(picked)! - item.m;
        if (cur <= 0) remaining.delete(picked);
        else remaining.set(picked, cur);
      }
    }
  }

  return chosen;
}
