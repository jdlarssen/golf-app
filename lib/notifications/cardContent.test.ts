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
});
