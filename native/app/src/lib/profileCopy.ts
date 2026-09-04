// native/app/src/lib/profileCopy.ts
// Native #1906: tekstene i profil-rommet, og de to formateringene rommet
// trenger for å vise handicapet ditt.
//
// Samme arbeidsdeling som `accountCopy.ts`: skjermen viser tekst, teksten bor
// her, og alt som også finnes på webbens `/profile` er `messages/no.json →
// profile` tegn for tegn. `profileCopy.test.ts` leser den fila og
// sammenligner — rettes en setning på web uten at appen følger etter, blir
// testen rød. Uten den porten ville en spiller fått to ulike ordlyder for
// samme rad, avhengig av flate.
//
// Det som IKKE har en web-fasit er merket som app-egent under: utvikler-
// seksjonen (webben har ingen Sync-lab), advarselen om uleverte slag ved
// utlogging (webben har ingen lokal base å rydde), raden og headeren for
// redigering (webben har ett skjema på samme side, appen har et rom og en
// skjerm) og nett-kodene i {@link describeProfileSaveFailure} (webbens skjema
// kan ikke være offline).
//
// **PROFILE_TEXT er FLAT med vilje.** Skjema-tekstene ligger under sitt eget
// avsnitt i stedet for i et `form`-objekt: testen går gjennom
// `Object.entries(PROFILE_TEXT)` og krever at hver verdi er en ferdig setning,
// og et nøstet objekt ville sluppet unna den porten uten at noen la merke til
// det.
//
// **Hvorfor tallformateringen bor her og ikke i `lib/i18n/format.ts`.**
// Webbens `formatHcpDisplay` går veien om `Intl.NumberFormat` med nb-NO.
// Hermes har ikke ICU-dataene, så den veien er stengt for appen (samme grunn
// som `display.ts` gir for klokkeslett). {@link formatHcpNb} bygger derfor
// strengen selv. Drift mellom de to er den åpenbare faren, og den er lukket i
// TESTEN: den kjører i node, importerer webbens `formatHcpDisplay` og krever
// at hver eneste verdi i tabellen gir samme streng. Importer aldri
// `lib/i18n/format` eller `formatHcpDisplay` i app-kildekode — bare i tester.
import type { ProfileSaveFailure } from '../data/profile';
import { formatShortDateNb } from '../../../../lib/format/date';
import { isHandicapStale } from '../../../../lib/handicap/staleness';

