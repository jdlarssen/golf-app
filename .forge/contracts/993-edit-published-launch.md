# Forge-kontrakt: Rediger en publisert lansering (admin) — #993

**Branch:** `claude/recursing-lehmann-fbfe1b`
**Issue:** [#993](https://github.com/jdlarssen/golf-app/issues/993)
**Type:** enhancement · area: admin / lanseringer · størrelse: low-to-medium

## Problem

`/admin/lanseringer` lar admin **publisere** en lansering (`product_updates`-rad + fan-out av `product_update`-varsel til alle brukere), men det finnes ingen måte å **rette** en allerede publisert lansering på. Da `/foreslaa_ide` (feil understrek) ble publisert 2026-06-30, fikk alle som trykket CTA-en 404, og rettingen krevde manuell SQL mot to steder: `product_updates.link` + 17 `notifications.payload.link`-rader (matchet på `payload.source_id`).

## Designbeslutninger (avklart)

- **Stille retting** (bekreftet med eier): redigeringen oppdaterer eksisterende varsler in-place; `read_at` nullstilles **ikke**. Allerede avviste brukere får ikke banneret opp igjen — den rettede teksten vises bare der lanseringen fortsatt er synlig (ulest banner + innboks).
- **Alle kopier** (bekreftet med eier): alle `notifications`-rader matchet på `payload.source_id` oppdateres — også lest/arkivert — så en rettet lenke er riktig overalt den fortsatt kan åpnes.
- **Atomisk** (egen teknisk beslutning): én `product_updates`-UPDATE + N `notifications`-UPDATE i samme transaksjon via en `SECURITY INVOKER`-RPC, kun kjørbar av `service_role`. Unngår delvis-skrevet tilstand (AGENTS.md trap #5) og holder propageringslogikken på ett sted (trap #4).
- **Egen rute** (egen teknisk beslutning): `/admin/lanseringer/[id]/rediger` gjenbruker publiser-skjemaets felter forhåndsutfylt. «Rediger»-inngang per element i den eksisterende `PreviousUpdatesList`. (Én dør per rom.)
- **Felles validering** (egen teknisk beslutning): trekk ut tittel/brødtekst/lenke/cta-reglene fra publiser-action til én delt validator, brukt av både publiser og rediger (trap #4 — én regel, ett hjem).

## Suksesskriterier

- [ ] **SK1 — Inngang:** Hvert element i «Tidligere lanseringer» (`PreviousUpdatesList`) har en «Rediger»-lenke til `/admin/lanseringer/[id]/rediger`.
- [ ] **SK2 — Forhåndsutfylt skjema:** Rediger-siden viser tittel/brødtekst/lenke/cta_label forhåndsutfylt med lanseringens nåværende verdier. Ukjent `id` → `notFound()` (404, ikke rå 500).
- [ ] **SK3 — Oppdaterer kilden:** Lagring oppdaterer `product_updates`-raden (title/body/link/cta_label) — nøyaktig 1 rad påvirket (assert, ikke 0-row-success; AGENTS.md trap #2).
- [ ] **SK4 — Propagerer til alle varsler:** Lagring oppdaterer **alle** `notifications`-rader der `payload->>'source_id' = id` (kind=`product_update`): title/body settes, link/cta_label **fjernes fra payload når tomme** (speiler publiser sin omit-when-empty), `source_id`/`read_at`/`archived_at` bevares.
- [ ] **SK5 — Atomisk + stille:** Begge oppdateringer skjer i én transaksjon (RPC); `read_at` nullstilles aldri.
- [ ] **SK6 — Authz:** Kun site-admin (`is_admin`) når rediger-siden og kjører rediger-action (gjenbruker `requireAdmin`). RPC-en er ikke kjørbar av `authenticated`/`anon` (kun `service_role`), så en fiendtlig direkte PATCH/RPC kan ikke redigere lanseringer (trap #3).
- [ ] **SK7 — Validering:** Samme regler som publiser (tittel+brødtekst påkrevd, lenke må starte med «/», cta krever lenke) via delt validator — ingen duplisert regel.
- [ ] **SK8 — i18n:** Alle nye bruker-strenger i `messages/no.json` + `messages/en.json` under `admin.launches` (ingen hardkodet norsk i komponentkode).
- [ ] **SK9 — Tester:** Logikk-test for `editProductUpdate` (RPC-kall-form + affected-assert), action-test (auth-gate + validering + happy path). Eksisterende suite forblir grønn.
- [ ] **SK10 — Migrasjon verifisert:** `0124_edit_product_update.sql` påført staging via Supabase MCP og verifisert (RPC finnes, oppdaterer begge tabeller, ikke kjørbar av authenticated). Prod påføres etter merge (0107-mønsteret).

## Filer som berøres

| Fil | Endring |
|---|---|
| `supabase/migrations/0124_edit_product_update.sql` | NY — `edit_product_update(p_id,p_title,p_body,p_link,p_cta_label)` RPC (atomisk dual-write), grants |
| `lib/productUpdates/edit.ts` | NY — `editProductUpdate()` via admin-client `.rpc()`, affected-assert |
| `lib/productUpdates/validateUpdateInput.ts` | NY — delt validator (felt-regler), brukt av publiser + rediger |
| `app/[locale]/admin/lanseringer/actions.ts` | `editProductUpdateAction` + bruk delt validator i `publishProductUpdateAction` |
| `app/[locale]/admin/lanseringer/[id]/rediger/page.tsx` | NY — forhåndsutfylt rediger-skjema |
| `app/[locale]/admin/lanseringer/page.tsx` | «Rediger»-lenke per element i `PreviousUpdatesList` |
| `lib/database.types.ts` | Legg til `edit_product_update` i `Functions` (reproduseres av gen:types mot prod etter deploy) |
| `messages/no.json` + `messages/en.json` | Nye `admin.launches`-nøkler |
| `lib/productUpdates/edit.test.ts` + `app/[locale]/admin/lanseringer/actions.test.ts` | Tester |

## Gates

- `npx tsc --noEmit` — grønt
- `npx eslint <endrede filer>` — grønt
- `npx vitest run lib/productUpdates/ app/[locale]/admin/lanseringer/` — grønt
- `npm run build` — grønt (ny rute kompilerer, ingen uttømmende-switch-brudd)
- Staging: migrasjon påført + RPC verifisert; klikk-runde av rediger-flyten (rediger en testlansering → bekreft `product_updates` + `notifications.payload` oppdatert, `read_at` urørt)

## Ikke i scope

- Ønskeliste-epic #979 (idé-tavle) — bygges ikke her; kun rediger-evnen.
- Re-notifisering / re-surfacing (eier valgte stille retting).
- Sletting av lanseringer (eget evt. issue).
