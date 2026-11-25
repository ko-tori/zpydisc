import { Card, countCards, getSuit, nextLargest } from './cards.js';
import { Play } from './play.js';

export interface Shape {
  m: number;
  l: number;
}

export type Possibility = Play | Shape;

function getM(p: Possibility): number {
  return p instanceof Play ? p.multiplicity : p.m;
}

function getL(p: Possibility): number {
  return p instanceof Play ? p.length : p.l;
}

/**
 * Sorts a copy of `possibilities` from largest to smallest by (m*l, m),
 * with concrete Plays before wildcard Shapes of the same (m, l).
 */
export function sortPossibilities(possibilities: Possibility[], declared?: Card): Possibility[] {
  return [...possibilities].sort((p1, p2) => {
    const m1 = getM(p1);
    const m2 = getM(p2);
    const l1 = getL(p1);
    const l2 = getL(p2);
    const comp = m2 * l2 - m1 * l1 || m2 - m1;
    if (comp !== 0) return comp;
    if (p1 instanceof Play && !(p2 instanceof Play)) return -1;
    if (!(p1 instanceof Play) && p2 instanceof Play) return 1;
    if (p1 instanceof Play && p2 instanceof Play) {
      return declared
        ? Play.compareStrength(p2, p1, declared)
        : p2.card.localeCompare(p1.card);
    }
    return 0;
  });
}

/**
 * Compares two candidate possibility lists by Zhaopengyou shape priority:
 * lexicographically larger shapes (m*l, m) win; fewer groups tiebreak.
 * Returns positive if `a` is strictly better than `b`.
 */
function comparePossibilityPriority(a: Possibility[], b: Possibility[]): number {
  const sa = sortPossibilities(a);
  const sb = sortPossibilities(b);
  const len = Math.min(sa.length, sb.length);
  for (let i = 0; i < len; i++) {
    const ma = getM(sa[i]);
    const la = getL(sa[i]);
    const mb = getM(sb[i]);
    const lb = getL(sb[i]);
    const diff = ma * la - mb * lb || ma - mb;
    if (diff !== 0) return diff;
  }
  return sb.length - sa.length;
}

function canonicalKey(possibility: Possibility[], declared: Card): string {
  return sortPossibilities(possibility, declared)
    .map((p) => (p instanceof Play ? `P:${p.card}:${p.multiplicity}x${p.length}` : `S:${p.m}x${p.l}`))
    .join('|');
}

/**
 * Splits a target (M, L) grid after covering an (m, l) sub-rectangle.
 * Remaining needs: [M, L - l] (if L > l) and either `l` singles (if M - m === 1) or [M - m, l] (if M - m > 1).
 */
export function computeNeeds(M: number, L: number, m: number, l: number): [number, number][] {
  const needs: [number, number][] = [];
  if (L - l > 0) {
    needs.push([M, L - l]);
  }
  if (M - m === 1) {
    for (let i = 0; i < l; i++) {
      needs.push([1, 1]);
    }
  } else if (M - m > 0) {
    needs.push([M - m, l]);
  }
  return needs;
}

/**
 * Builds tractor DP table mapping [m - 2][l - 1] -> Map<startCard, endCard>.
 * Runs in O(M * L * |unique cards|) with no Play allocations and properly supports
 * wraparound tractors of any length >= 2 (e.g. AA2233).
 */
function buildTractorTable(
  counts: Map<Card, number>,
  maxM: number,
  maxL: number,
  declared: Card,
  wrap: boolean
): Map<Card, Card>[][] {
  if (maxM < 2 || maxL < 1) return [];
  const dp: Map<Card, Card>[][] = [];

  for (let m = 2; m <= maxM; m++) {
    const row: Map<Card, Card>[] = [];
    const first = new Map<Card, Card>();
    counts.forEach((count, card) => {
      if (count >= m) {
        first.set(card, card);
      }
    });
    row.push(first);

    for (let l = 2; l <= maxL; l++) {
      const prev = row[l - 2];
      const entry = new Map<Card, Card>();
      prev.forEach((endCard, startCard) => {
        const nextCard = nextLargest(endCard, declared, wrap && l === 2);
        if (nextCard && nextCard !== startCard && first.has(nextCard)) {
          entry.set(startCard, nextCard);
        }
      });
      row.push(entry);
    }
    dp.push(row);
  }

  return dp;
}

function removePlayFromCounts(
  counts: Map<Card, number>,
  play: Play,
  declared: Card,
  wrap: boolean
): Map<Card, number> {
  const next = new Map(counts);
  for (const card of play.getCards(declared, wrap)) {
    const cur = next.get(card);
    if (!cur) {
      throw new Error(`Cannot remove card ${card} from hand.`);
    }
    if (cur === 1) {
      next.delete(card);
    } else {
      next.set(card, cur - 1);
    }
  }
  return next;
}

