// native/app/src/lib/accountCopy.ts
// Native #1876: tekstene konto-slettingen viser, og oversettelsen fra kode til
// setning.
//
// Samme arbeidsdeling som `rosterCopy.ts` og `endGameCopy.ts`: datalaget svarer
// med koder, skjermen viser tekst, og oversettelsen bor ett sted. Ingen
// `default`-gren i noen av switch-ene — legger noen til en kode i en av
// unionene, faller `tsc` på den manglende returverdien. Det er hele grunnen til
// at fila finnes.
//
// **To kart, ikke ett.** Den samme årsaken heter to forskjellige ting avhengig
// av NÅR brukeren møter den, og webben har derfor to sett tekster:
//
//   før innsending (GET sier «blokkert»)  → `adminBanner` / `blockedBanner`
//   etter innsending (POST svarer 403)    → `errors.admin_account` /
//                                           `errors.active_games`
//
// Banneret forklarer hvorfor knappen ikke finnes; feilmeldingen forklarer
// hvorfor et forsøk ble avvist. De er ulike setninger for `active_engagements`,
// og tilfeldigvis like for `admin_account` — men de er to nøkler på web og kan
// drifte fra hverandre når som helst. Derfor slås de ikke sammen her, og derfor
// har `describeDeleteBlock` og `describeDeleteFailure` hver sin switch.
//
// **Ordforrådet er webbens der webben har et.** Alt som også står på
// `/profile/slett-konto` er `messages/no.json → profile.deleteAccount` tegn for
// tegn. `accountCopy.test.ts` leser den fila og sammenligner: rettes en setning
// på web uten at appen følger etter, blir testen rød. Uten den porten ville en
// spiller fått to ulike forklaringer på samme regel, avhengig av flate.
// Resten (nett, utløpt sesjon, manglende server-adresse) er app-egne koder uten
// fasit, skrevet i husets stemme.

/**
 * Hvorfor kontoen ikke kan slettes, slik GET-en svarer.
 *
 * Speiler `DeleteBlockReason` i `lib/users/deleteAccount.ts` — den fila starter
 * med `import 'server-only'` og kan aldri nå appen, så vokabularet gjentas her.
 * Selve REGELEN gjentas ikke: appen spør serveren og viser svaret, den avgjør
 * ingenting selv (ett regel-hjem, AGENTS trap 4).
 */
export type DeleteBlockReason = 'admin_account' | 'active_engagements';

/**
 * Alt som kan gå galt i slette-flyten, både på status-sjekken og på selve
 * slettingen.
 *
 * De fire midterste er `error`-verdiene ruta svarer med (`app/api/account/
 * delete/route.ts`) og beholder derfor wire-stavemåten. De tre appegne bruker
 * app-konvensjonen med bindestrek. Blandingen er med vilje: en kode som kom fra
 * nettverket skal se ut som det den kom som, så ingen leter etter en oversettelse
 * som ikke finnes.
 *
 * Datalaget (`data/account.ts`) importerer denne — koden har ett hjem, og det
 * er her, sammen med setningen den betyr.
 */
export type AccountDeleteFailure =
  | 'offline'
  | 'no-web-base-url'
  | 'network'
  | 'unauthorized'
  | 'admin_account'
  | 'active_engagements'
  | 'status_failed'
  | 'delete_failed';

/**
 * Banneret FØR innsending: hvorfor slette-knappen ikke står der.
 *
 * Webbens `page.tsx` viser banner + vei tilbake og ingen knapp i denne
 * tilstanden. Appen gjør det samme.
 */
export function describeDeleteBlock(reason: DeleteBlockReason): string {
  switch (reason) {
    // = profile.deleteAccount.adminBanner
    case 'admin_account':
      return 'Admin-kontoen kan ikke slettes herfra.';
    // = profile.deleteAccount.blockedBanner. Merk «snart starter» her mot
    // «ikke har startet ennå» i feilmeldingen — to nøkler, to setninger.
    case 'active_engagements':
      return 'Du er med i eller arrangerer noe som pågår eller snart starter. Avslutt det først, eller ta kontakt med administrator for hjelp.';
  }
}

/**
 * Feilen ETTER et forsøk: hvorfor det ikke gikk gjennom.
 *
 * @param reason koden fra `data/account.ts`.
 */
