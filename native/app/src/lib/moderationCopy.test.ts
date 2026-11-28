// #3019: tekstene som settes sammen av navn, tall og datoer.
import {
  blockConfirmMessage,
  blockedCountLabel,
  blockedOnLabel,
  firstNameOf,
  reportPersonLabel,
  MODERATION_TEXT,
} from './moderationCopy';
import { isFinishedSentence } from '../test/copy';

describe('moderationCopy', () => {
  it.each([
    ['Kari Nordmann', 'Kari'],
    ['  Ola  ', 'Ola'],
    ['', ''],
  ])('fornavnet av %j er %j', (name, first) => {
    expect(firstNameOf(name)).toBe(first);
  });

  it.each([
    [0, 'Ingen'],
    [1, '1 person'],
    [2, '2 personer'],
  ])('%i blokkerte → %s', (n, label) => {
    expect(blockedCountLabel(n)).toBe(label);
  });

  it.each([
    ['2026-11-28T10:00:00Z', 'Blokkert 28. november'],
    // Oslo-dato, ikke UTC: 23.30 UTC 31.12 er 1. januar i Norge.
    ['2026-12-31T23:30:00Z', 'Blokkert 1. januar'],
  ])('%s → %s', (iso, label) => {
    expect(blockedOnLabel(iso)).toBe(label);
  });

  it('setningene med navn bruker fornavnet der tegningen gjør det', () => {
    expect(reportPersonLabel('Kari Nordmann')).toBe('Rapporter Kari');
    expect(blockConfirmMessage('Kari Nordmann')).toBe(
      'Da er dere ikke venner lenger, og Kari kan ikke legge deg til i runder eller cuper. Kari får ikke beskjed.',
    );
  });

  it.each(Object.entries(MODERATION_TEXT))('«%s» er en ferdig tekst', (_key, text) => {
    expect(isFinishedSentence(text)).toBe(true);
  });
});