/** Tekstene profil-rommet viser. */
export const PROFILE_TEXT = {
  // --- Webbens ordlyd (messages/no.json → profile) ------------------------
  /** Header-tittelen, og ordet oppe til høyre på Hjem som fører hit. */
  heading: 'Profil',
  /** Overskriften når spilleren verken har navn eller kallenavn. */
  displayNameFallback: 'Profil',
  sectionAccount: 'Konto',
  setHandicap: 'Sett handicap',
  hcpStaleShort: 'Ikke oppdatert på over en måned',
  // Webbens `hcpUpdatedShort` er ICU-strengen «Oppdatert {dato}». Appen har
  // ingen ICU-motor, så plassholderen er klippet av og datoen settes inn av
  // {@link hcpUpdatedLine}. Mellomrommet på slutten er en del av setningen —
  // testen setter delene sammen igjen og sammenligner med webbens streng.
  hcpUpdatedPrefix: 'Oppdatert ',
  logout: 'Logg ut',
  logoutPending: 'Logger ut …',
  deleteRow: 'Slett konto',
  /** Banneret profil-rommet viser når du kommer tilbake fra en lagring. */
  updatedBanner: '✓ Profilen din er oppdatert.',

  // --- Webbens ordlyd: skjemaet (messages/no.json → profile.form) ---------
  // Webben har feltene på samme side som resten av profilen; appen har dem på
  // en egen skjerm. Ordlyden er den samme, og testen låser den — en spiller
  // som fyller ut det samme skjemaet på to flater skal lese det samme.
  nameLabel: 'Navn',
  nicknameLabel: 'Kallenavn',
  nicknamePlaceholder: 'Valgfritt',
  /** Skjermleser-etikett for «+»-chipen (= webbens `aria-label`). */
  plusHandicapLabel: 'Plusshandicap',
  handicapLabel: 'Handicap',
  // Ekkoet under handicap-feltet: «Lagres som +1,5 · plusshandicap». Delene
  // settes sammen av skjermen fordi tallet står mellom dem, og suffikset
  // henger bare på når plusshandicap er huket av — derfor to nøkler, ikke én
  // ICU-streng vi ikke har en motor til.
  savedAsPrefix: 'Lagres som',
  savedAsSuffix: '· plusshandicap',
  // Halen på e-postlinja: «kari@eksempel.no · kan ikke endres». Adressen byttes
  // ikke herfra på noen av flatene.
  emailLine: 'kan ikke endres',
  golfProfileLabel: 'Golfprofil',
  genderLegend: 'Kjønn',
  genderHint: 'Brukes til å foreslå riktig tee og beregne banehandicap.',
  genderMale: 'Herre',
  genderFemale: 'Dame',
  levelLegend: 'Spillerklasse',
  levelHint:
    'Junior gir juniortee. Senior er foreløpig bare et merke og endrer ikke spillet.',
  levelJunior: 'Junior',
  levelAdult: 'Voksen',
  levelSenior: 'Senior',
  saveButton: 'Lagre',
  savePending: 'Lagrer …',
  saveHint: 'Lagre blir aktiv når du endrer noe.',

  // --- App-egent: veien inn i skjemaet ------------------------------------
  // To nøkler for det som i dag er samme ord, av samme grunn som `deleteRow`
  // og `ACCOUNT_TEXT.heading` er to: den ene er raden som fører dit, den andre
  // er tittelen på skjermen du havner på. De kan endres hver for seg.
  editRow: 'Rediger profil',
  editHeading: 'Rediger profil',

  // --- App-egent: utvikler-seksjonen -------------------------------------
  // Finnes bare i staging-bygg (`stagingGate.ts`). Webben har ingen Sync-lab,
  // så det finnes ingen fasit å speile — dette er husets stemme.
  sectionDeveloper: 'Utvikler',
  syncLabRow: 'Sync-lab',
  syncLabSublabel: 'Kø, konflikter og testverktøy. Vises bare i staging.',

  // --- App-egent: advarselen ved utlogging --------------------------------
  // Utlogging tømmer den lokale basen (#1877), og det er nettopp derfor denne
  // finnes: webben logger deg stille ut fordi den ikke har noe lokalt lager å
  // rydde. Appen har det, og slag som ikke har rukket å bli sendt ville
  // forsvunnet uten et ord. Se {@link unsentStrokesWarning}.
  unsentStrokesTitle: 'Slag som ikke er sendt',
  unsentStrokesCancel: 'Avbryt',
  unsentStrokesConfirm: 'Logg ut likevel',

  // --- App-egent: de tre linjene rommet kan måtte vise ---------------------
  // Kortet er den eneste delen som er avhengig av profilraden. Utlogging og
  // sletting spør serveren selv, så feilen holdes inne i kortet i stedet for å
  // bytte ut hele skjermen. Ordlyden er hjems, for det er samme slags svar på
  // samme slags problem.
  loadFailedNote:
    'Fikk ikke tak i profilen din. Sjekk nettet — vi henter den på nytt neste gang du åpner Profil.',
  // Utloggingen kastet. En rad som blir trykkbar igjen uten et ord ville lest
  // som at appen hang.
  logoutFailedNote: 'Fikk ikke logget deg ut. Prøv igjen.',
  // Sesjonen ble stående (`signout-failed`): tokenet var utløpt og appen kom
  // ikke til serveren for å fornye det. Setningen MÅ si at nett er kravet —
  // «prøv igjen» alene forteller ikke hva som skal være annerledes neste gang.
  // Samme lærdom som `accountCopy`s nett-tekster fikk i eier-tapptesten.
  logoutOfflineNote:
    'Du er fortsatt logget inn. Utlogging krever nett når det er en stund siden sist — koble til og prøv igjen.',
} as const;

