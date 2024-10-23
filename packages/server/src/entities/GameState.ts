import { Schema, SetSchema, type, filter, ArraySchema, MapSchema } from '@colyseus/schema';
import { Client } from '@colyseus/core';
import { Card, createDeck, parseCard, getPointValue, getSuit, compareCards } from "zpy/src/Card";
import { Settings } from "./Settings";
import { Play } from 'zpy/src/Play';
import { Player, TPlayerOptions } from './Player';
import { Matcher, matchesPossibility } from "zpy/src/Matcher";
import { countAsMap } from "zpy/src/util";

export type GamePhase = 'deal' | 'bottom' | 'play' | 'score';

export class Declaration extends Schema {
    @type('string') card: Card;
    @type('number') amount: number;
    @type('string') playerId: string;
    @filter(function (this: Declaration, client: Client, value: number, root: Schema) {
        return this.prevPlayer === client.sessionId;
    })
    @type('boolean') canPrevPlayerReinforce: boolean;
    @type('string') prevPlayer?: string;

    constructor(card: Card, amount: number, playerId: string, canPrevPlayerReinforce: boolean, prevPlayer?: string) {
        super();
        this.card = card;
        this.amount = amount;
        this.playerId = playerId;
        this.canPrevPlayerReinforce = canPrevPlayerReinforce;
        this.prevPlayer = prevPlayer;
    }
}

export interface DealPhaseResult {
    dealer: string;
    bottom: Card[];
}

export class FriendCall extends Schema {
    @type('string') card: Card;
    @type('number') nth: number;

    constructor(card: Card, nth: number) {
        super();
        this.card = card;
        this.nth = nth;
    }
}

export interface RoundResult {
    winners: string[];
    levelChange: number;
    gameWinners: string[];
    points: number;
    bottom: Card[];
}

export interface RejectedThrow {
    forcedPlay: Play;
}

export interface TrickResult {
    winner: string;
    points: Card[];
}

export type PlayResult = RoundResult | RejectedThrow | TrickResult | null;

class PlayArray extends Schema {
    @type(['string']) plays;

    constructor(plays: Play[]) {
        super();
        this.plays = new ArraySchema(...plays.map(p => JSON.stringify(p)));
    }

    toArray() {
        return this.plays.map(p => {
            const play = JSON.parse(p);
            return play as Play;
        });
    }
}

export class GameState extends Schema {
    /** The phase of the game. Starts with score and waits for `startRound` to change to `'deal'`. */
    @type(Settings) settings: Settings;
    @type('string') phase: GamePhase = 'score';
    @type(['string']) deck: Card[] = [];
    @type([Player]) players;
    @type(['string']) bottom: Card[] = [];
    @type('number') bottomSize: number;
    @type('string') declared?: Card;
    @type([Declaration]) declarations = new ArraySchema<Declaration>();
    @type('number') teamSize: number;
    @type([FriendCall]) friendCalls = new ArraySchema<FriendCall>();
    @type({ set: 'string' }) friends = new SetSchema<string>();
    @type({ set: 'string' }) winners = new SetSchema<string>();
    @type('string') currentTurn;
    @type([PlayArray]) currentTrick = new ArraySchema<PlayArray>();

    constructor(settings: Partial<Settings>, players: TPlayerOptions[]) {
        super();
        this.settings = new Settings(settings);
        const settingsError = this.settings.checkSettingsForErrors();
        if (settingsError) throw new Error(settingsError);
        if (this.settings.numPlayers !== players.length) throw new Error('Need all players to start.');
        this.players = new ArraySchema<Player>(...players.map(p => new Player(p)));
        this.players.forEach(p => this.winners.add(p.sessionId));
        this.currentTurn = this.players[0].sessionId;
        if (!this.settings.bottomSize) {
            let bottomSize = ((54 * this.settings.numDecks) % this.settings.numPlayers);
            while (bottomSize < 6 - this.settings.numPlayers / 2) {
                bottomSize += this.settings.numPlayers;
            }
            this.bottomSize = bottomSize;
        } else {
            this.bottomSize = this.settings.bottomSize;
        }
        this.teamSize = this.settings.teamSize ?? Math.floor(this.settings.numPlayers / 2);
    }

    reset() {
        Object.assign(this, new GameState(this.settings, this.players.map(p => p)));
    }

    startRound() {
        if (this.phase !== 'score') throw new Error('Game can only be started in score phase.');
        this.phase = 'deal';
        this.bottom = [];
        this.friends = new SetSchema();
        this.deck = createDeck(this.settings.numDecks);
        this.declarations = new ArraySchema();
        this.players.forEach(p => p.newRound());
    }

    dealCard() {
        if (this.phase !== 'deal') throw new Error('Cards can only be dealt in deal phase.');
        if (this.deck.length === this.bottomSize) return null;
        const card = this.deck.pop();
        if (!card) return null;
        this.currentPlayer.hand.push(card);
        this.incrementTurn();
        return card;
    }

