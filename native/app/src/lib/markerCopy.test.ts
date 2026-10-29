// native/app/src/lib/markerCopy.test.ts
// Paritets-porten mellom appens markør-tekster og webbens kilde (#2661).
//
// `markerCopy.ts` er en håndkopi av webbens tekster for markøren i
// `messages/no.json` (appen kan ikke importere kildefila; Metro shaker ikke
// JSON). Testen krever tegn-for-tegn likhet, også for setningene med navn:
// webbens plassholdere fylles inn og sammenlignes med appens funksjoner.
// Samme mønster som `aiConsentCopy.test.ts`.
import source from '../../../../messages/no.json';
import {
  MARKER_TEXT,
  awaitingMarkerLine,
  markerCardHeading,
  markerCardSubtitle,
  organizerNote,
  waitsForLine,
} from './markerCopy';

const picker = source.game.submit.marker;
const page = source.liga.marker;
const queue = source.liga.player.markerQueue;
const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? `{${key}}`);

it.each([
  ['legend', MARKER_TEXT.legend, picker.legend],
  ['hint', MARKER_TEXT.hint, picker.hint],
  ['none', MARKER_TEXT.none, picker.none],
  ['unknownPlayer', MARKER_TEXT.unknownPlayer, picker.unknownPlayer],
  ['searchLabel', MARKER_TEXT.searchLabel, picker.searchLabel],
  ['searchPlaceholder', MARKER_TEXT.searchPlaceholder, picker.searchPlaceholder],
  ['noMatch', MARKER_TEXT.noMatch, picker.noMatch],
  ['showFewer', MARKER_TEXT.showFewer, picker.showFewer],
  ['screenTitle', MARKER_TEXT.screenTitle, page.kicker],
  ['intro', MARKER_TEXT.intro, page.intro],
  ['organizerNoMarker', MARKER_TEXT.organizerNoMarker, page.organizerNoteNoMarker],
  ['approved', MARKER_TEXT.approved, page.state.approved],
  ['rejected', MARKER_TEXT.rejected, page.banners.rejected],
  ['notDelivered', MARKER_TEXT.notDelivered, page.state.not_delivered],
  ['withdrawn', MARKER_TEXT.withdrawn, page.state.withdrawn],
  ['closed', MARKER_TEXT.closed, page.state.closed],
  ['queueHeading', MARKER_TEXT.queueHeading, queue.heading],
  ['organizerQueueHeading', MARKER_TEXT.organizerQueueHeading, queue.organizerHeading],
  ['review', MARKER_TEXT.review, queue.review],
])('«%s» er lik webbens tekst', (_key, app, web) => {
  expect(app).toBe(web);
});

it('setningene med navn er webbens, fylt inn', () => {
  expect(markerCardHeading('Anders')).toBe(fill(page.heading, { name: 'Anders' }));
  expect(markerCardSubtitle('Runde 3', 'Vinterliga')).toBe(
    fill(page.subtitle, { roundLabel: 'Runde 3', leagueName: 'Vinterliga' }),
  );
  expect(organizerNote('Mia')).toBe(fill(page.organizerNote, { markerName: 'Mia' }));
  expect(awaitingMarkerLine('Mia')).toBe(fill(source.liga.player.awaitingMarker, { name: 'Mia' }));
  expect(waitsForLine('Mia')).toBe(fill(queue.waitsFor, { name: 'Mia' }));
});
