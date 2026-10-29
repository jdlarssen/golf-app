import { describe, it, expect } from 'vitest';
import { createTranslator } from 'next-intl';
import noMessages from '@/messages/no.json';
import enMessages from '@/messages/en.json';
import { buildNotificationText } from './cardContent';
import { formatKr } from '@/lib/format/formatKr';
import { testPayloads } from './testPayloads';
import type { NotificationKind, NotificationPayload } from './types';
import type { NotificationTranslator } from './cardContent';
import { BODY_MAX, TITLE_MAX } from './push/clampText';

// A fake translator: returns "key" or "key|json(values)" so assertions can check
// which catalog key + interpolation values each kind resolves to, without loading
// the real next-intl catalog. Mirrors the (key, values) call shape both
// useTranslations('inbox') and createTranslator(...namespace:'inbox') expose.
const t = (key: string, values?: Record<string, string | number>) =>
  values ? `${key}|${JSON.stringify(values)}` : key;

const cases: Array<{ kind: NotificationKind; payload: NotificationPayload; title: string }> = [
  {
    kind: 'invite',
    payload: { game_id: 'g', game_name: 'Vinter-cup', invited_by_name: 'Jørgen' } as NotificationPayload,
    title: 'kinds.invite.title|{"invitedByName":"Jørgen"}',
  },
  {
    kind: 'game_finished',
    payload: { game_id: 'g', game_name: 'Sommercup' } as NotificationPayload,
    title: 'kinds.gameFinished.title',
  },
  {
    kind: 'idea_built',
    payload: { submission_id: 's' } as NotificationPayload,
    title: 'kinds.ideaBuilt.title',
  },
];

