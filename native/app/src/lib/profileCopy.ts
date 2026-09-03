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
// Det som IKKE har en web-fasit er merket som app-egent under. Det er to ting:
// utvikler-seksjonen (webben har ingen Sync-lab) og advarselen om uleverte
// slag ved utlogging (webben har ingen lokal base å rydde).
//
// **Hvorfor tallformateringen bor her og ikke i `lib/i18n/format.ts`.**
// Webbens `formatHcpDisplay` går veien om `Intl.NumberFormat` med nb-NO.
// Hermes har ikke ICU-dataene, så den veien er stengt for appen (samme grunn
// som `display.ts` gir for klokkeslett). {@link formatHcpNb} bygger derfor
// strengen selv. Drift mellom de to er den åpenbare faren, og den er lukket i
// TESTEN: den kjører i node, importerer webbens `formatHcpDisplay` og krever
// at hver eneste verdi i tabellen gir samme streng. Importer aldri
// `lib/i18n/format` eller `formatHcpDisplay` i app-kildekode — bare i tester.
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
  loadFailedNote: 'Fikk ikke tak i profilen din. Sjekk nettet og prøv igjen.',
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
 * Tre ting MÅ stå der, og de står der i denne rekkefølgen: hvor mange slag det
 * gjelder, at de blir liggende på telefonen, og at de blir der til hen logger
 * inn igjen. Uten den siste setningen leser den første som «du mister dem».
 *
 * **Setningen lover ikke levering, og det er med vilje.** Et første utkast sa
 * «… og sendes neste gang du logger inn». Det holder ikke alltid: en
 * karantene-rad (#668, gitt opp etter fem permanente feil) hoppes over av hver
 * eneste senere drain og går aldri opp — og `logOut` teller den med i tallet,
 * fordi den for spilleren er et slag som ikke kom fram. Logger dessuten en
 * annen bruker inn på telefonen, finnes det ingen eier-vakt som rydder. «Blir
 * liggende til du logger inn igjen» er sant i alle tre tilfellene; «sendes» var
 * det ikke.
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
      ? 'Logger du ut nå, blir det liggende på telefonen til du logger inn igjen.'
      : 'Logger du ut nå, blir de liggende på telefonen til du logger inn igjen.';
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
 * @param updatedAt tidsstempelet fra `users.hcp_updated_at`, eller `null`.
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
