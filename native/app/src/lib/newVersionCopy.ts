// native/app/src/lib/newVersionCopy.ts
// Native #2975: tekstene for «ny versjon er klar»: arket, raden på Profil og
// skjermleserens ord for prikken på profil-pillen. Ordene «Oppdater» og
// «Senere» er eierens (2026-11-22). Appen har ingen engelsk katalog ennå, så
// teksten står bare her.
export const NEW_VERSION_TEXT = {
  /** `{name}` er «1.2.0 (15)», eller bare «15» uten versjon (`releaseName`). */
  title: 'Versjon {name} er klar',
  update: 'Oppdater',
  later: 'Senere',
  profileRow: 'Oppdater appen',
  /** Legges til pillens skjermleser-etikett mens prikken står. */
  dotA11y: 'Ny versjon av appen er klar',
} as const;

/** «Versjon 1.2.0 (15) er klar». */
export function newVersionTitle(name: string): string {
  return NEW_VERSION_TEXT.title.replace('{name}', name);
}
