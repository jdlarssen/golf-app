import { describe, it, expect, beforeEach } from 'vitest';
import {
  WIZARD_DRAFT_TTL_MS,
  clearWizardDraft,
  loadWizardDraft,
  reconcileWizardDraft,
  saveWizardDraft,
  wizardDraftContext,
  wizardDraftStorageKey,
  type WizardDraft,
} from './wizardStatePersistence';
import type { CourseOption, PlayerOption } from './GameForm';

// #1380: utkast-laget bak «veiviseren overlever reload/eviction». Ren logikk
// (Type A): lagring, TTL, korrupt payload, kontekst-skille og best-effort-
// gjenoppretting når bane eller spillere har forsvunnet siden utkastet ble
// skrevet.

const KEY = wizardDraftStorageKey('/admin/games/new');
const CONTEXT = wizardDraftContext({});
const NOW = 1_770_000_000_000;

function makeDraft(overrides: Partial<WizardDraft> = {}): WizardDraft {
  return {
    intent: 'kompis',
    expectedPlayerCount: 4,
    nameTouched: false,
    values: {
      name: 'Lørdagsrunden',
      course_id: 'course-1',
      tee_box_id: 'tee-1',
      scheduled_tee_off_at: '2026-09-05T09:00',
      game_mode: 'stableford',
      team_size: 1,
      players: [{ user_id: 'p1', team_number: null, flight_number: null }],
      player_genders: { p1: 'M' },
    },
    ...overrides,
  };
}

const COURSES: CourseOption[] = [
  {
    id: 'course-1',
    name: 'Stiklestad GK',
    tee_boxes: [
      { id: 'tee-1', name: 'Gul', has_mens: true, has_ladies: true, has_juniors: false },
    ],
  },
];

