import { describe, it, expect } from 'vitest';
import { buildNotificationText } from './cardContent';
import type { NotificationKind, NotificationPayload } from './types';

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

  it('product_update renders DB content verbatim (no catalog key)', () => {
    const out = buildNotificationText(
      'product_update',
      { source_id: 's', title: 'Nyhet', body: 'Tekst' } as NotificationPayload,
      t,
    );
    expect(out).toEqual({ title: 'Nyhet', detail: 'Tekst' });
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
