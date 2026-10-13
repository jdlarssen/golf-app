// #2228: teksten på feilgrensens skjerm. Den lover ikke at noe er lagret, for
// det kan ikke en feilgrense vite. Finnes bare i appen og har ett hjem her.

export const ERROR_BOUNDARY_TEXT = {
  title: 'Noe gikk galt',
  body: 'Det skjedde en feil på denne skjermen. Prøv igjen, eller gå tilbake.',
  retry: 'Prøv igjen',
} as const;
