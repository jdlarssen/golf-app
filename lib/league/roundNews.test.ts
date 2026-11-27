// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';
import type { RoundSummary } from './roundSummary';

/**
 * Type A (#2979): the one model call behind the round's news story. What the
 * model may see and which answers are dropped is `roundNewsPrompt.test.ts`;
 * here: the gates around the call, and that nothing ever throws.
 */

const messagesCreateMock = vi.fn();
const anthropicConstructorMock = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = { create: messagesCreateMock };
    constructor(opts: unknown) {
      anthropicConstructorMock(opts);
    }
  },
}));

let consents: Array<{ user_id: string; granted: boolean }>;
let consentError = false;
function respond(op: QueryOp): QueryResponse {
  if (op.table === 'ai_consents') return consentError ? { error: { message: 'connection reset' } } : { data: consents };
  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}
const fake = createAdminClientMock({ respond: (op) => respond(op) });

import { generateRoundNews } from './roundNews';

const row = (userId: string, place: number, name: string, value: number, behind: number) => ({
  userId,
  place,
  name,
  value,
  behind,
  previousPlace: null,
  move: null,
});
const rows = [row('dina', 1, 'Dina D.', 44, 0), row('nei', 2, 'Nina N.', 43, 1), row('gard', 3, 'Gard G.', 36, 8)];
const summary: RoundSummary = {
  leagueName: 'Vinterliga 2026-2027',
  roundId: 'r1',
  roundLabel: 'Runde 1',
  courseName: 'Byneset North',
  simulator: true,
  model: 'best_n',
  pointsBased: true,
  roundsPlayed: 1,
  roundsTotal: 10,
  countingRounds: 8,
  playersInLeague: 4,
  playedThisRound: 3,
  round: rows,
  table: rows,
};

const answer = (text: string, stop_reason = 'end_turn') => ({
  stop_reason,
  usage: { input_tokens: 1, output_tokens: 1 },
  content: [{ type: 'text', text }],
});
const run = () =>
  generateRoundNews(fake.client as unknown as Parameters<typeof generateRoundNews>[0], summary, 'Runde 2');

beforeEach(() => {
  vi.clearAllMocks();
  messagesCreateMock.mockReset();
  // Only the clock: the two attempts share one deadline, and a test moves the
  // time a model call «took» by hand.
  vi.useFakeTimers({ toFake: ['Date'] });
  fake.reset();
  consents = [
    { user_id: 'dina', granted: true },
    { user_id: 'gard', granted: true },
    { user_id: 'nei', granted: false },
  ];
  consentError = false;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  messagesCreateMock.mockResolvedValue(answer('Dina D. åpnet med 44 poeng. Runde 2 er åpen nå.'));
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.ANTHROPIC_API_KEY;
});

/** A model call that «takes» `ms` and then answers. */
const after = (ms: number, response: ReturnType<typeof answer>) => async () => {
  vi.setSystemTime(Date.now() + ms);
  return response;
};

describe('generateRoundNews', () => {
  it('the story comes back, written from the facts of the players who said yes, in one attempt', async () => {
    await expect(run()).resolves.toBe('Dina D. åpnet med 44 poeng. Runde 2 er åpen nå.');

    expect(fake.ops.find((op) => op.table === 'ai_consents')!.filters).toEqual([
      { op: 'in', column: 'user_id', value: ['dina', 'nei', 'gard'] },
    ]);
    expect(anthropicConstructorMock).toHaveBeenCalledWith({ apiKey: 'test-key', timeout: 20_000, maxRetries: 0 });
    expect(messagesCreateMock).toHaveBeenCalledTimes(1);
    expect(messagesCreateMock.mock.calls[0]![1]).toEqual({ timeout: 20_000 });
    const call = messagesCreateMock.mock.calls[0]![0];
    expect(call.messages[0].content).toContain('"name": "Dina D."');
    expect(call.messages[0].content).toContain('"name": "Gard G."');
    expect(JSON.stringify(call)).not.toMatch(/Nina/);
  });

  it('no key: no story, and neither the consents nor the model are asked', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(run()).resolves.toBeNull();
    expect(fake.ops).toEqual([]);
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it('nobody said yes, or the consents cannot be read: no story, and the model is not asked', async () => {
    consents = [];
    await expect(run()).resolves.toBeNull();
    consentError = true;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(run()).resolves.toBeNull();
    err.mockRestore();
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a number that is not in the facts',
      answer('Dina D. åpnet med 45 poeng.'),
      'Utkastet inneholdt tall som ikke står i fakta-objektet: 45.',
    ],
    ['a stop before the end', answer('Dina D. åpnet med 44', 'max_tokens'), 'Utkastet ble avbrutt før det var ferdig.'],
    ['an empty answer', answer('   '), 'Utkastet var tomt eller for langt.'],
    [
      'the players «turned up» in a simulator league',
      answer('Dina D. møtte opp og tok 44 poeng.'),
      'Utkastet inneholdt «møtte opp», som er forbudt når simulator er true.',
    ],
  ])('two drafts with the same fault: no story. %s', async (_name, response, fault) => {
    messagesCreateMock.mockResolvedValue(response);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(run()).resolves.toBeNull();
    expect(err).toHaveBeenCalledTimes(2);
    err.mockRestore();

    // One more attempt, told what was wrong with the first, and then it ends.
    expect(messagesCreateMock).toHaveBeenCalledTimes(2);
    expect(messagesCreateMock.mock.calls[1]![0].messages[0].content).toContain(
      `Et tidligere utkast ble forkastet. ${fault}`,
    );
  });

  it('a dropped draft gets one more attempt inside the same 20 seconds, and the second draft goes out', async () => {
    messagesCreateMock
      .mockImplementationOnce(after(7_000, answer('Nederst av de som møtte opp finner vi Gard G. med 36 poeng.')))
      .mockImplementationOnce(after(6_000, answer('Gard G. leverte 36 poeng. Runde 2 er åpen nå.')));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(run()).resolves.toBe('Gard G. leverte 36 poeng. Runde 2 er åpen nå.');
    expect(err).toHaveBeenCalledTimes(1);
    err.mockRestore();

    expect(messagesCreateMock).toHaveBeenCalledTimes(2);
    const [first, second] = messagesCreateMock.mock.calls;
    expect(first![1]).toEqual({ timeout: 20_000 });
    expect(second![1]).toEqual({ timeout: 13_000 });
    // The same task in the same shape: one user message, the same system prompt.
    expect(second![0].system).toBe(first![0].system);
    expect(second![0].messages).toHaveLength(1);
    expect(second![0].messages[0].content).toContain(first![0].messages[0].content);
    expect(second![0].messages[0].content).toContain(
      'Et tidligere utkast ble forkastet. Utkastet inneholdt «møtte opp», som er forbudt når simulator er true.',
    );
  });

  it.each([
    [12_000, 2],
    [12_001, 1],
  ])('a first draft that took %i ms leaves time for %i attempt(s) in all', async (took, attempts) => {
    messagesCreateMock.mockImplementation(after(took, answer('Ti av elleve møtte opp.')));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(run()).resolves.toBeNull();
    err.mockRestore();
    expect(messagesCreateMock).toHaveBeenCalledTimes(attempts);
  });

  it('a model call that throws gives no story, no second attempt, and does not throw', async () => {
    messagesCreateMock.mockRejectedValue(new Error('timeout'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(run()).resolves.toBeNull();
    err.mockRestore();
    expect(messagesCreateMock).toHaveBeenCalledTimes(1);
  });
});
