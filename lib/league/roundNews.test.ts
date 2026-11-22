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
});
const rows = [row('ole', 1, 'Ole H.', 44, 0), row('nei', 2, 'Nina N.', 43, 1), row('phil', 3, 'Philip M.', 36, 8)];
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
  fake.reset();
  consents = [
    { user_id: 'ole', granted: true },
    { user_id: 'phil', granted: true },
    { user_id: 'nei', granted: false },
  ];
  consentError = false;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  messagesCreateMock.mockResolvedValue(answer('Ole H. åpnet med 44 poeng. Runde 2 er åpen nå.'));
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe('generateRoundNews', () => {
  it('the story comes back, written from the facts of the players who said yes, in one attempt', async () => {
    await expect(run()).resolves.toBe('Ole H. åpnet med 44 poeng. Runde 2 er åpen nå.');

    expect(fake.ops.find((op) => op.table === 'ai_consents')!.filters).toEqual([
      { op: 'in', column: 'user_id', value: ['ole', 'nei', 'phil'] },
    ]);
    expect(anthropicConstructorMock).toHaveBeenCalledWith({ apiKey: 'test-key', timeout: 20_000, maxRetries: 0 });
    const call = messagesCreateMock.mock.calls[0]![0];
    expect(call.messages[0].content).toContain('"name": "Ole H."');
    expect(call.messages[0].content).toContain('"name": "Philip M."');
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
    ['a number that is not in the facts', answer('Ole H. åpnet med 45 poeng.')],
    ['a stop before the end', answer('Ole H. åpnet med 44', 'max_tokens')],
    ['an empty answer', answer('   ')],
  ])('the story is dropped: %s', async (_name, response) => {
    messagesCreateMock.mockResolvedValue(response);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(run()).resolves.toBeNull();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('a model call that throws gives no story and does not throw', async () => {
    messagesCreateMock.mockRejectedValue(new Error('timeout'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(run()).resolves.toBeNull();
    err.mockRestore();
  });
});
