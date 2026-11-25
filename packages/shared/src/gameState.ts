import {
  BASIC_NUMS,
  BasicNum,
  Card,
  compareCardsForSort,
  countCards,
  createDeck,
  getPointValue,
  getSuit,
  parseCard,
} from './cards.js';
import { Matcher, cardsMatchPossibility, decomposeThrow } from './matcher.js';
import { Play, PlayData } from './play.js';
import { DEFAULT_SETTINGS, GameSettings, computeBottomSize, computeTeamSize } from './settings.js';

export type GamePhase = 'lobby' | 'deal' | 'bottom' | 'play' | 'score';

export interface Declaration {
  card: Card;
  amount: number;
  player: number;
  canPrevPlayerReinforce: boolean;
  prevPlayer?: number;
}

export interface FriendCall {
  card: Card;
  nth: number;
  remaining: number;
  revealedBy?: number;
}

export interface TrickEntry {
  player: number;
  plays: PlayData[];
  cards: Card[];
}

export interface TrickResult {
  type: 'trick';
  winner: number;
  points: Card[];
}

export interface RejectedThrowResult {
  type: 'rejected_throw';
  forcedPlay: PlayData;
}

export interface RoundResult {
  type: 'round';
  winners: number[];
  defenders: number[];
  friends: number[];
  levelChange: number;
  gameWinners: number[];
  points: number;
  bottomPoints: number;
  bottomCapturedByDefenders: boolean;
  bottom: Card[];
}

export type PlayResult = TrickResult | RejectedThrowResult | RoundResult | null;

export interface PlayerState {
  id: string;
  name: string;
  avatarUri: string;
  isBot: boolean;
  rank: BasicNum;
  hand: Card[];
  points: Card[];
}

export interface ClientPlayerView {
  id: string;
  name: string;
  avatarUri: string;
  isBot: boolean;
  rank: BasicNum;
  handCount: number;
  points: Card[];
  isFriend: boolean;
  isDealer: boolean;
}

export interface ClientGameState {
  phase: GamePhase;
  settings: GameSettings;
  players: ClientPlayerView[];
  myIndex: number;
  myHand: Card[];
  bottomSize: number;
  bottom: Card[]; // Only revealed in score phase or to dealer in bottom phase
  declared?: Card;
  declarations: Declaration[];
  dealerIndex: number;
  teamSize: number;
  friendCalls: FriendCall[];
  currentTurn: number;
  trickLeader: number;
  currentTrick: TrickEntry[];
  lastTrick: TrickEntry[];
  deckRemaining: number;
  lastRoundResult?: RoundResult;
  lastNotice?: string;
}

export class ZpyGame {
  public settings: GameSettings;
  public phase: GamePhase = 'lobby';
  public players: PlayerState[] = [];
  public deck: Card[] = [];
  public bottom: Card[] = [];
  public bottomSize = 8;
  public teamSize = 2;
  public declared?: Card;
  public declarations: Declaration[] = [];
  public dealerIndex = 0;
  public friendCalls: FriendCall[] = [];
  public friends = new Set<number>();
  public winners: number[] = [];
  public currentTurn = 0;
  public trickLeader = 0;
  public currentTrick: { player: number; plays: Play[]; cards: Card[] }[] = [];
  public lastTrick: { player: number; plays: Play[]; cards: Card[] }[] = [];
  public lastRoundResult?: RoundResult;
  public lastNotice?: string;