/**
 * «Oppdatert 12. mai» — webbens `hcpUpdatedShort` med datoen satt inn.
 *
 * @param dateText ferdig formatert dato, f.eks. fra {@link describeHandicapAge}.
 */
export function hcpUpdatedLine(dateText: string): string {
  return `${PROFILE_TEXT.hcpUpdatedPrefix}${dateText}`;
}

/**
 * Advarselen spilleren møter når hen logger ut med slag i køen.
 *
 * Fire ting MÅ stå der, og de står der i denne rekkefølgen: hvor mange slag det
 * gjelder, at de blir liggende på telefonen, at de blir der til hen logger inn
 * igjen — og forbeholdet: med mindre noen andre logger inn før deg.
 * Uten «til du logger inn igjen» leser den første setningen som «du mister
 * dem»; uten forbeholdet lover den mer enn appen holder (#1942).
 *
 * **Setningen lover ikke levering, og det er med vilje.** Et første utkast sa
 * «… og sendes neste gang du logger inn». Det holder ikke alltid: en
 * karantene-rad (#668, gitt opp etter fem permanente feil) hoppes over av hver
 * eneste senere drain og går aldri opp — og `logOut` teller den med i tallet,
 * fordi den for spilleren er et slag som ikke kom fram. Og logger en annen
 * bruker inn på telefonen, tømmer eier-vakten (#1942, `data/localOwner.ts`)
 * radene før første drain — derfor forbeholdet i setningen. «Blir liggende til
 * du logger inn igjen» er sant i de to første tilfellene; «sendes» var det
 * ikke i noen av dem.
 *
 * Entall og flertall skilles på pronomenet («blir det liggende» / «blir de
 * liggende») — selve ordet «slag» er likt i begge tall på norsk, så tallet
 * alene gjør ikke setningen riktig.
 *
 * @param count antall køede slag. Kalleren viser aldri dialogen på 0.
 */
export function unsentStrokesWarning(count: number): string {
  const tail =
    count === 1
      ? 'Logger du ut nå, blir det liggende på telefonen til du logger inn igjen, med mindre noen andre logger inn før deg.'
      : 'Logger du ut nå, blir de liggende på telefonen til du logger inn igjen, med mindre noen andre logger inn før deg.';
  return `${count} slag er ikke sendt ennå. ${tail}`;
}

/**
 * Handicap fra lagret signert verdi til norsk visning: «+1,5» for
 * plusshandicap (lagret negativt), «12,4» ellers, «0,0» for scratch.
 *
 * Alltid én desimal og norsk desimalkomma — samme kontrakt som webbens
 * `formatHcpDisplay(signed, 'no')`, men bygget lokalt fordi Hermes mangler
 * ICU (se fil-kommentaren). Testen låser de to sammen verdi for verdi.
 */
export function formatHcpNb(signed: number): string {
  const magnitude = Math.abs(signed);
  const nb = magnitude.toFixed(1).replace('.', ',');
  // Scratch er bare «0,0» — et plusstegn foran null er ikke et handicap.
  return signed < 0 && magnitude !== 0 ? `+${nb}` : nb;
}

/**
 * Undertittelen på handicap-raden: enten påminnelsen om at det er gammelt,
 * eller når det sist ble satt.
 *
 * Grensa for «gammelt» hentes fra `lib/handicap/staleness.ts` og gjentas
 * ALDRI her — det er webbens regel, og en regel har ett hjem (AGENTS trap 4).
 * Det samme gjelder datoformatet: `formatShortDateNb` er håndskrevet og
 * Intl-fri, så den bundler rett inn i appen.
 *
 * @param updatedAt tidsstempelet fra `users.handicap_updated_at`, eller `null`.
 * @param now injiserbar for tester; produksjonskall lar den stå.
 */
