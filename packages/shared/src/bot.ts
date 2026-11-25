import {
  BASIC_NUMS,
  BASIC_SUITS,
  BasicSuit,
  Card,
  Declared,
  compareCardsForSort,
  countCards,
  getPointValue,
  getSuit,
  parseCard,
} from './cards.js';
import { ZpyGame } from './gameState.js';
import { Matcher, Possibility, decomposeThrow, sortPossibilities } from './matcher.js';
import { Play } from './play.js';

/**
 * Strategic Bot AI for Zhaopengyou:
 * - Waits to evaluate suit length before declaring (and can overturn with strong pairs).
 * - Buries short non-trump non-point suits to create voids for ruffing.
 * - Leads high pairs/tractors or non-trump Aces, otherwise low non-point cards.
 * - Tracks trick winner & teammates: feeds points to teammates, wins or ruffs against opponents,
 *   and avoids giving points to opponents.
 */
export function chooseBotDeclaration(
  game: ZpyGame,
  playerIndex: number
): { card: Card; amount: number } | null {
  if (game.phase !== 'deal') return null;
  const player = game.players[playerIndex];
  if (!player) return null;
  if (game.settings.winnersDeclare && !game.winners.includes(playerIndex)) return null;

  // Give humans a chance to declare first; bots evaluate once they have >= 6 cards or near end of deal
  const nearEnd = game.deck.length <= game.bottomSize + game.players.length * 2;
  if (player.hand.length < 6 && !nearEnd) return null;

  const prev = game.declarations[game.declarations.length - 1];
  if (prev && prev.player === playerIndex) return null;

  const counts = countCards(player.hand);
  const suitCounts: Record<BasicSuit, number> = { C: 0, D: 0, S: 0, H: 0 };
  for (const c of player.hand) {
    const [, s] = parseCard(c);
    if (s !== 'J') suitCounts[s as BasicSuit]++;
  }

  // Pick the best suit where bot holds enough copies of its rank card to declare/overturn
  let bestSuit: BasicSuit | null = null;
  let bestAmount = 0;
  let bestScore = -1;

  for (const suit of BASIC_SUITS) {
    const candidate = `${player.rank}${suit}` as Card;
    const owned = counts.get(candidate) ?? 0;
    if (owned === 0) continue;

    if (!prev) {
      // First declaration: prefer longest suit
      const score = suitCounts[suit] + owned * 2;
      if (score > bestScore) {
        bestScore = score;
        bestSuit = suit;
        bestAmount = owned >= 2 ? 2 : 1;
      }
    } else if (owned > prev.amount && owned >= 2 && suitCounts[suit] >= 4) {
      // Overturn only when holding a pair+ and a reasonably long suit
      const score = suitCounts[suit] + owned * 3;
      if (score > bestScore) {
        bestScore = score;
        bestSuit = suit;
        bestAmount = owned;
      }
    }
  }

  if (bestSuit) {
    return { card: `${player.rank}${bestSuit}` as Card, amount: bestAmount };
  }
  return null;
}

