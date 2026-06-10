# Message catalogs

One JSON file per locale, registered in `i18n/routing.ts`. `no.json` is the
source of truth; other locales fall back to it per key (merged in
`i18n/request.ts` — a missing key renders the Norwegian string, never the raw
key).

## Namespacing

Top-level key = feature area, matching the app's main surfaces:

`auth`, `wizard`, `leaderboard`, `holes`, `admin`, `klubb`, `liga`, `cup`,
`profile`, `friends`, `signup`, `formats`, `legal`, `common`

- `common` is for genuinely shared strings (app name, generic buttons like
  "Avbryt"/"Lagre", error toasts). Don't dump area-specific strings there.
- Key names are English, camelCase, named for MEANING not position:
  `auth.codeSentTo`, not `auth.paragraph2`.
- ICU syntax for plurals/interpolation:
  `"holesLeft": "{count, plural, one {# hull igjen} other {# hull igjen}}"`.

## Adding a locale

1. Append the code to `locales` in `i18n/routing.ts`.
2. Create `messages/<code>.json` (can start near-empty — fallback covers it).

Nothing else. If a third step is ever needed, that's a regression against the
N-locale criterion in epic #60.
