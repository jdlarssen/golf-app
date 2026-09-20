/**
 * Prompten og vasken for Kavalkadens innledning (#2128, epic #1040).
 *
 * Samme arbeidsdeling som rundereferatet (#1008): fakta er deterministiske og
 * regnet i ren TS (`buildKavalkadeFacts`), og språkmodellen får ingenting annet
 * å gå på. Den regner aldri selv, og et tall den ikke har fått, kan den ikke
 * finne på.
 *
 * Ren og I/O-fri (Type A, `docs/test-discipline.md`).
 */

import { sanitizeNarrative } from '@/lib/ai/narrative';
import type { KavalkadeFacts } from './buildKavalkadeFacts';

export type KavalkadeNarrativePrompt = {
  system: string;
  user: string;
};

/**
 * Øvre grense for innledningen. 2–4 setninger blir sjelden over 500 tegn; over
 * grensen har modellen misforstått oppgaven, og teksten forkastes heller enn å
 * skyve kortene nedover siden.
 */
export const MAX_KAVALKADE_NARRATIVE_LENGTH = 700;

/**
 * Fakta-objektet slik modellen får se det: uten `userId`.
 *
 * Interne id-er har ingen verdi for en tekst, og de har ingenting å gjøre i et
 * kall ut av huset. Navnene blir igjen — modellen skal kunne nevne rivalen og
 * lagkameraten din ved navn.
 *
 * Stripping skjer rekursivt på nøkkelnavn i stedet for felt for felt: fakta har
 * åtte nøstede typer med `userId` spredt utover, og en håndskrevet kopi av dem
 * ville vært en ny kopi å vedlikeholde hver gang K1 legger til et kort.
 */
export function factsForModel(facts: KavalkadeFacts): unknown {
  return withoutUserIds(facts);
}

function withoutUserIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutUserIds);
  if (value === null || typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'userId') continue;
    out[key] = withoutUserIds(inner);
  }
  return out;
}

export function buildKavalkadeNarrativePrompt(
  facts: KavalkadeFacts,
): KavalkadeNarrativePrompt {
  return {
    system: buildSystemPrompt(facts),
    user: buildUserPrompt(facts),
  };
}

function buildSystemPrompt(facts: KavalkadeFacts): string {
  const lines = [
    'Du skriver åpningen på Tørnys kavalkade, golfårets oppsummering, som spilleren åpner i romjula og blar gjennom kort for kort. Teksten er det første hen leser, før kortene med tallene.',
    'Skriv 2–4 komplette setninger. Ren løpende tekst på norsk bokmål: ingen markdown, ingen overskrifter, ingen punktlister, ingen emoji.',
    'Snakk til spilleren i du-form, i presens eller preteritum, aldri om «brukeren». Nevn aldri spillerens eget navn.',
    'Tone: varm og sporty kompis som har fulgt året på nært hold. Du kan erte litt, men godmodig.',
    'Bruk KUN tall og navn fra fakta-objektet under. Finn ALDRI på runder, hull, navn eller tall som ikke står der, og regn aldri ut noe selv. Er et kort tomt (null), lat som det ikke finnes.',
    'Plukk ut det mest fortellerverdige i året og bygg åpningen rundt det. Ikke ramse opp alle kortene; resten får spilleren se selv.',
    'Ikke avslutt med en generell oppsummering av typen «et år som viser …». Avslutt heller med en konkret detalj eller et vennskapelig stikk.',
    'Varier setningslengden, og la minst én setning være kort.',
    'Ikke bruk tankestrek. Bruk komma, punktum eller parentes i stedet.',
    'Sammensatte ord skrives i ett («årsbeste», ikke «års beste»). Eier subjektet det du omtaler, skriv sin/sitt/sine, ikke hans/hennes.',
    'Ikke bruk vendingen «ikke bare … men også».',
    'Unngå ordene «viste at», «understreker», «markerer», «imponerende», «sentral», «avgjørende», «spennende» og «innsikt». Unngå passiv form og engelske ord.',
  ];

  if (facts.personal === null) {
    lines.push(
      `Spilleren har ${facts.soloRounds} ${facts.soloRounds === 1 ? 'runde' : 'runder'} med egen ball i år og når ikke terskelen på ${facts.roundsNeeded}, så det finnes ingen personlige tall. Skriv om året som helhet og om gjengen, og si det rett ut at året ble kort, uten å beklage det og uten å love noe om neste år.`,
    );
  }

  if (facts.team !== null) {
    lines.push(
      'Kortene under `team` er runder der hele laget delte én ball. De tallene tilhører laget, aldri spilleren alene, så skriv dem som «dere» og ikke som «du».',
    );
  }

  return lines.join(' ');
}

function buildUserPrompt(facts: KavalkadeFacts): string {
  return `Skriv åpningen på golfåret ${facts.year}, basert utelukkende på fakta-objektet under:\n\n${JSON.stringify(factsForModel(facts), null, 2)}`;
}

/**
 * Vasker modellens svar før det lagres. `null` betyr mislykket generering, og
 * kortene vises da uten innledning.
 */
export function sanitizeKavalkadeNarrative(raw: string): string | null {
  return sanitizeNarrative(raw, MAX_KAVALKADE_NARRATIVE_LENGTH);
}
