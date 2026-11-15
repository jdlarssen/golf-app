import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect, type ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fake, resetServer, server, writeGirAs } from '@/tests/sideClaimsServer';

// #2283 (part D3) — Type B/C: the GIR row and sheet in a cup. Each ball is a
// toggle, a tap saves only that ball, «Ingen traff greenen» sets every ball to
// missed, and a foursomes side is one line. The card runs through the real
// `useSideClaims` against a fake server (`tests/sideClaimsServer.ts`); the
// server is the truth (the owner's choice B, 15.11): a tap holds while its
// save runs, and until a read that started after the save has answered, per
// ball.
vi.mock('./sideClaimActions', () => ({
  recordSideClaim: (...args: Parameters<typeof fake.recordSideClaim>) => fake.recordSideClaim(...args),
  recordGirClaims: (...args: Parameters<typeof fake.recordGirClaims>) => fake.recordGirClaims(...args),
}));
vi.mock('@/lib/games/sideClaims', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/games/sideClaims')>()),
  readHoleClaims: (...args: Parameters<typeof fake.readHoleClaims>) => fake.readHoleClaims(...args),
}));
vi.mock('@/lib/supabase/client', () => ({ getBrowserClient: () => ({ fake: 'browser-client' }) }));

import { GirContestEntry } from './GirContestEntry';
import { useSideClaims } from './useSideClaims';

const ball = (id: string, label: string, initials: string) => ({ key: id, userIds: [id], label, faces: [{ initials }] });
const FOURBALL = [
  ball('me', 'Deg', 'JB'),
  ball('marte', 'Marte Lie', 'ML'),
  ball('tore', 'Tore Lunde', 'TL'),
  ball('kari', 'Kari Nilsen', 'KN'),
];
const SIDES = [
  { key: 'side-1', userIds: ['me', 'marte'], label: 'Deg og Marte', faces: [{ initials: 'JB' }, { initials: 'ML' }] },
  { key: 'side-2', userIds: ['tore', 'kari'], label: 'Tore og Kari', faces: [{ initials: 'TL' }, { initials: 'KN' }] },
];
const NAMES: Record<string, string> = { marte: 'Marte', tore: 'Tore', kari: 'Kari' };

type HarnessProps = Partial<Pick<ComponentProps<typeof GirContestEntry>, 'balls' | 'oneBallPerSide' | 'online' | 'par'>>;

/** The poll: the same read as the interval in `useSideClaims`. */
const harness: { poll: () => Promise<void> } = { poll: async () => undefined };

function Harness({ balls = FOURBALL, oneBallPerSide = false, online = true, par = 4 }: HarnessProps) {
  const claims = useSideClaims('game-1', 5, { side: false, gir: true }, null);
  useEffect(() => {
    harness.poll = claims.refresh;
  });
  return (
    <GirContestEntry
      gameId="game-1"
      holeNumber={5}
      par={par}
      contest={{ category: 'gir', source: 'cup', points: 1.5, maxPerTeam: 2 }}
      balls={balls}
      oneBallPerSide={oneBallPerSide}
      meId="me"
      claims={claims.gir}
      failed={claims.failed}
      online={online}
      savedByName={(id) => NAMES[id] ?? null}
      refresh={claims.refresh}
      snapshotSeq={claims.snapshotSeq}
      startedSeq={claims.startedSeq}
    />
  );
}

const ID = 'side-contest-gir';
const subtitle = () => screen.getByTestId(`${ID}-subtitle`);
const status = () => screen.getByTestId(`${ID}-sheet-status`);
const pressed = (key: string) => screen.getByTestId(`${ID}-line-${key}`).getAttribute('aria-pressed');
const hits = () => fake.recordGirClaims.mock.calls.map(([w]) => w.hit);
/** A click, and the microtasks it starts (the save goes out one tick later, then the read after it). */
const click = async (testId: string) => {
  await act(async () => {
    fireEvent.click(screen.getByTestId(testId));
  });
};

async function renderLoaded(props: HarnessProps = {}) {
  const view = render(<Harness {...props} />);
  await waitFor(() => expect(fake.readHoleClaims).toHaveBeenCalled());
  await act(async () => undefined);
  return view;
}

beforeEach(() => {
  resetServer();
});

