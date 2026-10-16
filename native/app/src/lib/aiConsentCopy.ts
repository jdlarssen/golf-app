// native/app/src/lib/aiConsentCopy.ts
// #2561 PR B: spørsmålet om AI-tekster og bryteren i «Personvern og konto»,
// speilet fra webbens `messages/no.json → aiConsent`.
//
// En håndkopi av samme grunn som `sideTournamentCopy.ts`: `no.json` er for stor
// til å bundles for ti strenger. `aiConsentCopy.test.ts` krever tegn-for-tegn
// likhet med kilden, så teksten i appen og på nettet kan ikke gli fra hverandre.
export const AI_CONSENT_TEXT = {
  title: 'Kan AI-en skrive om deg?',
  body: 'Etter hvert spill skriver Tørny et kort referat, og i romjula får du Kavalkaden, en oppsummering av golfåret. Tekstene skriver språkmodellen Claude fra Anthropic, et amerikansk selskap. Da får Anthropic navn og kallenavn, resultater, spill- og banenavn og datoer.',
  noMeans:
    'Sier du nei, står du ikke i noen av tekstene. Du kan ombestemme deg når som helst under «Personvern og konto» i appen eller på profilen på nettsiden.',
  yes: 'Ja, det er greit',
  no: 'Nei takk',
  saving: 'Lagrer …',
  saveFailed: 'Fikk ikke lagret svaret. Prøv igjen.',
  toggleTitle: 'AI-tekster om meg',
  toggleSubtitle: 'Rundereferatet og Kavalkaden',
  toggleFailed: 'Fikk ikke lagret. Prøv igjen.',
} as const;