export function chooseBotBottomAndFriends(
  game: ZpyGame,
  playerIndex: number
): { bottom: Card[]; friendCalls: { card: Card; nth: number }[] } {
  const declared = game.declared!;
  const hand = [...game.players[playerIndex].hand];
  const counts = countCards(hand);

  // Count non-trump suit lengths to prefer voiding short non-trump suits
  const suitLen = new Map<string, number>();
  for (const c of hand) {
    const s = getSuit(c, declared);
    suitLen.set(s, (suitLen.get(s) ?? 0) + 1);
  }

  // Score each card for burying (lower score = better to bury)
  const sortedForBury = [...hand].sort((a, b) => {
    const score = (c: Card) => {
      const s = getSuit(c, declared);
      const isTrump = s === 'T';
      const [num] = parseCard(c);
      const pts = getPointValue(c);
      const mult = counts.get(c) ?? 1;
      let val = 0;
      if (isTrump) val += 1000;
      if (pts > 0) val += 150 + pts * 5;
      if (num === 'A') val += 200;
      if (mult >= 2) val += 120 * mult;
      // Shorter non-trump suits are better to void
      val += (suitLen.get(s) ?? 0) * 15;
      val += BASIC_NUMS.indexOf(num as (typeof BASIC_NUMS)[number]);
      return val;
    };
    return score(a) - score(b);
  });

  const bottom = sortedForBury.slice(0, game.bottomSize);
  const expectedCalls = Math.max(0, game.teamSize - 1);
  const friendCalls: { card: Card; nth: number }[] = [];

  const remainingHand = [...hand];
  for (const c of bottom) {
    const i = remainingHand.indexOf(c);
    if (i !== -1) remainingHand.splice(i, 1);
  }
  const owned = countCards(remainingHand);
  const inBottom = countCards(bottom);

  const candidates: Card[] = [];
  for (const num of [...BASIC_NUMS].reverse()) {
    for (const suit of BASIC_SUITS) {
      const card = `${num}${suit}` as Card;
      if (getSuit(card, declared) !== 'T') {
        candidates.push(card);
      }
    }
  }

  // Pass 1: prefer high non-trump cards the bot holds 0 copies of (and not all buried in bottom)
  for (const card of candidates) {
    if (friendCalls.length >= expectedCalls) break;
    const handCt = owned.get(card) ?? 0;
    const bottomCt = inBottom.get(card) ?? 0;
    if (handCt === 0 && bottomCt < game.settings.numDecks) {
      friendCalls.push({ card, nth: 1 });
    }
  }

  // Pass 2: if still needed, call nth = handCt + 1 so the bot won't trigger on its own copies
  for (const card of candidates) {
    if (friendCalls.length >= expectedCalls) break;
    if (friendCalls.some((fc) => fc.card === card)) continue;
    const handCt = owned.get(card) ?? 0;
    const bottomCt = inBottom.get(card) ?? 0;
    if (handCt + bottomCt < game.settings.numDecks) {
      friendCalls.push({ card, nth: handCt + 1 });
    }
  }

  while (friendCalls.length < expectedCalls && candidates.length > 0) {
    friendCalls.push({ card: candidates[0], nth: 1 });
  }

  return { bottom, friendCalls };
}

function isKnownTeammate(game: ZpyGame, me: number, other: number): boolean {
  if (me === other) return true;
  const meFriend = game.friends.has(me);
  const otherFriend = game.friends.has(other);
  if (meFriend && otherFriend) return true;
  // Defenders know each other once all friends are revealed
  if (!meFriend && !otherFriend && game.friends.size >= game.teamSize) return true;
  return false;
}

function getCurrentTrickWinner(game: ZpyGame, declared: Declared): { player: number; plays: Play[] } {
  let winIdx = 0;
  for (let i = 1; i < game.currentTrick.length; i++) {
    if (!Play.winsAgainst(game.currentTrick[winIdx].plays, game.currentTrick[i].plays, declared)) {
      winIdx = i;
    }
  }
  return {
    player: game.currentTrick[winIdx].player,
    plays: game.currentTrick[winIdx].plays,
  };
}

