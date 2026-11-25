import { Card, EffectiveSuit, compareCards, getSuit, nextLargest, parseCard } from './cards.js';

export interface PlayData {
  card: Card;
  multiplicity: number;
  length: number;
}

/**
 * Represents a single group of cards: single, pair, triple, ..., or tractor (m >= 2, l >= 2).
 * Identified by its lowest card `card`, `multiplicity` (m), and `length` (l).
 */
export class Play {
  public readonly card: Card;
  public readonly multiplicity: number;
  public readonly length: number;

  constructor(card: Card, multiplicity = 1, length = 1) {
    if (multiplicity < 1) {
      throw new TypeError('Cannot have multiplicity < 1.');
    }
    if (length < 1) {
      throw new TypeError('Cannot have length < 1.');
    }
    if (length > 1 && multiplicity === 1) {
      throw new TypeError('Cannot have tractors of multiplicity 1.');
    }
    this.card = card;
    this.multiplicity = multiplicity;
    this.length = length;
  }

  get size(): number {
    return this.multiplicity * this.length;
  }

  getSuit(declared: Card): EffectiveSuit {
    return getSuit(this.card, declared);
  }

  /**
   * True if this play is an Ace-low wraparound tractor (e.g. AA22, AA2233).
   */
  isWraparound(declared: Card): boolean {
    if (this.length <= 1) return false;
    const [num] = parseCard(this.card);
    return num === 'A' && getSuit(this.card, declared) !== 'T';
  }

  getCards(declared: Card, wrap = true): Card[] {
    const cards: Card[] = [];
    let curCard: Card | null = this.card;
    for (let i = 0; i < this.length; i++) {
      if (!curCard) {
        throw new RangeError(`Play ${this.card} (${this.multiplicity}x${this.length}) goes out of range.`);
      }
      for (let j = 0; j < this.multiplicity; j++) {
        cards.push(curCard);
      }
      curCard = nextLargest(curCard, declared, wrap && i === 0);
    }
    return cards;
  }

  copy(): Play {
    return new Play(this.card, this.multiplicity, this.length);
  }

  toJSON(): PlayData {
    return {
      card: this.card,
      multiplicity: this.multiplicity,
      length: this.length,
    };
  }

  static fromJSON(data: PlayData): Play {
    return new Play(data.card, data.multiplicity, data.length);
  }

  /**
   * Compares two plays of the same shape (m, l) in the same suit.
   * Wraparound tractors (Ace-low, e.g. AA22) are the lowest tractors in their suit.
   */
  static compareStrength(p1: Play, p2: Play, declared: Card): number {
    const w1 = p1.isWraparound(declared);
    const w2 = p2.isWraparound(declared);
    if (w1 && !w2) return -1;
    if (!w1 && w2) return 1;
    if (w1 && w2) return 0;
    return compareCards(p1.card, p2.card, declared);
  }

  /**
   * Sorts plays ascending by (size, multiplicity, card strength).
   */
  static sortPlays(plays: Play[], declared?: Card): Play[] {
    return [...plays].sort((p1, p2) => {
      const sizeDiff = p1.size - p2.size;
      if (sizeDiff !== 0) return sizeDiff;
      const multDiff = p1.multiplicity - p2.multiplicity;
      if (multDiff !== 0) return multDiff;
      if (declared) {
        return Play.compareStrength(p1, p2, declared);
      }
      return compareCards(p1.card, p2.card);
    });
  }

  /**
   * Returns true if `currentWinner` (played earlier) remains the winner against `challenger`.
   * Both arrays should be sorted descending by (size, multiplicity).
   */
  static winsAgainst(currentWinner: Play[], challenger: Play[], declared: Card): boolean {
    if (currentWinner.length !== challenger.length) return true;
    const s1 = currentWinner[0].getSuit(declared);
    const s2 = challenger[0].getSuit(declared);

    // Challenger must be entirely of a single suit (either matching s1 or all trump)
    for (const p of challenger) {
      if (p.getSuit(declared) !== s2) return true;
    }
    if (s1 !== s2 && s2 !== 'T') return true;

    for (let i = 0; i < currentWinner.length; i++) {
      if (
        currentWinner[i].multiplicity !== challenger[i].multiplicity ||
        currentWinner[i].length !== challenger[i].length
      ) {
        return true;
      }
      if (s1 === s2 && Play.compareStrength(currentWinner[i], challenger[i], declared) >= 0) {
        return true;
      }
    }
    return false;
  }
}
