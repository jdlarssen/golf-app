# Kontrakt: «Logg inn»-lenke i SyncBanner ved utløpt sesjon (#1371)

Kilde: kontrakt-kommentar på issue #1371 (kontrakt-smeden). Re-verifisert mot
main ved byggestart 2026-08-14: active-varianten hadde kun «Prøv igjen»
(SyncBanner.tsx:274–283); friendlySyncError/errorAuth-mappingen som beskrevet.

## Design (bygget)

- Active-only-varianten: når `hasErrors && friendlySyncError(rawError) === 'errorAuth'`,
  rendres en «Logg inn»-`Link` (fra `@/i18n/navigation`) VED SIDEN AV retry.
- `next` = locale-prefikset gjeldende path (`locale === routing.defaultLocale ?
  pathname : '/'+locale+pathname`) gjennom `encodeURIComponent` — samme kontrakt
  som proxy.ts sin login-redirect.
- Ny nøkkel `SyncBanner.loginAction` (no «Logg inn» / en «Log in»).
- Begge handlingene (lenke + retry) står i samme flex-gruppe med `min-h-[44px]`
  — retry-knappen ble løftet til 44px samtidig så paret står visuelt likt
  (dokumentert avvik: kontrakten nevnte kun lenken; tap-target-regelen gjelder
  begge).

## Success Criteria

- [x] Aktiv kø med auth-klassifisert feil → «Logg inn»-lenke til
  `/login?next=<gjeldende path>`.
  **Evidens:** ny test (RØD før implementasjon: 1 failed | 7 passed) asserter
  `getByRole('link', {name:'Logg inn'})` med `href='/login?next=%2F'`
  (global usePathname-mock gir '/'; locale-prefiks verifiseres på staging).
- [x] Andre feilkategorier → uendret banner uten lenke.
  **Evidens:** `showLogin` gater på `errorKey === 'errorAuth'`; eksisterende
  network-test («kun aktive elementer → kompakt variant») fortsatt grønn.
- [x] Tap-target ≥44px; no + en nøkler på plass.
  **Evidens:** `min-h-[44px]` på begge; catalogParity grønn.
- [x] Eksisterende SyncBanner-oppførsel uendret (quarantine, conflicts,
  queueWaiting). **Evidens:** alle 7 eksisterende tester grønne uendret;
  quarantine-varianten ikke rørt (kontraktens aksepterte hull står).
- [x] Gates: tsc exit 0 · eslint på begge filer exit 0 · vitest 10/10
  (SyncBanner + catalogParity) · `npm run build` exit 0.
- [ ] Staging-verifisering før merge: fremprovoser auth-feil → lenken navigerer
  til login med riktig `next` (inkl. engelsk locale).

## Gates

tsc + lint + vitest + build grønne lokalt. Bruker-synlig → staging-klikkrunde
+ bevis + `staging-verified`-label før merge. Notatfil `.changes/1371-*.md`.

## Commits

- fix(sync): offer a login link when the session has expired