    declare(playerId: string, card: Card, amount = 1): Declaration {
        const player = this.playerFromId(playerId);
        if (this.phase !== 'deal') throw new Error('Can only declare in deal phase.');
        if (parseCard(card)[0] !== player.rank) throw new Error('Player trying to declare out of rank.');
        if (this.settings.winnersDeclare && !this.winners.has(player.sessionId)) throw new Error('Only winners may declare.');
        if (player.hand.filter(c => c === card).length < amount) throw new Error('Player trying to declare with cards they don\'t have.');
        const prevDeclaration = this.declarations[this.declarations.length - 1];
        if (prevDeclaration) {
            if (amount === prevDeclaration.amount && prevDeclaration.canPrevPlayerReinforce) { // Someone trying to reinforce.
                const origDeclaration = this.declarations[this.declarations.length - 2];
                if (!origDeclaration || player.sessionId !== origDeclaration.playerId || card !== origDeclaration.card) throw new Error('Invalid reinforce.');
            } else if (amount <= prevDeclaration.amount) throw new Error('Not enough cards to overturn.');
        }
        const canPrevPlayerReinforce = prevDeclaration ? prevDeclaration.amount < amount && this.playerFromId(prevDeclaration.playerId).hand.filter(c => c === prevDeclaration.card).length >= amount : false;
        const declaration = new Declaration(card, amount, playerId, canPrevPlayerReinforce, canPrevPlayerReinforce ? prevDeclaration?.playerId : undefined);
        this.declarations.push(declaration);
        return declaration; // canPrevPlayerReinforce should only be sent to prevPlayer.
    }

    endDealPhase(): DealPhaseResult {
        if (this.phase !== 'deal') throw new Error('Not in deal phase.');
        this.declared = this.declarations[this.declarations.length - 1].card;
        this.phase = 'bottom';
        this.incrementTurn();
        const declaration = this.declarations[this.declarations.length - 1];
        const nextPlayerId = declaration ? declaration.playerId : this.currentTurn; // If no one declares, force first player to be dealer.
        this.currentTurn = nextPlayerId;
        this.friends.add(nextPlayerId);
        const dealerHand = this.currentPlayer.hand;
        dealerHand.push(...this.deck);
        this.players.forEach(p => p.hand.sort((a, b) => compareCards(a, b, this.declared!)));
        return { dealer: this.currentTurn, bottom: this.deck }; // Should be sent to declared.player
    }

    endBottomPhase(playerId: string, bottom: Card[], friendCalls: FriendCall[]) {
        if (this.phase !== 'bottom') throw new Error('Not in bottom phase.');
        if (playerId !== this.currentTurn) throw new Error('Not the declaring player.');
        if (friendCalls.length !== this.teamSize - 1) throw new Error(`Need to call ${this.teamSize - 1} friend${this.teamSize === 2 ? '' : 's'}.`);
        if (bottom.length !== this.bottomSize) throw new Error(`Bottom must be ${this.bottomSize} cards.`);
        if (!this.validateSelection(bottom)) throw new Error('Bottom includes card not in hand.');
        const dealerHand = this.currentPlayer.hand;
        for (const card of bottom) {
            dealerHand.splice(dealerHand.findIndex(c => c === card), 1);
        }
        this.bottom = bottom;
        this.friendCalls = new ArraySchema<FriendCall>(...friendCalls);
        this.phase = 'play';
    }

    makePlay(playerId: string, playSerialized: string[]): PlayResult {
        let play = playSerialized.map(p => Play.parse(p));
        if (this.phase !== 'play') throw new Error('Not in play phase.');
        if (playerId !== this.currentTurn) throw new Error('Playing out of turn.');
        play = Play.sortPlays(play, this.declared).reverse();
        let forced = false;
        if (this.currentTrick.length === 0 && play.length > 1) {
            if (!this.checkThrowSuited(play)) throw Error('Throw is not suited.');
            const forcedPlay = this.checkThrowValid(play);
            if (forcedPlay) {
                forced = true;
                play = [forcedPlay];
            }
        }
        const player = this.currentPlayer;
        const cards: Card[] = [];
        for (const p of play) {
            cards.push(...p.getCards(this.declared!));
        }
        if (!this.validateSelection(cards)) throw new Error('Player is trying to play cards they don\'t have.');
        if (!this.isValidPlay(play)) throw new Error('Player is not allowed to play that.');
        for (const c of cards) {
            for (const friend of this.friendCalls) {
                if (c === friend.card) {
                    if (friend.nth === 1) {
                        this.friends.add(this.currentTurn);
                        this.currentPlayer.points = new ArraySchema<Card>();
                    } else {
                        friend.nth -= 1;
                    }
                }
            }
            const i = player.hand.indexOf(c);
            if (i === -1) throw new Error('Card not in hand.');
            player.hand.splice(i, 1);
        }
        this.currentTrick.push(new PlayArray(play));
        if (this.currentTrick.length === this.players.length) {
            // Conclude trick
            this.incrementTurn();
            const [winner, points] = this.computeWinner();
            this.currentTurn = winner;
            if (!this.friends.has(winner)) this.playerFromId(winner).points.push(...points);
            this.currentTrick = new ArraySchema<PlayArray>();
            if (this.players[0].hand.length === 0) {
                this.phase = 'score';
                return this.calculateScore();
            }
            return { winner, points };
        }
        this.incrementTurn();
        return forced ? { forcedPlay: play[0] } : null;
    }

