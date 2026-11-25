export const BASIC_NUMS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
export type BasicNum = (typeof BASIC_NUMS)[number];

export const BASIC_SUITS = ['C', 'D', 'S', 'H'] as const;
export type BasicSuit = (typeof BASIC_SUITS)[number];

export const ALL_SUITS = ['C', 'D', 'S', 'H', 'J'] as const;
export type Suit = (typeof ALL_SUITS)[number];

export const ALL_NUMS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', 'S', 'B'] as const;
export type Num = (typeof ALL_NUMS)[number];

export type Card = `${BasicNum}${BasicSuit}` | 'SJ' | 'BJ';
/** Declared trump: either a rank+suit (e.g. '2S') or No-Trump for a rank (e.g. '2NT'). */
export type Declared = `${BasicNum}${BasicSuit}` | `${BasicNum}NT`;
export type EffectiveSuit = BasicSuit | 'T';

export function parseCard(card: Card): [Num, Suit] {
  return [
    card.slice(0, card.length - 1) as Num,
    card.charAt(card.length - 1) as Suit,
  ];
}

export function parseDeclared(declared: Declared): [BasicNum, BasicSuit | null] {
  if (declared.endsWith('NT')) {
    return [declared.slice(0, -2) as BasicNum, null];
  }
  return [
    declared.slice(0, -1) as BasicNum,
    declared.charAt(declared.length - 1) as BasicSuit,
  ];
}

export function getPointValue(card: Card): number {
  const [num] = parseCard(card);
  if (num === '5') return 5;
  if (num === '10' || num === 'K') return 10;
  return 0;
}

export function getSuit(card: Card, declared: Declared): EffectiveSuit {
  const [num, suit] = parseCard(card);
  const [big, trumpSuit] = parseDeclared(declared);
  if (suit === 'J' || (trumpSuit !== null && suit === trumpSuit) || num === big) {
    return 'T';
  }
  return suit as BasicSuit;
}

function trumpRankOrder(card: Card, declared: Declared): number {
  const [num, suit] = parseCard(card);
  const [big, trumpSuit] = parseDeclared(declared);
  if (num === 'B') return 100;
  if (num === 'S') return 99;
  if (num === big && trumpSuit !== null && suit === trumpSuit) return 98;
  if (num === big) return 97;
  return BASIC_NUMS.indexOf(num as BasicNum);
}

/**
 * Gameplay comparison of two cards.
 * Returns positive if c1 > c2, negative if c1 < c2, 0 if equal strength.
 * - Trump beats non-trump.
 * - Within trump: BJ > SJ > declared card (if trump suit) > off-suit declared rank > trump suit cards.
 * - In No-Trump, all four suits of the declared rank are equal (return 0).
 * - Two different off-suit declared rank cards tie (return 0) so earlier play wins.
 * - Two non-trump cards of different suits return 0.
 */
export function compareCards(c1: Card, c2: Card, declared?: Declared): number {
  const [n1, s1] = parseCard(c1);
  const [n2, s2] = parseCard(c2);
  if (!declared) {
    return s1 === s2 ? ALL_NUMS.indexOf(n1) - ALL_NUMS.indexOf(n2) : 0;
  }

  const vs1 = getSuit(c1, declared);
  const vs2 = getSuit(c2, declared);
  if (vs1 !== 'T' && vs2 === 'T') return -1;
  if (vs1 === 'T' && vs2 !== 'T') return 1;
  if (vs1 === 'T' && vs2 === 'T') {
    return trumpRankOrder(c1, declared) - trumpRankOrder(c2, declared);
  }
  if (vs1 !== vs2) return 0;
  return BASIC_NUMS.indexOf(n1 as BasicNum) - BASIC_NUMS.indexOf(n2 as BasicNum);
}

/**
 * Deterministic comparator for sorting a player's hand for display.
 * Groups by effective suit (C, D, S, H, T) and orders low-to-high within each suit.
 */
