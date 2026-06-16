# Forge-kontrakt: #640 — QA-polish fra modus-gjennomgang
Type: bug + enhancement, area:ui, Bump: minor (item 5 = ny kapabilitet). Branch: claude/640-qa-polish-modus.

CONTEXT: Samling småfunn fra visuell QA. Eier valgte (2026-06-16) å utvide lag-påmelding (item 5). Items 1/2/3 fikses; item 6 fikses; item 4 håndteres av hovedchat (SKIP).

ITEM 1 — Banehandicap «—» før start (fix): game-home DIN INFO viser `me.course_handicap ?? '—'`; NULL før auto-start. Fix: når course_handicap er null, beregn CH on-the-fly for visning via lib/scoring/courseHandicap.ts (gjenbruk samme funksjon, IKKE endre formelen) med hcp_index + valgt tee-box + hcp_allowance_pct. Vis beregnet CH før start; etter start vises frossen verdi. Co-located Type A-test: display-helper gir samme CH som start-beregningen. Hvis hcp_index/tee-rating IKKE er tilgjengelig på game-home pre-start, dokumenter det og vis CH der dataene finnes (ikke «—» når data finnes).

ITEM 2 — «Marker som trukket» (fix = MESSAGING, IKKE scoring): AVKLART by-design. supportsWithdrawal (lib/scoring/modes/types.ts:255-293) ekskluderer bevisst pott/scramble/matchplay. IKKE utvid predikatet. Fix = på avslutt-siden, for format uten per-spiller-WD (!supportsWithdrawal) med manglende spillere: legg til en kort forklarende linje (i18n, norsk) f.eks. «Dette formatet teller manglende spillere som «ikke levert» — du kan avslutte runden uansett.» «Avslutt likevel»-stien uendret. Verifiser ingen regresjon for WD-format (boksene vises som før).

ITEM 3 — «4 4 spillere» dobbel-tall (fix): ReadyStep.tsx:107-108 sender count+playerWord til playersUnassigned, men playerWord = «{count} spillere». Fix så summary viser «4 spillere (ikke fordelt)». Rett no.json + en.json.

ITEM 5 — Utvid lag-påmelding til alle lag-format (eier-valgt): I dag begrenset til best ball + Texas. Utvid så Ambrose/Florida/Shamble/Patsome (+ øvrige lag-format) tilbyr lag-påmelding. Bruk eksisterende lag-format-predikat, ikke hardkodet liste. Fjern/erstatt begrensende copy. Validering: lag-påmelding for nye format gir gyldig payload. Co-located/render-test for at toggelen vises for et tidligere-ekskludert lag-format (f.eks. Ambrose). Ingen regresjon for solo-format (skal IKKE få lag-påmelding) eller best ball/Texas.

ITEM 6 — Locale /en for innlogget norsk bruker (fix): resolveLocale faller til Accept-Language når userLocale NULL → engelsk nettleser gir /en for innlogget norsk-profilert bruker. Fix: innloggede med NULL users.locale → default routing.defaultLocale ('no'), IKKE Accept-Language. Anonyme beholder Accept-Language. Juster proxy.ts (ikke send acceptLanguage for innlogget) eller resolver med signedIn-flagg. Unit-test for resolveLocale.

GATES: npx tsc --noEmit; npx vitest run lib/scoring lib/i18n "app/[locale]/admin/games/new".

NON-GOALS: ikke endre courseHandicap.ts-formelen (kun gjenbruk); ikke innføre per-lag-WD for matchplay/lag; ikke endre global default-locale for anonyme; item 4 SKIP.
