// native/app/src/lib/webLink.ts
// Native #1891: ekte knapper der appen før bare sa «det gjør du på nettsiden».
//
// **Hvorfor en lenke og ikke en handling.** Noen ting hører hjemme på webben —
// enten fordi de er service-role-eide (invitasjon, selv-frafall) eller fordi
// grensa er tegnet med vilje (cup-avslutning, opprettelse av bane). Fram til nå
// sto det en setning uten vei videre, og en setning uten knapp er en blindvei.
// Den ene tingen appen KAN gjøre er å åpne riktig side i nettleseren, og si
// ærlig at det venter en kode-innlogging der:
// appen og Safari deler ikke sesjon (OTP-kode, ingen URL å bære et token i).
// Proxyen sender uinnloggede til `/login?next=<sti>`, så dyplenka lander
// riktig etter innloggingen.
//
// **Adressen har ett hjem, og det er her.** `EXPO_PUBLIC_WEB_BASE_URL` leses
// på ETT sted i appen (denne fila), og `data/webApi.ts` bygger rute-URL-ene
// sine med {@link webUrl} i stedet for å gjenta trimmingen og
// skråstrek-vasken. Én regel, ett hjem (AGENTS trap 4): flytter deployen seg,
// eller får basen en trailing slash i et bygg, finnes det bare ett sted å se.
//
// **Lest ved kall, ikke ved import.** Env-varen bakes inn ved bundling, men et
// kast på modulnivå ville tatt ned hele appen for en knapp de fleste aldri
// trykker på. Mangler den, svarer helperne typet, og skjermen viser setningen
// (ærlig-feil-guardrailen fra `supabase.ts`) — aldri en knapp som gjør
// ingenting.
import { Linking } from 'react-native';

/** Hva som kan stoppe en lenke-knapp. Begge ender i en synlig setning. */
export type WebLinkFailure = 'no-web-base-url' | 'open-failed';

export type WebUrlResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'no-web-base-url' };

export type OpenWebResult = { ok: true } | { ok: false; reason: WebLinkFailure };

/**
 * Web-deployens adresse uten etterfølgende skråstreker, eller `null` når
 * bygget mangler den.
 *
 * Trimmingen og `replace(/\/+$/, '')` er hele normaliseringen: en base som står
 * som `https://tornygolf.no/` skal ikke gi `//api/...`, og en tom eller
 * whitespace-only verdi er det samme som ingen verdi.
 */
export function webBaseUrl(): string | null {
  const raw = process.env.EXPO_PUBLIC_WEB_BASE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

/**
 * Full URL til en sti på webben.
 *
 * @param path sti med eller uten ledende skråstrek — begge former finnes i
 *   kallstedene, og en dobbel skråstrek midt i en URL er en annen adresse enn
 *   den vi mente. Skråstreken settes derfor her, ikke av kalleren.
 */
export function webUrl(path: string): WebUrlResult {
  const base = webBaseUrl();
  if (!base) return { ok: false, reason: 'no-web-base-url' };
  const suffix = path.replace(/^\/+/, '');
  return { ok: true, url: suffix ? `${base}/${suffix}` : base };
}

/**
 * Åpne en side på webben i enhetens nettleser.
 *
 * `Linking` er del av react-native — ingen ny modul, og ingen universal links
 * (`associatedDomains` er ikke satt opp i `app.json` og trengs ikke: vi VIL at
 * lenka åpnes i nettleseren, der sesjonen deres finnes).
 *
 * `canOpenURL` spørres bevisst ikke først. Den krever `LSApplicationQueriesSchemes`
 * for egne skjemaer og gir bare en ekstra måte å svare «nei» på for http(s),
 * som iOS alltid kan åpne. Feiler det likevel, kaster `openURL` — og det er
 * den grenen som blir til en setning.
 */
export async function openWeb(path: string): Promise<OpenWebResult> {
  const target = webUrl(path);
  if (!target.ok) return target;

  try {
    await Linking.openURL(target.url);
    return { ok: true };
  } catch (err) {
    console.error('[webLink] openURL feilet', target.url, err);
    return { ok: false, reason: 'open-failed' };
  }
}

/**
 * Tekstene lenke-knappen viser.
 *
 * `missingBaseUrl` er med vilje handlings-nøytral: den samme mangelen stopper
 * både purringen (#1889) og alle lenke-knappene, og kontrakten ba om én delt
 * melding. Slette-flyten har sin egen, mer spesifikke variant i
 * `accountCopy.ts` — den nevner kontoen, og kan ikke gjenbrukes her.
 */
export const WEB_LINK_TEXT = {
  /** Fast undertekst under hver lenke-knapp. Sier hva som skjer FØR trykket. */
  hint: 'Åpner nettsiden i nettleseren. Der logger du inn med kode.',
  missingBaseUrl: 'Appen mangler adressen til serveren. Ta kontakt med administrator.',
  openFailed: 'Fikk ikke åpnet nettsiden.',
} as const;

/** Kode → setning. Uttømmende switch uten `default`: en ny kode faller på tsc. */
export function describeWebLinkFailure(reason: WebLinkFailure): string {
  switch (reason) {
    case 'no-web-base-url':
      return WEB_LINK_TEXT.missingBaseUrl;
    case 'open-failed':
      return WEB_LINK_TEXT.openFailed;
  }
}
