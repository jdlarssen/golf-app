import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Systemgrensen er SDK-en. Prompt-bygger og vask kjører ekte, så lykkelig sti
// går gjennom hele røret.
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

import type { KavalkadeFacts } from './buildKavalkadeFacts';
import { generateKavalkadeNarrative } from './generateKavalkadeNarrative';

function makeFacts(overrides: Partial<KavalkadeFacts> = {}): KavalkadeFacts {
  return {
    year: 2026,
    cutoff: '2026-12-23T23:00:00.000Z',
    rounds: 9,
    soloRounds: 9,
    teamRounds: 0,
    roundsNeeded: 3,
    personal: {
      rounds: 9,
      season: null,
      bestRound: {
        gameId: 'g1',
        gameName: 'Lørdagscup',
        courseName: 'Losby',
        brutto: 82,
        playedAt: '2026-06-14T08:00:00.000Z',
      },
      nemesisHole: null,
      rival: null,
      formPeak: { stretch: null, season: null },
    },
    team: null,
    gang: {
      members: 4,
      games: 9,
      topWinner: { userId: 'u2', name: 'Ola', count: 4 },
      mostBirdies: null,
      mostSnowmen: null,
      tightestFinish: null,
    },
    ...overrides,
  };
}

function textResponse(text: string) {
  return { content: [{ type: 'text', text }] };
}

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = 'test-key';
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  errorSpy.mockRestore();
});

describe('generateKavalkadeNarrative', () => {
  it('skriver innledningen og vasker svaret', async () => {
    messagesCreateMock.mockResolvedValue(textResponse('```\nÅret ditt ble langt.\n```'));

    await expect(generateKavalkadeNarrative(makeFacts())).resolves.toBe(
      'Året ditt ble langt.',
    );
    expect(messagesCreateMock).toHaveBeenCalledTimes(1);
  });

  it('sender fakta, men aldri id-er', async () => {
    messagesCreateMock.mockResolvedValue(textResponse('Et fint år.'));

    await generateKavalkadeNarrative(makeFacts());

    const call = messagesCreateMock.mock.calls[0][0];
    expect(call.model).toBe('claude-sonnet-5');
    expect(call.messages[0].content).toContain('Lørdagscup');
    expect(call.messages[0].content).not.toContain('userId');
    expect(call.messages[0].content).not.toContain('gameId');
  });

  // #1008-porten: uten nøkkel bygges ikke engang klienten.
  it('gjør ingenting uten API-nøkkel', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    await expect(generateKavalkadeNarrative(makeFacts())).resolves.toBeNull();
    expect(anthropicConstructorMock).not.toHaveBeenCalled();
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it('bruker ikke et modellkall på et år uten runder', async () => {
    await expect(
      generateKavalkadeNarrative(
        makeFacts({ rounds: 0, soloRounds: 0, personal: null, gang: null }),
      ),
    ).resolves.toBeNull();
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it('svarer null når vasken forkaster svaret', async () => {
    messagesCreateMock.mockResolvedValue(textResponse('a'.repeat(1000)));

    await expect(generateKavalkadeNarrative(makeFacts())).resolves.toBeNull();
  });

  it('kaster aldri når modellen feiler', async () => {
    messagesCreateMock.mockRejectedValue(new Error('timeout'));

    await expect(generateKavalkadeNarrative(makeFacts())).resolves.toBeNull();
  });
});