function materializePossibility(
  suited: Card[],
  possibility: Possibility[],
  declared: Declared,
  wrap: boolean,
  preferPoints: boolean,
  beatTarget: Play | null
): Card[] {
  const poss = sortPossibilities(possibility, declared);
  const remaining = countCards(suited);
  const chosen: Card[] = [];

  for (const item of poss) {
    if (item instanceof Play) {
      for (const c of item.getCards(declared, wrap)) {
        chosen.push(c);
        const cur = remaining.get(c)!;
        if (cur === 1) remaining.delete(c);
        else remaining.set(c, cur - 1);
      }
    }
  }

  for (const item of poss) {
    if (!(item instanceof Play)) {
      const candidates = [...remaining.entries()].filter(([, cnt]) => cnt >= item.m);
      let picked: Card | null = null;

      if (beatTarget && poss.length === 1 && beatTarget.multiplicity === item.m && beatTarget.length === 1) {
        // Play the lowest exact-multiplicity card that beats the target
        const exactWinning = candidates.find(
          ([card, cnt]) =>
            cnt === item.m &&
            Play.compareStrength(new Play(card, item.m, 1), beatTarget, declared) > 0
        );
        if (exactWinning) {
          picked = exactWinning[0];
        }
      }

      if (!picked) {
        // Sort candidates: prefer exact multiplicity, then either feed points (teammate winning)
        // or avoid giving points (opponent winning), then lowest card
        candidates.sort(([c1, cnt1], [c2, cnt2]) => {
          const exact1 = cnt1 === item.m ? 0 : 1;
          const exact2 = cnt2 === item.m ? 0 : 1;
          if (exact1 !== exact2) return exact1 - exact2;
          const pts1 = getPointValue(c1);
          const pts2 = getPointValue(c2);
          if (pts1 !== pts2) return preferPoints ? pts2 - pts1 : pts1 - pts2;
          return compareCardsForSort(c1, c2, declared);
        });
        picked = candidates[0]?.[0] ?? null;
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

export function chooseBotPlay(game: ZpyGame, playerIndex: number): Card[] {
  const declared = game.declared!;
  const wrap = game.settings.wraparound;
  const hand = game.players[playerIndex].hand;

  // --- LEADING A TRICK ---
  if (game.currentTrick.length === 0) {
    const nonTrumpBySuit = new Map<BasicSuit, Card[]>();
    for (const c of hand) {
      const s = getSuit(c, declared);
      if (s !== 'T') {
        const list = nonTrumpBySuit.get(s) ?? [];
        list.push(c);
        nonTrumpBySuit.set(s, list);
      }
    }

    // 1. Lead a strong non-trump tractor or high pair (A/K) if we have one
    let bestStrongPlay: Play | null = null;
    for (const cards of nonTrumpBySuit.values()) {
      const plays = decomposeThrow(cards, game.settings.numDecks, declared, wrap);
      for (const p of plays) {
        const [num] = parseCard(p.card);
        const isStrong =
          p.length >= 2 || (p.multiplicity >= 2 && (num === 'A' || num === 'K'));
        if (isStrong && (!bestStrongPlay || p.size > bestStrongPlay.size)) {
          bestStrongPlay = p;
        }
      }
    }
    if (bestStrongPlay) {
      return bestStrongPlay.getCards(declared, wrap);
    }

    // 2. Cash a non-trump Ace single
    for (const cards of nonTrumpBySuit.values()) {
      const ace = cards.find((c) => parseCard(c)[0] === 'A');
      if (ace) return [ace];
    }

    // 3. Lead a low non-point card from the shortest non-trump suit (to create a void)
    const nonTrumpCards = hand.filter((c) => getSuit(c, declared) !== 'T');
    if (nonTrumpCards.length > 0) {
      const sorted = [...nonTrumpCards].sort((a, b) => {
        const ptsDiff = getPointValue(a) - getPointValue(b);
        if (ptsDiff !== 0) return ptsDiff;
        const lenA = nonTrumpBySuit.get(getSuit(a, declared) as BasicSuit)?.length ?? 99;
        const lenB = nonTrumpBySuit.get(getSuit(b, declared) as BasicSuit)?.length ?? 99;
        if (lenA !== lenB) return lenA - lenB;
        return compareCardsForSort(a, b, declared);
      });
      return [sorted[0]];
    }

    // 4. Only trump left: lead highest trump tractor/pair or lowest trump single
    const trumpPlays = decomposeThrow(hand, game.settings.numDecks, declared, wrap);
    if (trumpPlays.length > 0 && trumpPlays[0].size >= 2) {
      return trumpPlays[0].getCards(declared, wrap);
    }
    return [hand[0]];
  }

  // --- FOLLOWING A TRICK ---
  const leadPlays = game.currentTrick[0].plays;
  const trickSize = leadPlays.reduce((s, p) => s + p.size, 0);
  const leadSuit = leadPlays[0].getSuit(declared);
  const suited = hand.filter((c) => getSuit(c, declared) === leadSuit);

  const currentWinner = getCurrentTrickWinner(game, declared);
  const teammateWinning = isKnownTeammate(game, playerIndex, currentWinner.player);
  const trickPoints = game.currentTrick.reduce(
    (sum, t) => sum + t.cards.reduce((s, c) => s + getPointValue(c), 0),
    0
  );

  // Case A: Void or cannot fill trick with led suit
  if (suited.length <= trickSize) {
    // If completely void in a non-trump suit and opponent is winning, try to ruff with trump!
    if (suited.length === 0 && leadSuit !== 'T' && !teammateWinning && (trickPoints > 0 || trickSize >= 2)) {
      const trumpCards = hand.filter((c) => getSuit(c, declared) === 'T');
      if (trumpCards.length >= trickSize) {
        const trumpPoss = Matcher.fromHand(trumpCards, leadPlays, declared, wrap).getPossibilities();
        let bestRuff: Card[] | null = null;
        for (const poss of trumpPoss) {
          // Only ruff if we can actually match the exact lead shape in trump
          const canMatchExact =
            poss.length === leadPlays.length &&
            poss.every((item, i) => {
              const m = item instanceof Play ? item.multiplicity : item.m;
              const l = item instanceof Play ? item.length : item.l;
              return m === leadPlays[i].multiplicity && l === leadPlays[i].length;
            });
          if (!canMatchExact) continue;

          const beatTarget =
            currentWinner.plays[0].getSuit(declared) === 'T' && currentWinner.plays.length === 1
              ? currentWinner.plays[0]
              : null;
          const ruffCards = materializePossibility(
            trumpCards,
            poss,
            declared,
            wrap,
            false,
            beatTarget
          );
          if (ruffCards.length !== trickSize) continue;
          const ruffPlays = decomposeThrow(ruffCards, game.settings.numDecks, declared, wrap);
          if (!Play.winsAgainst(currentWinner.plays, ruffPlays, declared)) {
            bestRuff = ruffCards;
            break;
          }
        }
        if (bestRuff) return bestRuff;
      }
    }

    // Otherwise play all suited cards and slough remaining
    const chosen = [...suited];
    const nonSuited = hand.filter((c) => getSuit(c, declared) !== leadSuit);
    nonSuited.sort((a, b) => {
      const aTrump = getSuit(a, declared) === 'T' ? 1 : 0;
      const bTrump = getSuit(b, declared) === 'T' ? 1 : 0;
      if (aTrump !== bTrump) return aTrump - bTrump;
      const ptsA = getPointValue(a);
      const ptsB = getPointValue(b);
      if (ptsA !== ptsB) return teammateWinning ? ptsB - ptsA : ptsA - ptsB;
      return compareCardsForSort(a, b, declared);
    });
    while (chosen.length < trickSize && nonSuited.length > 0) {
      chosen.push(nonSuited.shift()!);
    }
    return chosen;
  }

  // Case B: Must follow suit
  const possibilities = Matcher.fromHand(suited, leadPlays, declared, wrap).getPossibilities();

  // If opponent is winning and current winner is in the same suit (not already ruffed by trump),
  // try to find a winning legal play!
  const winnerSameSuit = currentWinner.plays[0].getSuit(declared) === leadSuit;
  if (!teammateWinning && winnerSameSuit) {
    let bestWinningCards: Card[] | null = null;
    for (const poss of possibilities) {
      const beatTarget = currentWinner.plays.length === 1 ? currentWinner.plays[0] : null;
      const candidateCards = materializePossibility(
        suited,
        poss,
        declared,
        wrap,
        false,
        beatTarget
      );
      const candidatePlays = decomposeThrow(candidateCards, game.settings.numDecks, declared, wrap);
      if (!Play.winsAgainst(currentWinner.plays, candidatePlays, declared)) {
        bestWinningCards = candidateCards;
        break;
      }
    }
    if (bestWinningCards) return bestWinningCards;
  }

  // Otherwise: feed points if teammate is winning, or dump lowest non-point cards if losing
  return materializePossibility(
    suited,
    possibilities[0],
    declared,
    wrap,
    teammateWinning,
    null
  );
}