describe('buildNotificationText', () => {
  it.each(cases)('$kind → resolves the inbox title key', ({ kind, payload, title }) => {
    expect(buildNotificationText(kind, payload, t).title).toBe(title);
  });

  // #2561: the iOS app shows no kroner at launch (owner 13.10), so the APNs
  // text for the entry-fee reminder leaves the amount out. The web text and
  // every other kind are the same with or without the option.
  it('#2561: payment_reminder for the app has no amount; the web text is unchanged', () => {
    const payload = { game_id: 'g', game_name: 'Sommercup', entry_fee_kr: 200 } as NotificationPayload;
    expect(buildNotificationText('payment_reminder', payload, t).detail).toBe(
      `kinds.paymentReminder.detail|${JSON.stringify({ gameName: 'Sommercup', amount: formatKr(200) })}`,
    );
    expect(buildNotificationText('payment_reminder', payload, t, { surface: 'app' })).toEqual({
      title: 'kinds.paymentReminder.title',
      detail: 'kinds.paymentReminder.detailApp|{"gameName":"Sommercup"}',
    });
  });

  // #2632: the start of the round report rides in the payload and shows in the
  // push text; without it the text is what it always was. Web and app agree.
  it('#2632: game_finished with report_start uses the detailWithReport key', () => {
    const payload = {
      game_id: 'g',
      game_name: 'Sommercup',
      report_start: 'Ada tok den på 18.',
    } as NotificationPayload;
    const expected = {
      title: 'kinds.gameFinished.title',
      detail:
        'kinds.gameFinished.detailWithReport|{"gameName":"Sommercup","reportStart":"Ada tok den på 18."}',
    };
    expect(buildNotificationText('game_finished', payload, t)).toEqual(expected);
    expect(buildNotificationText('game_finished', payload, t, { surface: 'app' })).toEqual(expected);
  });

  it('#2632: game_finished without report_start keeps the plain detail', () => {
    const payload = { game_id: 'g', game_name: 'Sommercup' } as NotificationPayload;
    expect(buildNotificationText('game_finished', payload, t).detail).toBe(
      'kinds.gameFinished.detail|{"gameName":"Sommercup"}',
    );
  });

  // Every kind but the entry-fee reminder reads the same for the app. The
  // fixture has one payload per kind, so a new kind is covered by itself.
  it.each(
    (Object.entries(testPayloads) as [NotificationKind, NotificationPayload][]).filter(
      ([kind]) => kind !== 'payment_reminder',
    ),
  )('#2561: %s reads the same for the app', (kind, payload) => {
    expect(buildNotificationText(kind, payload, t, { surface: 'app' })).toEqual(
      buildNotificationText(kind, payload, t),
    );
  });

  it('product_update renders DB content verbatim (no catalog key)', () => {
    const out = buildNotificationText(
      'product_update',
      { source_id: 's', title: 'Nyhet', body: 'Tekst' } as NotificationPayload,
      t,
    );
    expect(out).toEqual({ title: 'Nyhet', detail: 'Tekst' });
  });

  it('#2568: idea_built shows what was built, the stock line for old rows', () => {
    expect(
      buildNotificationText(
        'idea_built',
        { submission_id: 's', summary: 'Ryder Cup-oppsettet er klart' } as NotificationPayload,
        t,
      ),
    ).toEqual({ title: 'kinds.ideaBuilt.title', detail: 'Ryder Cup-oppsettet er klart' });
    expect(
      buildNotificationText('idea_built', { submission_id: 's' } as NotificationPayload, t).detail,
    ).toBe('kinds.ideaBuilt.detail');
  });

  it('scorecard_approved uten navn velger fallback etter rolle (#1598)', () => {
    const detailFor = (payload: Record<string, unknown>) =>
      buildNotificationText(
        'scorecard_approved',
        { game_id: 'g', game_name: 'Vinter-cup', ...payload } as NotificationPayload,
        t,
      ).detail;
    const expected = (approverName: string) =>
      `kinds.scorecardApproved.detail|${JSON.stringify({
        approverName,
        gameName: 'Vinter-cup',
      })}`;

    // En navnløs arrangør er ikke «En spiller» — rollen avgjør fallbacken.
    expect(detailFor({ approver_role: 'organizer' })).toBe(expected('organizerFallback'));
    expect(detailFor({ approver_role: 'peer' })).toBe(expected('somePlayerFallback'));
    // Historisk payload (skrevet før #1598) → nøytral fallback som før.
    expect(detailFor({})).toBe(expected('somePlayerFallback'));
    // Har vi navnet, brukes det uansett rolle.
    expect(detailFor({ approver_name: 'Kari', approver_role: 'organizer' })).toBe(
      expected('Kari'),
    );
  });

  it('scorecard_rejected til den som leverte kortet for en annen, sier hvem kortet tilhører (#2200)', () => {
    const detailFor = (payload: Record<string, unknown>) =>
      buildNotificationText(
        'scorecard_rejected',
        { game_id: 'g', game_name: 'Vinter-cup', rejecter_name: 'Per', reason: 'hull 7', ...payload } as NotificationPayload,
        t,
      ).detail;

    // The card's owner: the plain sentence, as before.
    expect(detailFor({})).toBe(
      `kinds.scorecardRejected.detail|${JSON.stringify({ rejecterName: 'Per', gameName: 'Vinter-cup', reason: 'hull 7' })}`,
    );
    // A deliverer's copy without a readable name still says it was someone
    // else's card, with the locale fallback, never the owner's sentence.
    expect(detailFor({ player_name: null })).toBe(
      `kinds.scorecardRejected.detailFor|${JSON.stringify({
        rejecterName: 'Per',
        playerName: 'somePlayerFallback',
        gameName: 'Vinter-cup',
        reason: 'hull 7',
      })}`,
    );
    // The one who delivered it for Ola: the sentence names Ola's card.
    expect(detailFor({ player_name: 'Ola' })).toBe(
      `kinds.scorecardRejected.detailFor|${JSON.stringify({
        rejecterName: 'Per',
        playerName: 'Ola',
        gameName: 'Vinter-cup',
        reason: 'hull 7',
      })}`,
    );
  });

  it('deliver_reminder for kort føreren har ført for andre, har egen tekst (#2200)', () => {
    const textFor = (payload: Record<string, unknown>) =>
      buildNotificationText(
        'deliver_reminder',
        { game_id: 'g', game_name: 'Vinter-cup', ...payload } as NotificationPayload,
        t,
      );

    expect(textFor({})).toEqual({
      title: 'kinds.deliverReminder.title',
      detail: `kinds.deliverReminder.detail|${JSON.stringify({ gameName: 'Vinter-cup' })}`,
    });
    expect(textFor({ others_count: 2 })).toEqual({
      title: 'kinds.deliverReminder.titleKept',
      detail: `kinds.deliverReminder.detailKept|${JSON.stringify({ gameName: 'Vinter-cup' })}`,
    });
  });

  it('missing_score_reminder gir første hull og antallet hull til (#2268)', () => {
    const textFor = (holes: number[]) =>
      buildNotificationText(
        'missing_score_reminder',
        { game_id: 'g', game_name: 'Vinter-cup', holes } as NotificationPayload,
        t,
      );

    expect(textFor([10])).toEqual({
      title: `kinds.missingScoreReminder.title|${JSON.stringify({ hole: 10, extra: 0 })}`,
      detail: `kinds.missingScoreReminder.detail|${JSON.stringify({ gameName: 'Vinter-cup' })}`,
    });
    expect(textFor([10, 11, 13]).title).toBe(
      `kinds.missingScoreReminder.title|${JSON.stringify({ hole: 10, extra: 2 })}`,
    );
  });

  it('cup_signup velger tittel på retningen, med locale-fallback for navnet (#1490)', () => {
    const titleFor = (payload: Record<string, unknown>) =>
      buildNotificationText(
        'cup_signup',
        {
          tournament_id: 't',
          tournament_name: 'Vinter-cup',
          group_id: null,
          ...payload,
        } as NotificationPayload,
        t,
      ).title;

    expect(titleFor({ action: 'joined', participant_name: 'Kari' })).toBe(
      'kinds.cupSignup.titleJoined|{"participantName":"Kari"}',
    );
    expect(titleFor({ action: 'left', participant_name: 'Kari' })).toBe(
      'kinds.cupSignup.titleLeft|{"participantName":"Kari"}',
    );
    // Navnløs payload → katalogens fallback fylles ved render, ikke ved skriving.
    expect(titleFor({ action: 'joined' })).toBe(
      'kinds.cupSignup.titleJoined|{"participantName":"somePlayerFallback"}',
    );
  });

  it('achievement_unlocked bundles moments with a neutral title (#947)', () => {
    const out = buildNotificationText(
      'achievement_unlocked',
      {
        game_id: 'g',
        game_name: 'Lørdagscup',
        moments: [
          { kind: 'hole_in_one', count: 1 },
          { kind: 'snowman', count: 2 },
        ],
      } as NotificationPayload,
      t,
    );
    expect(out.title).toBe('kinds.achievementUnlocked.title');
    // Single moment → no «×N»; repeated moment → «×N»; joined with «, ».
    expect(out.detail).toBe(
      `kinds.achievementUnlocked.detail|${JSON.stringify({
        moments:
          'kinds.achievementUnlocked.moments.holeInOne, kinds.achievementUnlocked.moments.snowman ×2',
        gameName: 'Lørdagscup',
      })}`,
    );
  });
});