/**
 * Decomposes a suited initial throw (or any set of cards from one suit) into canonical Plays,
 * greedily selecting the highest-priority (largest size, then highest multiplicity) valid plays.
 */
export function decomposeThrow(
  cards: Card[],
  maxMultiplicity: number,
  declared: Card,
  wrap = true
): Play[] {
  if (cards.length === 0) return [];
  let counts = countCards(cards);
  const result: Play[] = [];

  while (counts.size > 0) {
    let totalCards = 0;
    let maxCardCount = 0;
    counts.forEach((c) => {
      totalCards += c;
      if (c > maxCardCount) maxCardCount = c;
    });

    const effectiveMaxM = Math.min(maxMultiplicity, maxCardCount);
    const effectiveMaxL = Math.max(1, Math.floor(totalCards / 2));
    const dp = buildTractorTable(counts, effectiveMaxM, effectiveMaxL, declared, wrap);

    let bestM = 1;
    let bestL = 1;
    for (let m = dp.length + 1; m >= 2; m--) {
      for (let l = dp[m - 2].length; l >= 1; l--) {
        if (dp[m - 2][l - 1].size > 0) {
          if (m * l > bestM * bestL || (m * l === bestM * bestL && m > bestM)) {
            bestM = m;
            bestL = l;
          }
        }
      }
    }

    let chosenCard: Card;
    if (bestM === 1 && bestL === 1) {
      // Pick highest remaining single card for determinism
      const remaining = [...counts.keys()];
      remaining.sort((a, b) => Play.compareStrength(new Play(b), new Play(a), declared));
      chosenCard = remaining[0];
    } else {
      const candidates = [...dp[bestM - 2][bestL - 1].keys()];
      candidates.sort((a, b) =>
        Play.compareStrength(new Play(b, bestM, bestL), new Play(a, bestM, bestL), declared)
      );
      chosenCard = candidates[0];
    }

    const play = new Play(chosenCard, bestM, bestL);
    result.push(play);
    counts = removePlayFromCounts(counts, play, declared, wrap);
  }

  return Play.sortPlays(result, declared).reverse();
}

/**
 * Checks whether a submitted list of cards (already verified to be in the led suit and
 * of the right total length) satisfies a required `Possibility[]`.
 */
export function cardsMatchPossibility(
  cards: Card[],
  possibility: Possibility[],
  declared: Card,
  wrap = true
): boolean {
  const remaining = countCards(cards);
  const sorted = sortPossibilities(possibility, declared);

  // 1. Subtract all required concrete Plays first
  for (const poss of sorted) {
    if (poss instanceof Play) {
      for (const c of poss.getCards(declared, wrap)) {
        const cur = remaining.get(c) ?? 0;
        if (cur === 0) return false;
        if (cur === 1) remaining.delete(c);
        else remaining.set(c, cur - 1);
      }
    }
  }

  // 2. Satisfy all wildcard Shapes (always l === 1, m <= 2, sorted pairs before singles)
  for (const poss of sorted) {
    if (!(poss instanceof Play)) {
      let matched = false;
      // Prefer exact count match first, then any card with count >= m
      let fallbackCard: Card | null = null;
      for (const [card, count] of remaining) {
        if (count === poss.m) {
          remaining.delete(card);
          matched = true;
          break;
        }
        if (count > poss.m && fallbackCard === null) {
          fallbackCard = card;
        }
      }
      if (!matched) {
        if (fallbackCard !== null) {
          remaining.set(fallbackCard, remaining.get(fallbackCard)! - poss.m);
        } else {
          return false;
        }
      }
    }
  }

  return remaining.size === 0;
}

/**
 * Checks whether a decomposed Play[] matches a Possibility[].
 * Properly checks specific Play.card values and uses `declared` for sorting.
 */
export function matchesPossibility(
  play: Play[],
  possibility: Possibility[],
  declared: Card,
  wrap = true
): boolean {
  const cards = play.flatMap((p) => p.getCards(declared, wrap));
  return cardsMatchPossibility(cards, possibility, declared, wrap);
}

/**
 * Computes all legal matching possibilities when following a trick with suited cards.
 */
export class Matcher {
  private handStructure: Map<Card, Card>[][];
  private trick: Play[];

  constructor(
    private counts: Map<Card, number>,
    trick: Play[],
    private declared: Card,
    private wrap = true
  ) {
    if (trick.length === 0) {
      throw new Error('Trick cannot be empty.');
    }
    this.trick = Play.sortPlays(trick, declared);
    const maxTrick = this.trick[this.trick.length - 1];
    this.handStructure = buildTractorTable(
      this.counts,
      maxTrick.multiplicity,
      maxTrick.length,
      this.declared,
      this.wrap
    );
  }

