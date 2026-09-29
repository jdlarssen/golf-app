// #2252: reglene for hvem skinna taster (Type A). Hvilket sete som er neste,
// er den delte `nextRailSeat` og dekket i lib/scorecard/scoreRail.test.ts.
// Det som testes her, er tilstanden rundt: at skinna starter på mitt sete, går
// videre etter et trykk, blir stående når den skal, og regner vår egen
// skriving som ført før SQLite svarer.
import { act, renderHook } from '@testing-library/react-native';
import { useScoreRail, type ScoreRailSeat } from './useScoreRail';

function seat(id: string, over: Partial<ScoreRailSeat> = {}): ScoreRailSeat {
  return { id, score: null, putts: null, locked: false, ...over };
}

type Props = { seats: ScoreRailSeat[]; puttsTracking?: boolean; mySeatId?: string | null };

async function setup(initial: Props) {
  const onSetScore = jest.fn(async () => undefined);
  const onSetPutts = jest.fn(async () => undefined);
  const clearScoreFor = jest.fn(async () => undefined);
  const hook = await renderHook(
    (props: Props) =>
      useScoreRail({
        seats: props.seats,
        mySeatId: props.mySeatId === undefined ? 'me' : props.mySeatId,
        par: 4,
        puttsTracking: props.puttsTracking ?? false,
        onSetScore,
        onSetPutts,
        clearScoreFor,
      }),
    { initialProps: initial },
  );
  return { ...hook, onSetScore, onSetPutts, clearScoreFor };
}

describe('useScoreRail', () => {
  it('has nothing to enter without seats', async () => {
    const { result } = await setup({ seats: [] });
    expect(result.current.activeSeatId).toBeNull();
    expect(result.current.skipToSeatId).toBeNull();
  });

  it('starts on my seat and moves on to the next seat without a score after a pick', async () => {
    const seats = [seat('a'), seat('me'), seat('b', { score: 5 }), seat('c')];
    const { result, onSetScore } = await setup({ seats });
    expect(result.current.activeSeatId).toBe('me');
    expect(result.current.skipToSeatId).toBe('c');

    await act(async () => result.current.pick(4));
    expect(onSetScore).toHaveBeenCalledWith('me', 4);
    // «b» har score alt, så skinna hopper til «c».
    expect(result.current.activeSeatId).toBe('c');
  });

  it('wraps around from the last seat and ends when everyone has a score', async () => {
    const seats = [seat('a'), seat('me', { score: 4 })];
    const { result } = await setup({ seats });
    expect(result.current.activeSeatId).toBe('a');
    // Bare det aktive setet mangler: ingen «Neste».
    expect(result.current.skipToSeatId).toBeNull();

    // Vår egen skriving teller før SQLite har svart: skinna går ikke tilbake.
    await act(async () => result.current.pick(5));
    expect(result.current.activeSeatId).toBeNull();
  });

  it('skips locked seats, and a locked row cannot be picked', async () => {
    const seats = [seat('me'), seat('done', { locked: true }), seat('c')];
    const { result } = await setup({ seats });
    expect(result.current.skipToSeatId).toBe('c');
    await act(async () => result.current.selectRow('done'));
    expect(result.current.activeSeatId).toBe('me');
    await act(async () => result.current.skip());
    expect(result.current.activeSeatId).toBe('c');
  });

  it('follows a score that arrives from a flight-mate, but keeps a row the user chose', async () => {
    const seats = [seat('me'), seat('b'), seat('c')];
    const { result, rerender } = await setup({ seats });
    await rerender({ seats: [seat('me', { score: 4 }), seat('b'), seat('c')] });
    expect(result.current.activeSeatId).toBe('b');

    await act(async () => result.current.selectRow('c'));
    await rerender({ seats: [seat('me', { score: 4 }), seat('b'), seat('c', { score: 6 })] });
    // Valgt rad står, også når den har fått score.
    expect(result.current.activeSeatId).toBe('c');
    expect(result.current.activeScore).toBe(6);
  });

  it('steps from par and stays, and «Angre» clears and stays', async () => {
    const seats = [seat('me'), seat('b')];
    const { result, onSetScore, clearScoreFor } = await setup({ seats });
    await act(async () => result.current.step(1));
    expect(onSetScore).toHaveBeenCalledWith('me', 5);
    expect(result.current.activeSeatId).toBe('me');
    expect(result.current.activeScore).toBe(5);

    await act(async () => result.current.undo());
    expect(clearScoreFor).toHaveBeenCalledWith('me');
    expect(result.current.activeSeatId).toBe('me');
    expect(result.current.activeScore).toBeNull();
  });

  it('with putts on, waits for the putts, moves on after 0–4 and stays on 5+', async () => {
    const seats = [seat('me'), seat('b'), seat('c')];
    const { result, onSetPutts } = await setup({ seats, puttsTracking: true });
    await act(async () => result.current.pick(4));
    expect(result.current.activeSeatId).toBe('me');

    await act(async () => result.current.pickPutts(2));
    expect(onSetPutts).toHaveBeenCalledWith('me', 2);
    expect(result.current.activeSeatId).toBe('b');

    await act(async () => result.current.pick(5));
    await act(async () => result.current.pickPutts(5));
    expect(result.current.activeSeatId).toBe('b');
  });

  it('starts on the first seat when I have none on the hole', async () => {
    const { result } = await setup({ seats: [seat('a'), seat('b')], mySeatId: null });
    expect(result.current.activeSeatId).toBe('a');
  });
});