  constructor(settings: Partial<GameSettings> = {}) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
  }

  addPlayer(id: string, name: string, avatarUri: string, isBot = false): number {
    const existing = this.players.findIndex((p) => p.id === id);
    if (existing !== -1) {
      this.players[existing].name = name;
      this.players[existing].avatarUri = avatarUri;
      return existing;
    }
    if (this.phase !== 'lobby') {
      throw new Error('Cannot join while a round is in progress.');
    }
    this.players.push({
      id,
      name,
      avatarUri,
      isBot,
      rank: '2',
      hand: [],
      points: [],
    });
    return this.players.length - 1;
  }

  removePlayer(id: string): void {
    const idx = this.players.findIndex((p) => p.id === id);
    if (idx === -1) return;
    if (this.phase === 'lobby') {
      this.players.splice(idx, 1);
    }
  }

  updateSettings(partial: Partial<GameSettings>): void {
    if (this.phase !== 'lobby' && this.phase !== 'score') {
      throw new Error('Settings can only be updated in lobby or between rounds.');
    }
    this.settings = { ...this.settings, ...partial };
  }

  startRound(): void {
    if (this.phase !== 'lobby' && this.phase !== 'score') {
      throw new Error('Round can only be started from lobby or score phase.');
    }
    if (this.players.length < 2) {
      throw new Error('Need at least 2 players to start.');
    }
    if (this.settings.numDecks < 1) {
      throw new Error('Must have at least 1 deck.');
    }

    this.bottomSize = computeBottomSize(
      this.settings.numDecks,
      this.players.length,
      this.settings.bottomSize
    );
    if ((54 * this.settings.numDecks - this.bottomSize) % this.players.length !== 0) {
      throw new Error('Invalid bottom size for player count and deck count.');
    }
    this.teamSize = computeTeamSize(this.players.length, this.settings.teamSize);

    if (this.winners.length === 0) {
      this.winners = this.players.map((_, i) => i);
    }

    this.phase = 'deal';
    this.deck = createDeck(this.settings.numDecks);
    this.bottom = [];
    this.declared = undefined;
    this.declarations = [];
    this.friendCalls = [];
    this.friends = new Set();
    this.currentTrick = [];
    this.lastTrick = [];
    this.lastRoundResult = undefined;
    this.lastNotice = undefined;
    this.currentTurn = this.dealerIndex % this.players.length;
    for (const p of this.players) {
      p.hand = [];
      p.points = [];
    }
  }

  dealCard(): { playerIndex: number; card: Card } | null {
    if (this.phase !== 'deal') {
      throw new Error('Cards can only be dealt in deal phase.');
    }
    if (this.deck.length <= this.bottomSize) {
      return null;
    }
    const card = this.deck.pop();
    if (!card) return null;
    const playerIndex = this.currentTurn;
    this.players[playerIndex].hand.push(card);
    this.players[playerIndex].hand.sort((a, b) => compareCardsForSort(a, b, this.declared));
    this.currentTurn = (this.currentTurn + 1) % this.players.length;
    return { playerIndex, card };
  }

  declare(playerIndex: number, card: Card, amount = 1): Declaration {
    if (this.phase !== 'deal') {
      throw new Error('Can only declare in deal phase.');
    }
    const player = this.players[playerIndex];
    if (!player) throw new Error('Invalid player.');
    const [num, suit] = parseCard(card);
    if (suit === 'J') throw new Error('Cannot declare with jokers.');
    if (num !== player.rank) {
      throw new Error(`Must declare with your current rank (${player.rank}).`);
    }
    if (this.settings.winnersDeclare && !this.winners.includes(playerIndex)) {
      throw new Error('Only previous round winners may declare.');
    }
    const countInHand = player.hand.filter((c) => c === card).length;
    if (countInHand < amount) {
      throw new Error('Not enough copies of that card in hand to declare.');
    }

    const prev = this.declarations[this.declarations.length - 1];
    if (prev) {
      if (amount === prev.amount && prev.canPrevPlayerReinforce) {
        const orig = this.declarations[this.declarations.length - 2];
        if (!orig || orig.player !== playerIndex || orig.card !== card) {
          throw new Error('Invalid reinforce declaration.');
        }
      } else if (amount <= prev.amount) {
        throw new Error('Must declare with more cards to overturn.');
      }
    }

    const canPrevPlayerReinforce = prev
      ? prev.amount < amount &&
        this.players[prev.player].hand.filter((c) => c === prev.card).length >= amount
      : false;

    const declaration: Declaration = {
      card,
      amount,
      player: playerIndex,
      canPrevPlayerReinforce,
      prevPlayer: canPrevPlayerReinforce ? prev.player : undefined,
    };
    this.declarations.push(declaration);
    this.declared = card;

    // Re-sort all hands with the new trump suit
    for (const p of this.players) {
      p.hand.sort((a, b) => compareCardsForSort(a, b, this.declared));
    }
    return declaration;
  }

  endDealPhase(): { dealer: number; bottom: Card[]; declared: Card } {
    if (this.phase !== 'deal') {
      throw new Error('Not in deal phase.');
    }
    if (this.deck.length > this.bottomSize) {
      throw new Error('Deck has not finished dealing.');
    }

    if (this.declarations.length > 0) {
      const last = this.declarations[this.declarations.length - 1];
      this.declared = last.card;
      this.dealerIndex = last.player;
    } else {
      // Fallback if nobody declared: flip first non-joker card in bottom, or default to 2S
      const dealer = this.winners[0] ?? 0;
      const rank = this.players[dealer].rank;
      const flipped = this.deck.find((c) => parseCard(c)[1] !== 'J');
      const suit = flipped ? parseCard(flipped)[1] : 'S';
      this.declared = `${rank}${suit === 'J' ? 'S' : suit}` as Card;
      this.dealerIndex = dealer;
      this.lastNotice = `No declaration made — trump defaulted to ${this.declared}.`;
    }

    this.phase = 'bottom';
    this.currentTurn = this.dealerIndex;
    this.friends = new Set([this.dealerIndex]);

    const bottomCards = [...this.deck];
    this.deck = [];
    this.players[this.dealerIndex].hand.push(...bottomCards);
    for (const p of this.players) {
      p.hand.sort((a, b) => compareCardsForSort(a, b, this.declared));
    }

    return {
      dealer: this.dealerIndex,
      bottom: bottomCards,
      declared: this.declared,
    };
  }

  endBottomPhase(bottom: Card[], friendCalls: { card: Card; nth: number }[]): void {
    if (this.phase !== 'bottom') {
      throw new Error('Not in bottom phase.');
    }
    const expectedCalls = Math.max(0, this.teamSize - 1);
    if (friendCalls.length !== expectedCalls) {
      throw new Error(`Must call exactly ${expectedCalls} friend${expectedCalls === 1 ? '' : 's'}.`);
    }
    if (bottom.length !== this.bottomSize) {
      throw new Error(`Bottom must contain exactly ${this.bottomSize} cards.`);
    }
    if (!this.hasCards(this.dealerIndex, bottom)) {
      throw new Error('Bottom contains cards not in dealer hand.');
    }

    const dealerHand = this.players[this.dealerIndex].hand;
    for (const c of bottom) {
      const idx = dealerHand.indexOf(c);
      dealerHand.splice(idx, 1);
    }

    this.bottom = [...bottom];
    this.friendCalls = friendCalls.map((fc) => ({
      card: fc.card,
      nth: fc.nth,
      remaining: fc.nth,
    }));
    this.phase = 'play';
    this.currentTurn = this.dealerIndex;
    this.trickLeader = this.dealerIndex;
  }

  makePlay(playerIndex: number, selectedCards: Card[]): PlayResult {
    if (this.phase !== 'play') {
      throw new Error('Not in play phase.');
    }
    if (playerIndex !== this.currentTurn) {
      throw new Error('It is not your turn.');
    }
    if (selectedCards.length === 0) {
      throw new Error('Must play at least one card.');
    }
    if (!this.hasCards(playerIndex, selectedCards)) {
      throw new Error('Selected cards are not in your hand.');
    }

    const declared = this.declared!;
    let cardsToPlay = [...selectedCards];
    let plays: Play[];
    let forcedPlay: Play | null = null;

    if (this.currentTrick.length === 0) {
      // Leading a trick: all cards must belong to the same effective suit
      const leadSuit = getSuit(cardsToPlay[0], declared);
      if (!cardsToPlay.every((c) => getSuit(c, declared) === leadSuit)) {
        throw new Error('Lead play must be of a single suit.');
      }
      plays = decomposeThrow(cardsToPlay, this.settings.numDecks, declared, this.settings.wraparound);

      if (plays.length > 1) {
        // Validate throw against all other players
        const beaten = this.findBeatenThrowComponent(playerIndex, plays);
        if (beaten) {
          forcedPlay = beaten;
          plays = [beaten];
          cardsToPlay = beaten.getCards(declared, this.settings.wraparound);
          this.lastNotice = `${this.players[playerIndex].name}'s throw was rejected! Forced to play ${cardsToPlay.join(', ')}.`;
        } else {
          this.lastNotice = undefined;
        }
      } else {
        this.lastNotice = undefined;
      }
      this.trickLeader = playerIndex;
    } else {
      // Following a trick
      const leadPlays = this.currentTrick[0].plays;
      const trickSize = leadPlays.reduce((s, p) => s + p.size, 0);
      if (cardsToPlay.length !== trickSize) {
        throw new Error(`Must play exactly ${trickSize} cards.`);
      }

      const leadSuit = leadPlays[0].getSuit(declared);
      const suitedInHand = this.players[playerIndex].hand.filter((c) => getSuit(c, declared) === leadSuit);
      const suitedPlayed = cardsToPlay.filter((c) => getSuit(c, declared) === leadSuit);

      if (suitedInHand.length > trickSize) {
        if (suitedPlayed.length !== trickSize) {
          throw new Error('Must follow suit.');
        }
        const possibilities = Matcher.fromHand(
          suitedInHand,
          leadPlays,
          declared,
          this.settings.wraparound
        ).getPossibilities();

        const valid = possibilities.some((poss) =>
          cardsMatchPossibility(cardsToPlay, poss, declared, this.settings.wraparound)
        );
        if (!valid) {
          throw new Error('Play does not match required pairs/tractors in hand.');
        }
      } else if (suitedPlayed.length !== suitedInHand.length) {
        throw new Error('Must play all cards of the led suit.');
      }

      // Group cards into Plays if single-suited (for winner comparison), else singles
      const playSuit = getSuit(cardsToPlay[0], declared);
      const allSameSuit = cardsToPlay.every((c) => getSuit(c, declared) === playSuit);
      if (allSameSuit) {
        plays = decomposeThrow(cardsToPlay, this.settings.numDecks, declared, this.settings.wraparound);
      } else {
        plays = cardsToPlay.map((c) => new Play(c, 1, 1));
      }
    }

    // Remove played cards from hand and check friend calls
    const hand = this.players[playerIndex].hand;
    for (const c of cardsToPlay) {
      const idx = hand.indexOf(c);
      hand.splice(idx, 1);

      for (const fc of this.friendCalls) {
        if (fc.revealedBy === undefined && fc.card === c) {
          fc.remaining -= 1;
          if (fc.remaining === 0) {
            fc.revealedBy = playerIndex;
            this.friends.add(playerIndex);
            this.players[playerIndex].points = [];
            this.lastNotice = `${this.players[playerIndex].name} joined the dealer's team!`;
          }
        }
      }
    }

    this.currentTrick.push({ player: playerIndex, plays, cards: cardsToPlay });

    // Check if trick is complete
    if (this.currentTrick.length === this.players.length) {
      const { winner, points } = this.concludeTrick();
      this.lastTrick = this.currentTrick;
      this.currentTrick = [];
      this.currentTurn = winner;
      this.trickLeader = winner;

      if (!this.friends.has(winner) && points.length > 0) {
        this.players[winner].points.push(...points);
      }

      if (this.players.every((p) => p.hand.length === 0)) {
        this.phase = 'score';
        const roundResult = this.calculateScore(winner);
        this.lastRoundResult = roundResult;
        return roundResult;
      }

      return { type: 'trick', winner, points };
    }

    this.currentTurn = (this.currentTurn + 1) % this.players.length;
    if (forcedPlay) {
      return { type: 'rejected_throw', forcedPlay: forcedPlay.toJSON() };
    }
    return null;
  }

  private findBeatenThrowComponent(leader: number, plays: Play[]): Play | null {
    const declared = this.declared!;
    const n = this.players.length;
    // Check smallest/weakest components first so forcedPlay is the smallest beaten play
    const ascending = Play.sortPlays(plays, declared);
    for (const p of ascending) {
      const suit = p.getSuit(declared);
      for (let offset = 1; offset < n; offset++) {
        const opp = (leader + offset) % n;
        const oppSuited = this.players[opp].hand.filter((c) => getSuit(c, declared) === suit);
        if (oppSuited.length === 0) continue;
        if (Matcher.fromHand(oppSuited, [p], declared, this.settings.wraparound).beatsTrick()) {
          return p;
        }
      }
    }
    return null;
  }

  private concludeTrick(): { winner: number; points: Card[] } {
    const declared = this.declared!;
    let winIdx = 0;
    const points: Card[] = [];

    for (let i = 0; i < this.currentTrick.length; i++) {
      const entry = this.currentTrick[i];
      if (i > 0 && !Play.winsAgainst(this.currentTrick[winIdx].plays, entry.plays, declared)) {
        winIdx = i;
      }
      for (const c of entry.cards) {
        if (getPointValue(c) > 0) {
          points.push(c);
        }
      }
    }
    return { winner: this.currentTrick[winIdx].player, points };
  }

  private calculateScore(lastTrickWinner: number): RoundResult {
    const cutoff = this.settings.numDecks * this.settings.cutoffPerDeck;
    let points = 0;
    const defenders: number[] = [];

    for (let i = 0; i < this.players.length; i++) {
      if (!this.friends.has(i)) {
        defenders.push(i);
        for (const c of this.players[i].points) {
          points += getPointValue(c);
        }
      }
    }

    const bottomCapturedByDefenders = !this.friends.has(lastTrickWinner);
    let bottomPoints = 0;
    if (bottomCapturedByDefenders) {
      for (const c of this.bottom) {
        bottomPoints += getPointValue(c) * this.settings.bottomMultiplier;
      }
      points += bottomPoints;
    }

    const friendsArr = [...this.friends];
    let winners: number[];
    let multiplier = 1;
    if (points >= cutoff) {
      winners = defenders;
    } else {
      winners = friendsArr;
      multiplier = Math.max(1, this.teamSize - friendsArr.length + 1);
    }

    const baseLevels =
      points === 0 ? 3 : Math.max(1, Math.abs(Math.floor(((points - cutoff) * 2) / cutoff)));
    const levelChange = multiplier * baseLevels;
    this.winners = winners;

    const gameWinners: number[] = [];
    for (const idx of winners) {
      const nextIdx = BASIC_NUMS.indexOf(this.players[idx].rank) + levelChange;
      if (nextIdx >= BASIC_NUMS.length) {
        gameWinners.push(idx);
        this.players[idx].rank = 'A';
      } else {
        this.players[idx].rank = BASIC_NUMS[nextIdx];
      }
    }

    // Rotate dealer to next winner
    this.dealerIndex = winners[0] ?? 0;

    return {
      type: 'round',
      winners,
      defenders,
      friends: friendsArr,
      levelChange,
      gameWinners,
      points,
      bottomPoints,
      bottomCapturedByDefenders,
      bottom: [...this.bottom],
    };
  }

  private hasCards(playerIndex: number, cards: Card[]): boolean {
    const needed = countCards(cards);
    const owned = countCards(this.players[playerIndex].hand);
    for (const [card, count] of needed) {
      if ((owned.get(card) ?? 0) < count) return false;
    }
    return true;
  }

  getClientView(playerIndex: number): ClientGameState {
    const showBottom =
      this.phase === 'score' || (this.phase === 'bottom' && playerIndex === this.dealerIndex);

    return {
      phase: this.phase,
      settings: this.settings,
      players: this.players.map((p, idx) => ({
        id: p.id,
        name: p.name,
        avatarUri: p.avatarUri,
        isBot: p.isBot,
        rank: p.rank,
        handCount: p.hand.length,
        points: p.points,
        isFriend: this.friends.has(idx),
        isDealer: idx === this.dealerIndex && this.phase !== 'lobby',
      })),
      myIndex: playerIndex,
      myHand: playerIndex >= 0 && this.players[playerIndex] ? [...this.players[playerIndex].hand] : [],
      bottomSize: this.bottomSize,
      bottom: showBottom ? [...this.bottom] : [],
      declared: this.declared,
      declarations: this.declarations,
      dealerIndex: this.dealerIndex,
      teamSize: this.teamSize,
      friendCalls: this.friendCalls,
      currentTurn: this.currentTurn,
      trickLeader: this.trickLeader,
      currentTrick: this.currentTrick.map((t) => ({
        player: t.player,
        plays: t.plays.map((p) => p.toJSON()),
        cards: t.cards,
      })),
      lastTrick: this.lastTrick.map((t) => ({
        player: t.player,
        plays: t.plays.map((p) => p.toJSON()),
        cards: t.cards,
      })),
      deckRemaining: this.deck.length,
      lastRoundResult: this.lastRoundResult,
      lastNotice: this.lastNotice,
    };
  }
}