  getPossibilities(): Possibility[][] {
    const target = this.trick[this.trick.length - 1];
    if (this.trick.length === 1 && target.multiplicity === 1 && target.length === 1) {
      return this.counts.size > 0 ? [[{ m: 1, l: 1 }]] : [];
    }

    const [m, l] = this.getBest();
    const remainingTrick = this.trick.slice(0, -1);
    const remainingNeedsTractorOrHigher = remainingTrick.some(
      (p) => p.length > 1 || p.multiplicity > m
    );

    const rawPlays: Possibility[][] = [];

    if (m <= 2 && l === 1 && !remainingNeedsTractorOrHigher) {
      const shape: Shape = { m, l };
      const newCounts = new Map(this.counts);
      let found = false;
      let fallbackCard: Card | null = null;
      for (const [card, count] of newCounts) {
        if (count === m) {
          newCounts.delete(card);
          found = true;
          break;
        }
        if (count > m) {
          fallbackCard = card;
        }
      }
      if (!found) {
        if (fallbackCard !== null) {
          newCounts.set(fallbackCard, newCounts.get(fallbackCard)! - m);
        } else {
          throw new Error(`Failed to find candidate for ${m}x${l}.`);
        }
      }
      rawPlays.push(...this.possibilitiesHelper(shape, m, l, newCounts));
    } else {
      const candidates = m === 1 && l === 1 ? this.counts.keys() : this.handStructure[m - 2][l - 1].keys();
      for (const card of candidates) {
        const play = new Play(card, m, l);
        const newCounts = removePlayFromCounts(this.counts, play, this.declared, this.wrap);
        rawPlays.push(...this.possibilitiesHelper(play, m, l, newCounts));
      }
    }

    if (rawPlays.length === 0) return [];

    // Keep only the highest-priority possibilities (by lexicographic shape profile, then fewest groups)
    let best = rawPlays[0];
    for (let i = 1; i < rawPlays.length; i++) {
      if (comparePossibilityPriority(rawPlays[i], best) > 0) {
        best = rawPlays[i];
      }
    }

    const seen = new Set<string>();
    const filtered: Possibility[][] = [];
    for (const p of rawPlays) {
      if (comparePossibilityPriority(p, best) === 0) {
        const key = canonicalKey(p, this.declared);
        if (!seen.has(key)) {
          seen.add(key);
          filtered.push(p);
        }
      }
    }
    return filtered;
  }

  /**
   * Returns true if the hand contains a play of the exact same shape (m, l) that strictly beats
   * the single play in `this.trick` (used for throw validation).
   */
  beatsTrick(): boolean {
    if (this.trick.length !== 1) {
      throw new Error('beatsTrick can only be called for a single-play trick.');
    }
    const target = this.trick[0];
    const [m, l] = this.getBest();
    if (m !== target.multiplicity || l !== target.length) return false;

    const candidates = m === 1 && l === 1 ? this.counts.keys() : this.handStructure[m - 2][l - 1].keys();
    for (const card of candidates) {
      const candidatePlay = new Play(card, m, l);
      if (Play.compareStrength(candidatePlay, target, this.declared) > 0) {
        return true;
      }
    }
    return false;
  }

  private getBest(): [number, number] {
    let bestM = 1;
    let bestL = 1;
    for (let m = this.handStructure.length + 1; m >= 2; m--) {
      const row = this.handStructure[m - 2];
      for (let l = row.length; l >= 1; l--) {
        if (row[l - 1].size > 0) {
          if (m * l > bestM * bestL || (m * l === bestM * bestL && m > bestM)) {
            bestM = m;
            bestL = l;
          }
        }
      }
    }
    return [bestM, bestL];
  }

  private possibilitiesHelper(
    play: Possibility,
    m: number,
    l: number,
    newCounts: Map<Card, number>
  ): Possibility[][] {
    const newTrick = this.trick.map((t) => t.copy());
    const targetPlay = newTrick.pop();
    if (!targetPlay) return [];

    for (const [m2, l2] of computeNeeds(targetPlay.multiplicity, targetPlay.length, m, l)) {
      newTrick.push(new Play(targetPlay.card, m2, l2));
    }

    if (newTrick.length === 0) {
      return [[play]];
    }
    const nextMatcher = new Matcher(newCounts, newTrick, this.declared, this.wrap);
    return nextMatcher.getPossibilities().map((rest) => [play, ...rest]);
  }