function player(id: string): PlayerOption {
  return {
    id,
    name: `Spiller ${id}`,
    nickname: null,
    hcp_index: 18,
    email: `${id}@example.com`,
    pending: false,
    gender: null,
    level: 'normal',
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('wizardStatePersistence — lagring og lesing', () => {
  it('lagrer og leser tilbake det samme utkastet', () => {
    const draft = makeDraft();
    saveWizardDraft(KEY, draft, CONTEXT, NOW);

    expect(loadWizardDraft(KEY, CONTEXT, NOW)).toEqual(draft);
  });

  it('gir null når ingenting er lagret', () => {
    expect(loadWizardDraft(KEY, CONTEXT, NOW)).toBeNull();
  });

  it('sletter nøkkelen ved clearWizardDraft', () => {
    saveWizardDraft(KEY, makeDraft(), CONTEXT, NOW);
    clearWizardDraft(KEY);

    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it('leser fortsatt utkastet rett før TTL-en løper ut', () => {
    saveWizardDraft(KEY, makeDraft(), CONTEXT, NOW);

    expect(
      loadWizardDraft(KEY, CONTEXT, NOW + WIZARD_DRAFT_TTL_MS - 1),
    ).not.toBeNull();
  });

  it('forkaster — og rydder bort — utkast eldre enn TTL-en', () => {
    saveWizardDraft(KEY, makeDraft(), CONTEXT, NOW);

    expect(loadWizardDraft(KEY, CONTEXT, NOW + WIZARD_DRAFT_TTL_MS + 1)).toBeNull();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it('forkaster utkast med savedAt i framtida (klokke-tull)', () => {
    saveWizardDraft(KEY, makeDraft(), CONTEXT, NOW + 60_000);

    expect(loadWizardDraft(KEY, CONTEXT, NOW)).toBeNull();
  });
});

describe('wizardStatePersistence — defensiv lesing', () => {
  it.each([
    ['ikke JSON i det hele tatt', '{ dette er ikke json'],
    ['JSON, men ikke et objekt', '"bare en streng"'],
    ['objekt uten draft', JSON.stringify({ v: 1, savedAt: NOW, context: '' })],
    [
      'draft uten values',
      JSON.stringify({ v: 1, savedAt: NOW, context: '', draft: {} }),
    ],
    [
      'ukjent payload-versjon',
      JSON.stringify({ v: 99, savedAt: NOW, context: '', draft: { values: {} } }),
    ],
    [
      'savedAt som ikke er et tall',
      JSON.stringify({ v: 1, savedAt: 'i går', context: '', draft: { values: {} } }),
    ],
  ])('forkaster stille: %s', (_label, raw) => {
    window.sessionStorage.setItem(KEY, raw);

    expect(() => loadWizardDraft(KEY, CONTEXT, NOW)).not.toThrow();
    expect(loadWizardDraft(KEY, CONTEXT, NOW)).toBeNull();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });
});

describe('wizardStatePersistence — mount-kontekst', () => {
  it('gjenoppretter ikke et utkast som ble skrevet i en annen kontekst', () => {
    saveWizardDraft(KEY, makeDraft(), CONTEXT, NOW);
    const cupLinkContext = wizardDraftContext({
      initialValues: {
        tournament_id: 'cup-1',
        game_mode: 'fourball_matchplay',
        lock_game_mode: true,
      },
    });

    expect(loadWizardDraft(KEY, cupLinkContext, NOW)).toBeNull();
  });

  it('skiller cup-lenke, klubb-dyplenke og vanlig besøk fra hverandre', () => {
    const plain = wizardDraftContext({});
    const cupLink = wizardDraftContext({
      initialValues: { tournament_id: 'cup-1', lock_game_mode: true },
    });
    const clubLink = wizardDraftContext({ defaultGroupId: 'klubb-1' });

    expect(new Set([plain, cupLink, clubLink]).size).toBe(3);
  });

  it('gir samme kontekst for to like mounts', () => {
    expect(wizardDraftContext({ initialIntent: 'klubb', defaultGroupId: 'k1' })).toBe(
      wizardDraftContext({ initialIntent: 'klubb', defaultGroupId: 'k1' }),
    );
  });
});

describe('wizardStatePersistence — gjenoppretting er best-effort', () => {
  const players = [player('p1'), player('p2')];

  it('beholder alt når bane og spillere fortsatt finnes', () => {
    const draft = makeDraft();

    expect(reconcileWizardDraft(draft, { courses: COURSES, players })).toEqual(draft);
  });

  it('dropper bane OG tee når banen er slettet siden utkastet ble skrevet', () => {
    const draft = makeDraft({
      values: { ...makeDraft().values, course_id: 'slettet-bane' },
    });

    const out = reconcileWizardDraft(draft, { courses: COURSES, players });

    expect(out.values.course_id).toBe('');
    expect(out.values.tee_box_id).toBe('');
    // Resten av utfyllingen står igjen — vi mister ett felt, ikke alt.
    expect(out.values.name).toBe('Lørdagsrunden');
    expect(out.values.game_mode).toBe('stableford');
  });

  it('dropper tee-en når den ikke hører til banen lenger', () => {
    const draft = makeDraft({
      values: { ...makeDraft().values, tee_box_id: 'tee-fra-en-annen-bane' },
    });

    const out = reconcileWizardDraft(draft, { courses: COURSES, players });

    expect(out.values.course_id).toBe('course-1');
    expect(out.values.tee_box_id).toBe('');
  });

  it('dropper spillere som ikke finnes i rosteren lenger', () => {
    const draft = makeDraft({
      values: {
        ...makeDraft().values,
        players: [
          { user_id: 'p1', team_number: null, flight_number: null },
          { user_id: 'borte', team_number: null, flight_number: null },
        ],
        player_genders: { p1: 'M', borte: 'D' },
      },
    });

    const out = reconcileWizardDraft(draft, { courses: COURSES, players });

    expect(out.values.players).toEqual([
      { user_id: 'p1', team_number: null, flight_number: null },
    ]);
    expect(out.values.player_genders).toEqual({ p1: 'M' });
  });

  it('beholder økt-gjester — de ligger ikke i players-propen', () => {
    const guest = player('gjest-1');
    const draft = makeDraft({
      values: {
        ...makeDraft().values,
        extra_players: [guest],
        players: [{ user_id: 'gjest-1', team_number: null, flight_number: null }],
        player_genders: { 'gjest-1': 'M' },
      },
    });

    const out = reconcileWizardDraft(draft, { courses: COURSES, players });

    expect(out.values.players).toEqual([
      { user_id: 'gjest-1', team_number: null, flight_number: null },
    ]);
    expect(out.values.extra_players).toEqual([guest]);
  });
});