// #2666: a simulator league's opening message names the course and tee; the
// text is read through the real catalog, in both languages.
describe('buildNotificationText — the opening message of a simulator league (#2666)', () => {
  const real = (locale: 'no' | 'en') =>
    createTranslator({
      locale,
      messages: locale === 'no' ? noMessages : enMessages,
      namespace: 'inbox',
      timeZone: 'Europe/Oslo',
    }) as unknown as NotificationTranslator;
  const base = {
    league_id: '00000000-0000-4000-a000-000000000001',
    league_name: 'Vinterligaen',
    round_id: '00000000-0000-4000-a000-000000000002',
    round_label: 'Runde 5',
    closes_at: '2027-01-10T22:59:00.000Z',
  };
  const sim = { ...base, is_simulator: true, course_name: 'St Andrews', tee_name: 'Gul' };

  it('names the course and tee, then the deadline', () => {
    expect(buildNotificationText('league_round_open', sim as NotificationPayload, real('no'))).toEqual({
      title: 'Runde 5 i Vinterligaen er åpen',
      detail:
        'St Andrews, tee Gul. Trykk for å se hva du skal stille inn i Trackman. Fristen er søndag 10. jan. kl. 23:59.',
    });
    expect(buildNotificationText('league_round_open', sim as NotificationPayload, real('en')).detail).toBe(
      'St Andrews, Gul tee. Tap to see what to set in Trackman. The deadline is Sunday, Jan 10 at 23:59.',
    );
  });

  it('keeps the plain text for a regular league, an older row, and a simulator row without a tee', () => {
    const plain = 'Spill den når det passer deg. Fristen er søndag 10. jan. kl. 23:59.';
    for (const payload of [base, { ...base, is_simulator: false }, { ...sim, tee_name: undefined }]) {
      expect(buildNotificationText('league_round_open', payload as NotificationPayload, real('no')).detail).toBe(plain);
    }
  });

  it('the closing reminder keeps its text in a simulator league', () => {
    expect(buildNotificationText('league_round_closing', sim as NotificationPayload, real('no'))).toEqual({
      title: 'Runde 5 i Vinterligaen stenger søndag 10. jan. kl. 23:59',
      detail: 'Du har ikke spilt den ennå.',
    });
  });

  it('title and detail fit the push caps with an ordinary long course name', () => {
    const long = { ...sim, course_name: 'Oslo Golfklubb – Bogstad, den lange banen', league_name: 'Vinterligaen 2026–2027' };
    const text = buildNotificationText('league_round_open', long as NotificationPayload, real('no'));
    expect([text.title.length <= TITLE_MAX, text.detail.length <= BODY_MAX]).toEqual([true, true]);
  });
});

