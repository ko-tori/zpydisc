export interface GameSettings {
  numDecks: number;
  wraparound: boolean;
  winnersDeclare: boolean;
  rallyScoring: boolean;
  teamSize?: number;
  bottomSize?: number;
  cutoffPerDeck: number;
  dealIntervalMs: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  numDecks: 2,
  wraparound: true,
  winnersDeclare: true,
  rallyScoring: true,
  teamSize: undefined,
  bottomSize: undefined,
  cutoffPerDeck: 40,
  dealIntervalMs: 120,
};

export function computeBottomSize(
  numDecks: number,
  numPlayers: number,
  customBottomSize?: number
): number {
  if (customBottomSize !== undefined) {
    return customBottomSize;
  }
  const totalCards = 54 * numDecks;
  let bottomSize = totalCards % numPlayers;
  const minBottom = Math.max(4, Math.ceil(6 - numPlayers / 2));
  while (bottomSize < minBottom) {
    bottomSize += numPlayers;
  }
  return bottomSize;
}

export function computeTeamSize(numPlayers: number, customTeamSize?: number): number {
  if (customTeamSize !== undefined) {
    return customTeamSize;
  }
  return Math.max(1, Math.floor(numPlayers / 2));
}
