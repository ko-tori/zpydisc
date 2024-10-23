import { Schema, type } from '@colyseus/schema';
import { DEFAULT_SETTINGS } from "zpy/src/settings";

export class Settings extends Schema {
    @type('number') numDecks: number;
    @type('number') numPlayers: number;
    @type('boolean') wraparound: boolean;
    @type('boolean') winnersDeclare: boolean;
    @type('boolean') rallyScoring: boolean;
    @type('number') teamSize?: number;
    @type('number') bottomSize?: number;
    @type('number') cutoffPerDeck: number;
    @type('number') bottomMultiplier: number;

    constructor(settings: Partial<Settings>) {
        super();
        this.numDecks = DEFAULT_SETTINGS.numDecks;
        this.numPlayers = DEFAULT_SETTINGS.numPlayers;
        this.wraparound = DEFAULT_SETTINGS.wraparound;
        this.winnersDeclare = DEFAULT_SETTINGS.winnersDeclare;
        this.rallyScoring = DEFAULT_SETTINGS.rallyScoring;
        this.teamSize = DEFAULT_SETTINGS.teamSize;
        this.bottomSize = DEFAULT_SETTINGS.bottomSize;
        this.cutoffPerDeck = DEFAULT_SETTINGS.cutoffPerDeck;
        this.bottomMultiplier = DEFAULT_SETTINGS.bottomMultiplier;
        this.updateSettings(settings);
    }

    updateSettings(settings: Partial<Settings>) {
        Object.assign(this, settings);
    }

    checkSettingsForErrors() {
        if (this.numDecks === 0) return 'Must not have 0 decks.';
        if (this.numPlayers < 2) return 'Must have at least 2 players.'
        if (this.bottomSize && (this.numDecks * 54 - this.bottomSize) % this.numPlayers) return 'Invalid bottom size.';
        return '';
    }

    resetSettings() {
        Object.assign(this, DEFAULT_SETTINGS);
    }
}