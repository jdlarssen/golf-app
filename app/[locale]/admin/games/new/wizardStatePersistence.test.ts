import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  WIZARD_DRAFT_KEY_PREFIX,
  WIZARD_DRAFT_TTL_MS,
  clearAllWizardDrafts,
  clearWizardDraft,
  listWizardDrafts,
  loadWizardDraft,
  reconcileWizardDraft,
  saveWizardDraft,
  wizardDraftContext,
  wizardDraftStorageKey,
  withUrlCourse,
  type WizardDraft,
  type WizardDraftResume,
} from './wizardStatePersistence';
import type { CourseOption, PlayerOption } from './GameForm';

// #1380: utkast-laget bak «veiviseren overlever reload/eviction». Ren logikk
// (Type A): lagring, TTL, korrupt payload, kontekst-skille og best-effort-
// gjenoppretting når bane eller spillere har forsvunnet siden utkastet ble
// skrevet.

const KEY = wizardDraftStorageKey('user-a', '/admin/games/new');
const CONTEXT = wizardDraftContext({});
const NOW = 1_770_000_000_000;

function makeDraft(overrides: Partial<WizardDraft> = {}): WizardDraft {
  return {
    intent: 'kompis',
    expectedPlayerCount: 4,
    nameTouched: false,
    inviteEmails: [],
    values: {
      name: 'Lørdagsrunden',
      course_id: 'course-1',
      tee_box_id: 'tee-1',
      scheduled_tee_off_at: '2026-09-05T09:00',
      // #1400: synlighets-valget er controlled state og speiles i utkastet —
      // et «Skjul til slutt» skal ikke forsvinne ved reload heller.
      score_visibility: 'reveal',
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
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('wizardStatePersistence — lagring og lesing', () => {
  it('lagrer og leser tilbake det samme utkastet', () => {
    const draft = makeDraft();
    saveWizardDraft(KEY, draft, CONTEXT, NOW);

    expect(loadWizardDraft(KEY, CONTEXT, NOW)).toEqual(draft);
  });

  it('#2321: e-postadressene overlever lagring og lesing; ugyldig eller manglende verdi blir []', () => {
    const draft = makeDraft({ inviteEmails: ['a@example.com', 'b@example.com'] });
    saveWizardDraft(KEY, draft, CONTEXT, NOW);
    expect(loadWizardDraft(KEY, CONTEXT, NOW)?.inviteEmails).toEqual(['a@example.com', 'b@example.com']);

    for (const bad of [undefined, 'a@example.com', [1, 2], null]) {
      const stored = JSON.parse(window.localStorage.getItem(KEY)!);
      stored.draft.inviteEmails = bad;
      if (bad === undefined) delete stored.draft.inviteEmails;
      window.localStorage.setItem(KEY, JSON.stringify(stored));
      expect(loadWizardDraft(KEY, CONTEXT, NOW)?.inviteEmails).toEqual([]);
    }
  });

  it('gir null når ingenting er lagret', () => {
    expect(loadWizardDraft(KEY, CONTEXT, NOW)).toBeNull();
  });

  it('sletter nøkkelen ved clearWizardDraft', () => {
    saveWizardDraft(KEY, makeDraft(), CONTEXT, NOW);
    clearWizardDraft(KEY);

    expect(window.localStorage.getItem(KEY)).toBeNull();
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
    expect(window.localStorage.getItem(KEY)).toBeNull();
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
    ['objekt uten draft', JSON.stringify({ v: 2, savedAt: NOW, context: '' })],
    [
      'draft uten values',
      JSON.stringify({ v: 2, savedAt: NOW, context: '', draft: {} }),
    ],
    [
      'ukjent payload-versjon',
      JSON.stringify({ v: 99, savedAt: NOW, context: '', draft: { values: {} } }),
    ],
    [
      'savedAt som ikke er et tall',
      JSON.stringify({ v: 2, savedAt: 'i går', context: '', draft: { values: {} } }),
    ],
  ])('forkaster stille: %s', (_label, raw) => {
    window.localStorage.setItem(KEY, raw);

    expect(() => loadWizardDraft(KEY, CONTEXT, NOW)).not.toThrow();
    expect(loadWizardDraft(KEY, CONTEXT, NOW)).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
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

  // #2331: «Bruk dette oppsettet» on the guides mounts with the Kompis intent
  // and the setup's format. An old draft from a blank visit must not be laid
  // over it, so the two contexts differ.
  it('skiller guidenes oppsett-forvalg fra et vanlig besøk', () => {
    const plain = wizardDraftContext({});
    const preset = wizardDraftContext({
      initialIntent: 'kompis',
      initialValues: { game_mode: 'texas_scramble' },
    });

    expect(preset).not.toBe(plain);
    saveWizardDraft(KEY, makeDraft(), plain, NOW);
    expect(loadWizardDraft(KEY, preset, NOW)).toBeNull();
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

describe('withUrlCourse (#2485)', () => {
  const TWO: CourseOption[] = [
    ...COURSES,
    {
      id: 'course-2',
      name: 'Byneset Golfklubb',
      tee_boxes: [
        { id: 'tee-2a', name: 'Gul', has_mens: true, has_ladies: false, has_juniors: false },
        { id: 'tee-2b', name: 'Rød', has_mens: true, has_ladies: false, has_juniors: false },
      ],
    },
    {
      id: 'course-3',
      name: 'Byneset North',
      tee_boxes: [{ id: 'tee-3', name: 'Hvit', has_mens: true, has_ladies: false, has_juniors: false }],
    },
  ];
  const draft = makeDraft();

  it('leaves the draft alone without a URL course, or with its own course', () => {
    expect(withUrlCourse(draft, null, TWO)).toBe(draft);
    expect(withUrlCourse(draft, draft.values.course_id ?? '', TWO)).toBe(draft);
  });

  it('puts the URL course over the draft and empties the tee, the rest stands', () => {
    const out = withUrlCourse(draft, 'course-2', TWO);
    expect(out.values.course_id).toBe('course-2');
    expect(out.values.tee_box_id).toBe('');
    expect(out.values.game_mode).toBe(draft.values.game_mode);
    expect(out.values.players).toEqual(draft.values.players);
  });

  it('takes the only tee of a one-tee course, as choosing it by hand does', () => {
    expect(withUrlCourse(draft, 'course-3', TWO).values.tee_box_id).toBe('tee-3');
  });

  it('ignores a course the wizard does not list', () => {
    expect(withUrlCourse(draft, 'gone', TWO)).toBe(draft);
  });
});

// #2459: utkastet bor i localStorage, per bruker og flate, i 7 døgn, og bærer
// lenken «Fortsett» åpner. Type A: ren lagrings- og listelogikk.

const DAY_MS = 24 * 60 * 60 * 1000;

function makeResume(overrides: Partial<WizardDraftResume['summary']> = {}): WizardDraftResume {
  return {
    href: '/opprett-spill?intent=kompis&step=4',
    summary: {
      step: 4,
      formatLabel: 'Stableford',
      courseName: 'Stiklestad GK',
      selectedCount: 3,
      expectedCount: 4,
      title: null,
      ...overrides,
    },
  };
}

describe('wizardStatePersistence — #2459 nøkkel og levetid', () => {
  it('lager nøkkelen per bruker og flate, uten locale-prefiks', () => {
    expect(wizardDraftStorageKey('u1', '/opprett-spill')).toBe(
      `${WIZARD_DRAFT_KEY_PREFIX}u1:/opprett-spill`,
    );
    expect(wizardDraftStorageKey('u1', '/en/opprett-spill')).toBe(
      wizardDraftStorageKey('u1', '/opprett-spill'),
    );
    expect(wizardDraftStorageKey('u1', '/opprett-spill')).not.toBe(
      wizardDraftStorageKey('u2', '/opprett-spill'),
    );
    expect(wizardDraftStorageKey('u1', '/opprett-spill')).not.toBe(
      wizardDraftStorageKey('u1', '/admin/games/new'),
    );
  });

  it('leser et seks døgn gammelt utkast, men forkaster og rydder et åtte døgn gammelt', () => {
    saveWizardDraft(KEY, makeDraft(), CONTEXT, NOW, makeResume());

    expect(loadWizardDraft(KEY, CONTEXT, NOW + 6 * DAY_MS)).not.toBeNull();
    expect(loadWizardDraft(KEY, CONTEXT, NOW + 8 * DAY_MS)).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('skriver til localStorage, ikke sessionStorage', () => {
    saveWizardDraft(KEY, makeDraft(), CONTEXT, NOW, makeResume());

    expect(window.localStorage.getItem(KEY)).not.toBeNull();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it('forkaster en v1-payload stille', () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ v: 1, savedAt: NOW, context: CONTEXT, draft: makeDraft() }),
    );

    expect(loadWizardDraft(KEY, CONTEXT, NOW)).toBeNull();
  });
});

describe('wizardStatePersistence — #2459 returverdien fra saveWizardDraft', () => {
  it('gir true når lagringen gikk', () => {
    expect(saveWizardDraft(KEY, makeDraft(), CONTEXT, NOW, makeResume())).toBe(true);
  });

  it('gir false når setItem kaster (full kvote, privat modus)', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    try {
      expect(saveWizardDraft(KEY, makeDraft(), CONTEXT, NOW, makeResume())).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('wizardStatePersistence — #2459 listWizardDrafts', () => {
  const OTHER_KEY = wizardDraftStorageKey('user-a', '/opprett-spill');

  it('lister brukerens utkast, nyeste først, med resume', () => {
    saveWizardDraft(KEY, makeDraft(), CONTEXT, NOW, makeResume({ step: 2 }));
    saveWizardDraft(OTHER_KEY, makeDraft(), CONTEXT, NOW + 1000, makeResume({ step: 5 }));

    const out = listWizardDrafts('user-a', NOW + 2000);

    expect(out.map((d) => d.key)).toEqual([OTHER_KEY, KEY]);
    expect(out[0].resume.summary.step).toBe(5);
    expect(out[1].resume.href).toBe('/opprett-spill?intent=kompis&step=4');
  });

  it('viser aldri en annen brukers utkast', () => {
    saveWizardDraft(
      wizardDraftStorageKey('user-b', '/opprett-spill'),
      makeDraft(),
      CONTEXT,
      NOW,
      makeResume(),
    );

    expect(listWizardDrafts('user-a', NOW)).toEqual([]);
  });

  it('hopper over utkast uten resume, og rydder korrupte og utgåtte', () => {
    saveWizardDraft(KEY, makeDraft(), CONTEXT, NOW); // ingen resume
    const old = wizardDraftStorageKey('user-a', '/gammel');
    saveWizardDraft(old, makeDraft(), CONTEXT, NOW, makeResume());
    const broken = wizardDraftStorageKey('user-a', '/ødelagt');
    window.localStorage.setItem(broken, '{ ikke json');

    expect(listWizardDrafts('user-a', NOW + 8 * DAY_MS)).toEqual([]);
    expect(window.localStorage.getItem(old)).toBeNull();
    expect(window.localStorage.getItem(broken)).toBeNull();
  });

  it('forkaster en resume med ugyldig steg, eller en lenke som ikke er en lokal sti', () => {
    for (const mutate of [
      (r: { href: string; summary: { step: number } }) => {
        r.summary.step = 9;
      },
      (r: { href: string; summary: { step: number } }) => {
        r.href = 'https://example.com';
      },
      (r: { href: string; summary: { step: number } }) => {
        r.href = '//evil.example/x';
      },
      (r: { href: string; summary: { step: number } }) => {
        r.href = '/\\evil.example';
      },
    ]) {
      saveWizardDraft(KEY, makeDraft(), CONTEXT, NOW, makeResume());
      const stored = JSON.parse(window.localStorage.getItem(KEY)!);
      mutate(stored.resume);
      window.localStorage.setItem(KEY, JSON.stringify(stored));
      expect(listWizardDrafts('user-a', NOW)).toEqual([]);
    }
  });
});

describe('wizardStatePersistence — #2459 clearAllWizardDrafts', () => {
  it('fjerner alle utkast-nøkler for alle brukere, men ikke andre nøkler', () => {
    saveWizardDraft(KEY, makeDraft(), CONTEXT, NOW, makeResume());
    saveWizardDraft(
      wizardDraftStorageKey('user-b', '/opprett-spill'),
      makeDraft(),
      CONTEXT,
      NOW,
      makeResume(),
    );
    window.localStorage.setItem('noe-annet', 'x');

    clearAllWizardDrafts();

    expect(window.localStorage.length).toBe(1);
    expect(window.localStorage.getItem('noe-annet')).toBe('x');
  });
});