  static fromHand(hand: Card[], trick: Play[], declared: Card, wrap = true): Matcher {
    return new Matcher(countCards(hand), trick, declared, wrap);
  }
}

/**
 * Determines which cards in `hand` can legally be added to `selection` next.
 */
export function selectableCards(
  hand: Card[],
  selection: Card[],
  trick: Play[],
  declared: Card,
  wrap = true
): Set<Card> {
  if (trick.length === 0) {
    if (selection.length > 0) {
      const suit = getSuit(selection[0], declared);
      return new Set(hand.filter((c) => getSuit(c, declared) === suit));
    }
    return new Set(hand);
  }

  const n = trick.reduce((sum, p) => sum + p.size, 0);
  if (selection.length >= n) return new Set();

  const suit = trick[0].getSuit(declared);
  const suitedCards = hand.filter((c) => getSuit(c, declared) === suit);

  if (suitedCards.length <= n) {
    const leftover = n - suitedCards.length;
    const selectedNonSuited = selection.filter((c) => getSuit(c, declared) !== suit).length;
    const selectedSuited = selection.length - selectedNonSuited;
    if (selectedNonSuited < leftover) {
      if (selectedSuited === suitedCards.length) {
        return new Set(hand.filter((c) => getSuit(c, declared) !== suit));
      }
      return new Set(hand);
    }
    return new Set(suitedCards);
  }

  // Player has more suited cards than trick size: must follow suit and match a possibility
  const possibilities = Matcher.fromHand(suitedCards, trick, declared, wrap).getPossibilities();
  const handCounts = countCards(suitedCards);
  const selCounts = countCards(selection);
  const selectable = new Set<Card>();

  for (const possibility of possibilities) {
    const selCopy = new Map(selCounts);
    const handCopy = new Map(handCounts);
    const tempSelectable = new Set<Card>();
    const sorted = sortPossibilities(possibility, declared);
    let valid = true;

    // Concrete plays first
    for (const p of sorted) {
      if (p instanceof Play) {
        for (const c of p.getCards(declared, wrap)) {
          const avail = handCopy.get(c) ?? 0;
          if (avail === 0) {
            valid = false;
            break;
          }
          handCopy.set(c, avail - 1);
          const sel = selCopy.get(c) ?? 0;
          if (sel > 0) {
            selCopy.set(c, sel - 1);
          } else {
            tempSelectable.add(c);
          }
        }
        if (!valid) break;
      }
    }
    if (!valid) continue;

    // Wildcard shapes (m = 2 pairs, then m = 1 singles)
    let neededPairs = 0;
    let neededSingles = 0;
    for (const p of sorted) {
      if (!(p instanceof Play)) {
        if (p.m === 2) neededPairs++;
        else neededSingles++;
      }
    }

    // Consume selected pairs toward neededPairs
    for (const [card, count] of selCopy) {
      while (neededPairs > 0 && (selCopy.get(card) ?? 0) >= 2) {
        selCopy.set(card, selCopy.get(card)! - 2);
        handCopy.set(card, (handCopy.get(card) ?? 0) - 2);
        neededPairs--;
      }
    }

    // Count remaining selected singles
    let remainingSelectedSingles = 0;
    const partialPairCards = new Set<Card>();
    for (const [card, count] of selCopy) {
      if (count > 0) {
        remainingSelectedSingles += count;
        if ((handCopy.get(card) ?? 0) >= 2) {
          partialPairCards.add(card);
        }
      }
    }

    // Check if remaining selected singles can fit into neededSingles + half-pairs
    if (neededPairs > 0) {
      // Any card with >= 2 copies remaining in handCopy can form a needed pair
      const pairCandidates: Card[] = [];
      for (const [card, count] of handCopy) {
        if (count >= 2) pairCandidates.push(card);
      }
      if (pairCandidates.length < neededPairs) continue;

      if (remainingSelectedSingles > neededSingles) {
        // Must complete one of the already-partially-selected pairs
        if (partialPairCards.size === 0) continue;
        partialPairCards.forEach((c) => tempSelectable.add(c));
      } else {
        pairCandidates.forEach((c) => tempSelectable.add(c));
        if (remainingSelectedSingles < neededSingles) {
          for (const [card, count] of handCopy) {
            if (count > 0 && (selCopy.get(card) ?? 0) < count) {
              tempSelectable.add(card);
            }
          }
        }
      }
    } else {
      if (remainingSelectedSingles > neededSingles) continue;
      if (remainingSelectedSingles < neededSingles) {
        for (const [card, count] of handCopy) {
          if (count > (selCopy.get(card) ?? 0)) {
            tempSelectable.add(card);
          }
        }
      }
    }

    tempSelectable.forEach((c) => selectable.add(c));
  }

  return selectable;
}
