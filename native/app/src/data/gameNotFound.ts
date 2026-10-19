// The game row came back empty: the game is gone, or RLS hides it from this
// player (#1954 Del B). Not a network failure, so the screen must not ask the
// player to check their connection. Its own module so screen tests that mock
// gameBundle can still construct it.
export class GameNotFoundError extends Error {
  constructor(gameId: string) {
    super(`Fant ikke spillet ${gameId}`);
    this.name = 'GameNotFoundError';
  }
}
