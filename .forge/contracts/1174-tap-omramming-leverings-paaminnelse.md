# Spec: Mild tap-omramming av leverings-påminnelsen (#1174)

## Problem

Leverings-påminnelsen (#376) er nøytralt rammet: «Du spilte ferdig {gameName}, men har ikke
levert scorekortet ennå. Lever det, så er du med i resultatet.» UX Peak-prinsippet
**tap-aversjon** sier at tap svir dobbelt så mye som en tilsvarende gevinst — en mild, ærlig
tap-ramming («slagene teller ikke hvis du ikke leverer») kan løfte leveringsraten uten mørkt
mønster.

## Research Findings

- Mail-copy: `messages/no.json:4637` `mail.deliverReminder.body` (HTML) + `bodyText` (ren tekst);
  EN-parallell `messages/en.json:4637` («You've finished playing {gameName} but haven't submitted
  your scorecard yet. Submit it to be included in the results.»).
- Snapshot-lås: `lib/mail/deliverReminderNotification.test.ts` — inline-snapshots for `subject` +
  `text` + `bodyLineHtml` på no OG en (5 tester), + ÉN chrome-lås (linje 108-154). Body-endring →
  `npx vitest -u`.
- Innboks: `messages/no.json:120` `inbox.kinds.deliverReminder` — title «Husk å levere scorekortet»,
  detail «Du er ferdig i {gameName}». Rendres via next-intl, INGEN snapshot (ren copy-endring).

## Prior Decisions

- **Eier (denne økten):** JA til mild tap-omramming. Videoens harde variant («I'll risk it»,
  nedtelling, trussel) er FORKASTET — bryter «sporty kompis»-stemmen, grenser til mørkt mønster.
- **#376:** all copy gjennom `humanizer:humanizer`; hold aktiv stemme.

## Design

Reframe `mail.deliverReminder.body` + `bodyText` (no + en) mildt, f.eks. (endelig ordlyd =
Claude's Discretion + humanizer): «Du spilte ferdig {gameName}, men scorekortet er ikke levert —
og da teller ikke slagene dine i resultatet. Det tar et par sekunder å levere.» Behold `subject`,
`heading`, `salutation*`, `submitButton*`, `footer`. **Innboks-konsistens (beslutning: JA, samme
PR):** ram `inbox.kinds.deliverReminder.detail` tilsvarende («Slagene teller ikke før du leverer»
/ EN «Your strokes don't count until you submit»); title beholdes. Ulik ramming mail vs innboks
ville skurre.

## Edge Cases & Guardrails

- Snapshot-refresh er mekanisk: endre kilde → `-u` → **les diffen** (5 snapshots: no+en body +
  chrome). Ikke godta blindt.
- HTML-escaping av `{gameName}` uendret (egen test dekker det — ordlyd rører ikke escaping-stien).

## Key Decisions

- **Kun copy** — ingen ny mail, ingen ny kind, ingen logikk. **INGEN nye tester** (kun snapshot-`-u`).
  Innboks reframes i samme PR.
- **Claude's Discretion:** endelig ordlyd (no + en) for mail + innboks; hvor eksplisitt tap-formen
  skal være (alltid vennlig, aldri truende).

## Success Criteria

- [ ] `mail.deliverReminder.body`+`bodyText` (no+en) bærer mild tap-ramming; ingen trussel-/nedtellings-språk.
- [ ] `inbox.kinds.deliverReminder.detail` (no+en) reframet konsistent.
- [ ] `deliverReminderNotification.test.ts`-snapshots `-u`-refreshet + diff-review'd, alle grønne.
- [ ] catalogParity grønn; humanizer kjørt.

## Gates

- [ ] `npx tsc --noEmit` + `npm run lint` grønn.
- [ ] `npx vitest run lib/mail/deliverReminderNotification.test.ts` grønn etter `-u`.
- [ ] `fix` → PATCH-bump + CHANGELOG Feilrettinger-linje (bruker-synlig copy).

## Files Likely Touched

- `messages/no.json` + `messages/en.json` — `mail.deliverReminder` + `inbox.kinds.deliverReminder`.
- `lib/mail/deliverReminderNotification.test.ts` — snapshot-refresh.
- `package.json` + `CHANGELOG.md`.

## Out of Scope

- Videoens harde «I'll risk it»-variant / nedtelling (forkastet — merkevare).
- Tap-ramming av andre nudges (betaling etc.) — eget issue.
- Ny mail eller logikk i `sendDeliverReminderNotification`.
