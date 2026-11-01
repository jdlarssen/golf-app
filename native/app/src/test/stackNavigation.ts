// #2746: en falsk stakk for skjermtestene.
//
// `backTo` og `openOrReturn` (`lib/backTo.ts`) leser stakken og kaller
// `popTo`, `replace`, `reset` eller `navigate`. En skjermtest gir stakken
// skjermen står øverst i, og sjekker hvilket av kallene som kom.

export type StackRoute = { name: string; params?: object };

export function stackNavigation(routes: StackRoute[]) {
  return {
    getState: () => ({ index: routes.length - 1, routes }),
    popTo: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    reset: jest.fn(),
  };
}