export function compareCardsForSort(c1: Card, c2: Card, declared?: Declared): number {
  if (!declared) {
    const [n1, s1] = parseCard(c1);
    const [n2, s2] = parseCard(c2);
    return ALL_SUITS.indexOf(s1) - ALL_SUITS.indexOf(s2) || ALL_NUMS.indexOf(n1) - ALL_NUMS.indexOf(n2);
  }
  const suitOrder: EffectiveSuit[] = ['C', 'D', 'S', 'H', 'T'];
  const vs1 = getSuit(c1, declared);
  const vs2 = getSuit(c2, declared);
  if (vs1 !== vs2) {
    return suitOrder.indexOf(vs1) - suitOrder.indexOf(vs2);
  }
  const cmp = compareCards(c1, c2, declared);
  if (cmp !== 0) return cmp;
  const [, s1] = parseCard(c1);
  const [, s2] = parseCard(c2);
  return ALL_SUITS.indexOf(s1) - ALL_SUITS.indexOf(s2);
}

/**
 * Next largest card for tractor adjacency.
 * - Off-suit declared rank cards (and all rank cards in No-Trump) do NOT form tractors by default.
 * - Trump declared card -> SJ -> BJ (when a trump suit exists).
 * - Trump Ace does NOT wrap around to trump 2/3.
 * - Non-trump Ace wraps to lowest non-declared rank (2 or 3) only when `wrap` is true.
 */
export function nextLargest(card: Card, declared: Declared, wrap = true): Card | null {
  const [num, suit] = parseCard(card);
  const [big, trumpSuit] = parseDeclared(declared);

  if (suit === 'J' || num === 'S' || num === 'B') {
    return num === 'B' ? null : 'BJ';
  }
  if (trumpSuit !== null && card === declared) {
    return 'SJ';
  }
  if (num === big) {
    // Off-suit declared rank cards (and all rank cards in No-Trump) do not form tractors by default
    return null;
  }
  if (num === 'A') {
    if ((trumpSuit !== null && suit === trumpSuit) || !wrap) return null;
    return `${big === '2' ? '3' : '2'}${suit as BasicSuit}`;
  }
  if (num === 'K' && big === 'A') {
    return null;
  }
  const idx = BASIC_NUMS.indexOf(num as BasicNum);
  const nextNum = BASIC_NUMS[idx + 1] === big ? BASIC_NUMS[idx + 2] : BASIC_NUMS[idx + 1];
  if (!nextNum) return null;
  return `${nextNum}${suit as BasicSuit}`;
}

export function createDeck(numDecks: number): Card[] {
  const deck: Card[] = [];
  for (let d = 0; d < numDecks; d++) {
    for (const num of BASIC_NUMS) {
      for (const suit of BASIC_SUITS) {
        deck.push(`${num}${suit}`);
      }
    }
    deck.push('SJ', 'BJ');
  }
  shuffle(deck);
  return deck;
}

export function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export function countCards(cards: Card[]): Map<Card, number> {
  const map = new Map<Card, number>();
  for (const c of cards) {
    map.set(c, (map.get(c) ?? 0) + 1);
  }
  return map;
}

export function formatCard(card: Card): string {
  if (card === 'SJ') return 'Small Joker';
  if (card === 'BJ') return 'Big Joker';
  const [num, suit] = parseCard(card);
  const symbols: Record<BasicSuit, string> = { C: '♣', D: '♦', S: '♠', H: '♥' };
  return `${num}${symbols[suit as BasicSuit]}`;
}

export function formatDeclared(declared: Declared): string {
  const [rank, suit] = parseDeclared(declared);
  if (suit === null) {
    return `No Trump (${rank}s)`;
  }
  const symbols: Record<BasicSuit, string> = { C: '♣', D: '♦', S: '♠', H: '♥' };
  return `${rank}${symbols[suit]}`;
}