export function describeHandicapAge(
  updatedAt: string | null | undefined,
  now?: Date,
): string {
  if (!updatedAt) return PROFILE_TEXT.hcpStaleShort;
  const updated = new Date(updatedAt);
  // Et ulesbart tidsstempel gir en NaN-differanse, og `isHandicapStale` leser
  // den som «ikke gammelt» — da ville raden stått med «Oppdatert Invalid
  // Date». Vi vet ikke NÅR det ble satt, så vi ber om det på nytt: samme svar
  // som når tidsstempelet mangler helt.
  if (Number.isNaN(updated.getTime())) return PROFILE_TEXT.hcpStaleShort;
  if (isHandicapStale(updated, now)) return PROFILE_TEXT.hcpStaleShort;
  return hcpUpdatedLine(formatShortDateNb(updated));
}

/**
 * Hvorfor lagringen ikke gikk gjennom — koden fra `data/profile.ts` som en
 * setning spilleren kan gjøre noe med.
 *
 * Uttømmende switch uten `default`: legger noen til en kode i
 * {@link ProfileSaveFailure}, faller `tsc` på den manglende returverdien. Det
 * er hele grunnen til at funksjonen finnes i stedet for et oppslagsobjekt.
 *
 * De fire valideringskodene er webbens `profile.errors.*` tegn for tegn, og
 * `update_failed` er webbens `errors.unknown` — samme feil, samme setning,
 * uansett flate. Nett-kodene har ingen fasit: webbens skjema kan ikke være
 * offline.
 */
export function describeProfileSaveFailure(reason: ProfileSaveFailure): string {
  switch (reason) {
    // Profil-lagring legges ALDRI i sync-køen: regelen (recompute av frosne
    // banehandicap) kjøres på serveren. Derfor ikke den delte offline-setningen
    // fra `rosterCopy`, som lover «koble til, så går det gjennom».
    case 'offline':
      return 'Du er uten nett. Koble til, så kan du lagre profilen din.';
    // Env-varen bakes inn ved bundling. Mangler den, er det en feil i bygget,
    // ikke noe spilleren kan rette — men den skal si det høyt i stedet for å
    // la Lagre gjøre ingenting (ærlig-feil-guardrailen).
    case 'no-web-base-url':
      return 'Appen mangler adressen til serveren, så du får ikke lagret profilen herfra. Ta kontakt med administrator.';
    // Begge nett-grenene MÅ si at lagring krever tilkobling. Eier-tapptesten
    // på slette-flyten traff nettopp denne grenen (Wi-Fi av, mobildata på:
    // enheten er «online», men når ikke serveren) og savnet kravet — «prøv
    // igjen» alene forteller ikke hva som skal være annerledes neste gang.
    case 'network':
      return 'Du må være på nett for å lagre profilen. Sjekk tilkoblingen og prøv igjen.';
    // Tokenet kan bare ha gått ut mens skjemaet sto åpent. Ingenting er lagret,
    // og feltene står som de står — derfor «prøv igjen».
    case 'unauthorized':
      return 'Du er ikke logget inn lenger. Logg inn på nytt og prøv igjen.';
    // = profile.errors.name_required
    case 'name_required':
      return 'Du må fylle inn navn.';
    // = profile.errors.hcp_invalid. Setningen peker på plusshandicap-knappen
    // fordi feltet tar en magnitude uten fortegn — uten den siste setningen
    // ville en spiller med +1,5 prøvd å taste minus.
    case 'hcp_invalid':
      return 'Handicap-index må være et tall mellom 0 og 54. Bruk +-knappen for plusshandicap.';
    // = profile.errors.gender_required
    case 'gender_required':
      return 'Velg kjønn.';
    // = profile.errors.level_invalid
    case 'level_invalid':
      return 'Ugyldig spillerklasse.';
    // = profile.errors.unknown. Catch-all for alt ruta ikke navnga, inkludert
    // en 0-rads skriving (AGENTS trap 2) som ruta melder som 500.
    case 'update_failed':
      return 'Noe gikk galt. Prøv igjen.';
  }
}