describe('GirContestEntry', () => {
  it('two taps save two hits, each ball on its own, and «Ingen traff greenen» sets every ball to missed', async () => {
    await renderLoaded();
    expect(subtitle()).toHaveTextContent('+1,5 p per GIR');

    await click(ID);
    expect(screen.getByText('Sidepoeng · hull 5 · +1,5 p per GIR')).toBeInTheDocument();
    expect(screen.getByText('Hvem var på greenen på to slag? Trykk på alle som traff.')).toBeInTheDocument();
    // The lines are toggles: several can be on.
    expect(screen.getByTestId(`${ID}-line-marte`)).toHaveAttribute('aria-pressed', 'false');

    await click(`${ID}-line-marte`);
    await click(`${ID}-line-tore`);
    expect(fake.recordGirClaims).toHaveBeenNthCalledWith(1, {
      gameId: 'game-1',
      holeNumber: 5,
      userIds: ['marte'],
      hit: true,
    });
    expect(fake.recordGirClaims).toHaveBeenNthCalledWith(2, {
      gameId: 'game-1',
      holeNumber: 5,
      userIds: ['tore'],
      hit: true,
    });
    expect(pressed('marte')).toBe('true');
    expect(pressed('tore')).toBe('true');
    expect(pressed('kari')).toBe('false');
    expect(subtitle()).toHaveTextContent('2 av 4 traff');
    expect(status()).toHaveTextContent('Lagret av deg. Hvert lag får poeng for høyst 2.');

    await click(`${ID}-line-none`);
    expect(fake.recordGirClaims).toHaveBeenLastCalledWith({
      gameId: 'game-1',
      holeNumber: 5,
      userIds: ['me', 'marte', 'tore', 'kari'],
      hit: false,
    });
    expect(pressed('none')).toBe('true');
    expect(subtitle()).toHaveTextContent('Ingen traff greenen');

    // A new tap on a ball that missed sets it to hit again, and another takes it off.
    await click(`${ID}-line-me`);
    expect(fake.recordGirClaims).toHaveBeenLastCalledWith(expect.objectContaining({ userIds: ['me'], hit: true }));
    await click(`${ID}-line-me`);
    expect(fake.recordGirClaims).toHaveBeenLastCalledWith(expect.objectContaining({ userIds: ['me'], hit: false }));

    // «Ferdig» only closes.
    const saves = fake.recordGirClaims.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Ferdig' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fake.recordGirClaims.mock.calls.length).toBe(saves);
  });

  it('«Ingen traff greenen» does nothing when every ball already shows as missed', async () => {
    writeGirAs('kari', { holeNumber: 5, userIds: ['me', 'marte', 'tore', 'kari'], hit: false });
    await renderLoaded();
    expect(subtitle()).toHaveTextContent('Ingen traff greenen');
    await click(ID);
    await click(`${ID}-line-none`);
    expect(fake.recordGirClaims).not.toHaveBeenCalled();
  });

  it('the question follows par', async () => {
    const { unmount } = await renderLoaded({ par: 3 });
    await click(ID);
    expect(screen.getByText('Hvem var på greenen etter utslaget? Trykk på alle som traff.')).toBeInTheDocument();
    unmount();
    resetServer();
    await renderLoaded({ par: 5 });
    await click(ID);
    expect(screen.getByText('Hvem var på greenen på tre slag? Trykk på alle som traff.')).toBeInTheDocument();
  });

  it('reads what the match has reported, and who saved last', async () => {
    writeGirAs('kari', { holeNumber: 5, userIds: ['marte'], hit: true });
    writeGirAs('kari', { holeNumber: 5, userIds: ['kari'], hit: false });
    writeGirAs('tore', { holeNumber: 5, userIds: ['tore'], hit: true });
    await renderLoaded();
    expect(subtitle()).toHaveTextContent('2 av 4 traff');
    await click(ID);
    expect(status()).toHaveTextContent('Lagret av Tore. Hvert lag får poeng for høyst 2.');
    expect(pressed('none')).toBe('false');
  });

  it('the ball snaps back when the save fails, and the error is an alert', async () => {
    server.holdWrites = true;
    await renderLoaded();
    await click(ID);
    await click(`${ID}-line-kari`);
    expect(pressed('kari')).toBe('true');
    await act(async () => server.heldWrites[0].release({ ok: false, error: 'db_error' }));
    expect(pressed('kari')).toBe('false');
    expect(screen.getByRole('alert')).toHaveTextContent('Fikk ikke lagret. Sjekk nettet og prøv igjen.');
  });

  it('a save that rejects (the network is gone) snaps the ball back, and the next tap goes through', async () => {
    await renderLoaded();
    await click(ID);
    server.rejectWrites = 1;
    await click(`${ID}-line-kari`);
    expect(pressed('kari')).toBe('false');
    expect(screen.getByRole('alert')).toHaveTextContent('Fikk ikke lagret. Sjekk nettet og prøv igjen.');
    await click(`${ID}-line-marte`);
    expect(pressed('marte')).toBe('true');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('foursomes: one line per side with two faces, and a tap sends both on the side', async () => {
    await renderLoaded({ balls: SIDES, oneBallPerSide: true });
    await click(ID);
    const section = screen.getByRole('region', { name: /Hvem var på greenen/ });
    expect(within(section).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'JBMLDeg og Marte',
      'TLKNTore og Kari',
      'Ingen traff greenen',
    ]);
    expect(status()).toHaveTextContent('Svaret deles med kampen. Laget spiller én ball, så det teller én gang.');
    await click(`${ID}-line-side-2`);
    expect(fake.recordGirClaims).toHaveBeenCalledWith({
      gameId: 'game-1',
      holeNumber: 5,
      userIds: ['tore', 'kari'],
      hit: true,
    });
    expect(subtitle()).toHaveTextContent('1 av 2 traff');
  });

  it('quick taps (G1): off and on again stands until the last save is done', async () => {
    server.holdWrites = true;
    await renderLoaded();
    await click(ID);
    await click(`${ID}-line-marte`);
    await click(`${ID}-line-marte`);
    expect(pressed('marte')).toBe('false');
    // The first save lands, and the read after it shows Marte as hit.
    await act(async () => server.heldWrites[0].release());
    expect(pressed('marte')).toBe('false');
    await act(async () => server.heldWrites[1].release());
    expect(pressed('marte')).toBe('false');
    expect(hits()).toEqual([true, false]);
  });

  it('a flight-mate’s correction stands when you save another ball (G2)', async () => {
    await renderLoaded();
    await click(ID);
    await click(`${ID}-line-marte`);
    expect(pressed('marte')).toBe('true');
    // Tore corrects Marte to missed, and the poll fetches it.
    writeGirAs('tore', { holeNumber: 5, userIds: ['marte'], hit: false });
    await act(() => harness.poll());
    expect(pressed('marte')).toBe('false');
    // You tick Tore. While that save runs, Marte stands as missed: the old tap on her does not count again.
    server.holdWrites = true;
    await click(`${ID}-line-tore`);
    expect(pressed('marte')).toBe('false');
    expect(subtitle()).toHaveTextContent('1 av 4 traff');
    await act(async () => server.heldWrites[0].release());
    expect(pressed('marte')).toBe('false');
  });

  it('an error in the middle of the queue does not take a later tap on the same ball (G3)', async () => {
    server.holdWrites = true;
    await renderLoaded();
    await click(ID);
    // On, off, on again. The first save fails.
    for (let i = 0; i < 3; i++) await click(`${ID}-line-marte`);
    await act(async () => server.heldWrites[0].release({ ok: false, error: 'db_error' }));
    expect(pressed('marte')).toBe('true');
    await act(async () => server.heldWrites[1].release());
    await act(async () => server.heldWrites[2].release());
    expect(hits()).toEqual([true, false, true]);
    expect(pressed('marte')).toBe('true');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a read that fails right after the save: the tap stands until a newer snapshot, then the server shows', async () => {
    await renderLoaded();
    await click(ID);
    server.failReads = 1;
    await click(`${ID}-line-marte`);
    // Saved, but the read after it failed: the screen still shows the tap, not the old snapshot.
    expect(server.gir.map((r) => [r.userId, r.hit])).toEqual([['marte', true]]);
    expect(pressed('marte')).toBe('true');
    expect(subtitle()).toHaveTextContent('1 av 4 traff');
    // The next poll answers with the server's rows, and the tap gives way to them.
    writeGirAs('tore', { holeNumber: 5, userIds: ['marte'], hit: false });
    await act(() => harness.poll());
    expect(pressed('marte')).toBe('false');
    expect(status()).toHaveTextContent('Lagret av Tore. Hvert lag får poeng for høyst 2.');
  });

  it('a flight-mate writes the same ball between your save and the read (G7): their answer stands', async () => {
    server.holdWrites = true;
    await renderLoaded();
    await click(ID);
    await click(`${ID}-line-marte`);
    await act(async () => {
      server.heldWrites[0].release();
      writeGirAs('tore', { holeNumber: 5, userIds: ['marte'], hit: false });
    });
    expect(pressed('marte')).toBe('false');
    expect(status()).toHaveTextContent('Lagret av Tore. Hvert lag får poeng for høyst 2.');
    await act(() => harness.poll());
    expect(pressed('marte')).toBe('false');
  });

  it('offline the lines are locked, and the notice is a status', async () => {
    const view = await renderLoaded();
    await click(ID);
    view.rerender(<Harness online={false} />);
    const line = screen.getByTestId(`${ID}-line-marte`);
    expect(line).toBeDisabled();
    fireEvent.click(line);
    expect(fake.recordGirClaims).not.toHaveBeenCalled();
    expect(screen.getByTestId(`${ID}-sheet-notice`)).toHaveAttribute('role', 'status');
    fireEvent.click(screen.getByRole('button', { name: 'Lukk' }));
    expect(subtitle()).toHaveTextContent('Uten nett. Meld inn senere.');
    expect(screen.getByTestId(ID)).toBeDisabled();
  });

  it('when no read has succeeded, the row says so and cannot be opened', async () => {
    server.failReads = 1;
    await renderLoaded();
    expect(subtitle()).toHaveTextContent('Fikk ikke hentet. Prøver igjen.');
    expect(screen.getByTestId(ID)).toBeDisabled();
  });
});