export function describeDeleteFailure(reason: AccountDeleteFailure): string {
  switch (reason) {
    // Ikke den delte offline-setningen fra rosterCopy: den lover «koble til, så
    // går det gjennom», som er sant for en score i sync-køen og feil her.
    // Sletting legges aldri i kø — den skjer på serveren, eller ikke i det hele
    // tatt.
    case 'offline':
      return 'Du er uten nett. Koble til, så kan du slette kontoen herfra.';
    // Env-varen bakes inn ved bundling. Mangler den, er det en feil i bygget,
    // ikke noe spilleren kan rette — men den skal si det høyt i stedet for å
    // la knappen gjøre ingenting (ærlig-feil-guardrailen).
    case 'no-web-base-url':
      return 'Appen mangler adressen til serveren, så du får ikke slettet kontoen herfra. Ta kontakt med administrator.';
    // Begge nett-tekstene MÅ si at sletting krever tilkobling. Eier-tapptesten
    // traff nettopp denne grenen (Wi-Fi av, mobildata på: enheten er «online»,
    // men når ikke serveren) og savnet kravet. «Prøv igjen» alene forteller ikke
    // hva som skal være annerledes neste gang.
    case 'network':
      return 'Du må være på nett for å slette kontoen. Sjekk tilkoblingen og prøv igjen.';
    // Tokenet kan bare ha gått ut. Derfor «prøv igjen» og ingen lokal wipe:
    // var kontoen faktisk slettet, stopper innloggingen av seg selv.
    case 'unauthorized':
      return 'Du er ikke logget inn lenger. Logg inn på nytt og prøv igjen.';
    // = profile.deleteAccount.errors.admin_account
    case 'admin_account':
      return 'Admin-kontoen kan ikke slettes herfra.';
    // = profile.deleteAccount.errors.active_games. Ruta sender helperens egen
    // kode (`active_engagements`); webbens copy-nøkkel heter noe annet. Kartet
    // står her, ikke i datalaget.
    case 'active_engagements':
      return 'Du er med i eller arrangerer noe som pågår eller ikke har startet ennå. Kontoen kan ikke slettes før det er avsluttet. Ta kontakt med administrator.';
    case 'status_failed':
      return 'Fikk ikke sjekket om kontoen kan slettes. Prøv igjen.';
    // = profile.deleteAccount.errors.delete_failed
    case 'delete_failed':
      return 'Noe gikk galt ved sletting. Prøv igjen, eller ta kontakt med administrator.';
  }
}

/**
 * Navnet i bekreft-setningen når vi ikke har noe bedre.
 *
 * Webbens kjede er `name?.trim() || email || 'kontoen din'` — literalen er del
 * av copy-kontrakten, ikke en tilfeldig fallback.
 */
export const DISPLAY_NAME_FALLBACK = 'kontoen din';

/** Tekstene skjermene viser. Samlet her, ikke strødd i JSX-en. */
export const ACCOUNT_TEXT = {
  // Konto-skjermen (app-egen — webben har ingen tilsvarende flate).
  accountHeading: 'Konto',
  signedInAs: 'Innlogget som',
  signOut: 'Logg ut',
  deleteEntry: 'Slett konto',

  // Slette-skjermen. Alt fra og med `deletedHeading` er webbens ordlyd.
  heading: 'Slett konto',
  // Webben skriver «Tilbake til profil» fordi lenka går til /profile. I appen
  // går veien tilbake til Konto-skjermen, som stack-headeren alt navngir — så
  // her er det korte ordet det ærlige.
  backLabel: 'Tilbake',
  deletedHeading: 'Dette vil bli slettet',
  deletedBullets: [
    'Brukerprofilen din (navn, kallenavn, handicap)',
    'E-postadressen din frigis og kan ikke brukes til å logge inn igjen',
    'Vennskap, klubbmedlemskap, varsler og åpne invitasjoner',
  ],
  keptHeading: 'Dette beholdes',
  keptBullet:
    'Resultatene fra fullførte runder. De blir stående i turneringen, men med «Slettet bruker» i stedet for navnet ditt',
  // Webbens `confirmParagraph` er én streng med `<strong>{displayName}</strong>`
  // midt i, rendret med `t.rich`. React Native har ingen HTML, så setningen er
  // delt i to og navnet settes inn som en egen fet <Text> mellom dem:
  //   <Text>{confirmLead}<Text style={bold}>{navn}</Text>{confirmTrail}</Text>
  // Ordlyden er uendret; testen setter delene sammen igjen og sammenligner med
  // webbens streng tegn for tegn.
  confirmLead: 'Du er i ferd med å slette ',
  confirmTrail: ' permanent. Handlingen kan ikke angres.',
  deleteButton: 'Slett kontoen min for alltid',
  deletePending: 'Sletter …',
  cancelButton: 'Avbryt',
} as const;