// #2481: the cancellation notice in both languages, through the real catalog.
// The push text: the greeting when there is one, else who cancelled and when.
describe('buildNotificationText — game_cancelled (#2481)', () => {
  const real = (locale: 'no' | 'en') =>
    createTranslator({
      locale,
      messages: locale === 'no' ? noMessages : enMessages,
      namespace: 'inbox',
      timeZone: 'Europe/Oslo',
    }) as unknown as NotificationTranslator;
  const base = {
    game_name: 'Lørdagsrunden',
    tee_off_at: '2026-10-03T07:00:00.000Z',
    organizer_name: 'Jørgen',
  };

  it('with a greeting: the organiser’s own words', () => {
    const payload = { ...base, message: 'Banen er stengt.' } as NotificationPayload;
    expect(buildNotificationText('game_cancelled', payload, real('no'))).toEqual({
      title: 'Lørdagsrunden er avlyst',
      detail: 'Jørgen: «Banen er stengt.»',
    });
    expect(buildNotificationText('game_cancelled', payload, real('en'))).toEqual({
      title: 'Lørdagsrunden has been cancelled',
      detail: 'Jørgen: “Banen er stengt.”',
    });
  });

  it('without a greeting: who cancelled and the round’s day and time in Oslo', () => {
    expect(buildNotificationText('game_cancelled', base as NotificationPayload, real('no')).detail).toBe(
      'Jørgen har avlyst runden lørdag 3. okt. kl. 09:00',
    );
    expect(buildNotificationText('game_cancelled', base as NotificationPayload, real('en')).detail).toBe(
      'Jørgen cancelled the round on Saturday, Oct 3 at 09:00',
    );
  });

  it('without a date or a name', () => {
    const payload = { game_name: 'Lørdagsrunden', tee_off_at: null } as NotificationPayload;
    expect(buildNotificationText('game_cancelled', payload, real('no')).detail).toBe('Arrangøren har avlyst runden');
    expect(buildNotificationText('game_cancelled', payload, real('en')).detail).toBe('The organizer cancelled the round');
  });
});