    private get currentPlayer() {
        return this.playerFromId(this.currentTurn);
    }

    private playerFromId(id: string) {
        const player = this.players.find(p => p.sessionId === id);
        if (!player) throw new Error('Invalid player id.');
        return player;
    }

    private checkThrowSuited(play: Play[]) {
        const suit = play[0].getSuit(this.declared!);
        for (const p of play) {
            if (p.getSuit(this.declared!) !== suit) return false;
        }
        return true;
    }

    private isValidPlay(play: Play[]) {
        if (this.currentTrick.length === 0) return true;
        const trick = this.currentTrick[0];
        const trickSize = trick.toArray().reduce((t, p) => t + p.size, 0);
        const playSize = play.reduce((t, p) => t + p.size, 0);
        if (trickSize !== playSize) return false;
        const suit = getSuit(this.currentTrick[0].toArray()[0].card, this.declared!);
        const suitedCards = this.currentPlayer.hand.filter(c => getSuit(c, this.declared!) === suit);
        const playNumSuitedCards = play.filter(p => p.getSuit(this.declared!) === suit).reduce((a, p) => a + p.size, 0);
        if (suitedCards.length > trickSize) {
            if (playNumSuitedCards !== trickSize) return false;
            for (const possibility of Matcher.fromHand(suitedCards, this.currentTrick[0].toArray(), this.declared!, this.settings.wraparound).getPossibilities()) {
                if (matchesPossibility(play, possibility, this.declared!)) return true;
            }
            return false;
        }
        return playNumSuitedCards === suitedCards.length;
    }

    private checkThrowValid(play: Play[]) {
        const n = this.players.length;
        for (const p of play) {
            const suit = getSuit(p.card, this.declared!);
            for (let i = 1; i < n; i++) {
                const suitedCards = this.players[(this.currentPlayer.index + i) % n].hand.filter(c => getSuit(c, this.declared!) === suit);
                if (Matcher.fromHand(suitedCards, [p], this.declared!, this.settings.wraparound).beatsTrick()) {
                    return p;
                }
            }
        }
        return null;
    }

    private computeWinner(): [string, Card[]] {
        if (this.currentTrick.length !== this.players.length) throw new Error('Trick still in progress.');
        const points: Card[] = [];
        let currentWinner = 0;
        for (let i = 0; i < this.currentTrick.length; i++) {
            const play = this.currentTrick[i];
            if (i > 0 && !Play.winsAgainst(this.currentTrick[currentWinner].toArray(), play.toArray(), this.declared!)) {
                currentWinner = i;
            }
            for (const p of play.toArray()) {
                for (const card of p.getCards(this.declared!)) {
                    if (getPointValue(card)) points.push(card);
                }
            }
        }
        return [this.players[(this.currentPlayer.index + currentWinner) % this.players.length].sessionId, points];
    }

    private calculateScore(): RoundResult {
        const cutoff = this.settings.numDecks * this.settings.cutoffPerDeck;
        let points = 0;
        const defenders = new Set<string>();
        for (const player of this.players) {
            if (!this.friends.has(player.sessionId)) {
                defenders.add(player.sessionId);
            }
            for (const c of player.points) {
                points += getPointValue(c);
            }
        }
        if (!this.friends.has(this.currentTurn)) {
            for (const card of this.bottom) {
                points += getPointValue(card) * this.settings.bottomMultiplier;
            }
        }
        let multiplier = 1;
        let winners: string[];
        if (points >= cutoff) {
            winners = [...defenders];
        } else {
            multiplier = this.teamSize - this.friends.size + 1;
            winners = [...this.friends.values()];
        }
        const levelChange = multiplier * (points === 0 ? 3 : Math.abs(Math.floor((points - cutoff) * 2 / cutoff)));
        this.winners = new SetSchema(winners);
        const gameWinners: string[] = [];
        for (const p of winners) {
            if (this.playerFromId(p).incrementRank(levelChange)) {
                gameWinners.push(p);
            }
        }
        return { winners, levelChange, gameWinners, points, bottom: this.bottom };
    }

    private incrementTurn() {
        this.currentTurn = this.players[(this.playerFromId(this.currentTurn).index + 1) % this.settings.numPlayers].sessionId;
    }

    private validateSelection(cards: Card[], playerId = this.currentTurn) {
        const cardCounts = countAsMap(cards);
        const handCounts = countAsMap(this.playerFromId(playerId).hand.toArray());
        for (const [card, count] of cardCounts) {
            if ((handCounts.get(card) ?? 0) < count) return false;
        }
        return true;
    }
}