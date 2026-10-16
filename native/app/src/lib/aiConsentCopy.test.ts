// native/app/src/lib/aiConsentCopy.test.ts
// Paritets-porten mellom appens AI-samtykke-tekster og webbens kilde (#2561).
//
// `aiConsentCopy.ts` er en håndkopi av navnerommet `aiConsent` i
// `messages/no.json` (appen kan ikke importere kildefila; Metro shaker ikke
// JSON). Testen leser `no.json` fra node-siden og krever tegn-for-tegn likhet,
// i begge retninger: en streng endret på web, en nøkkel som forsvant, eller en
// nøkkel appen har alene, gjør den rød. Samme mønster som
// `sideTournamentCopy.test.ts`.
import source from '../../../../messages/no.json';
import { AI_CONSENT_TEXT } from './aiConsentCopy';

const web: Record<string, string> = source.aiConsent;

it('har nøyaktig de samme nøklene som webbens aiConsent', () => {
  expect(Object.keys(AI_CONSENT_TEXT).sort()).toEqual(Object.keys(web).sort());
});

it.each(Object.keys(web))('«%s» er lik webbens tekst', (key) => {
  expect(AI_CONSENT_TEXT[key as keyof typeof AI_CONSENT_TEXT]).toBe(web[key]);
});
