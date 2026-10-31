# Sky-økter — jobbe med Tørny fra hvilken som helst maskin

Claude Code kan kjøre Tørny i skyen (claude.ai/code eller Claude-appen på PC/mobil) i stedet
for på Macen. Da er det ingenting å installere på maskinen du sitter ved.

## Hva som skjer automatisk

`.claude/hooks/session-start.sh` kjører når en sky-økt starter. Lokalt (på Macen) gjør det
ingenting. Skriptet:

1. Kjører `npm install`, men bare når `package.json` eller `package-lock.json` har endret seg.
   `postinstall` slår samtidig på git-hookene i `.githooks/`.
2. Legger en stubb i `~/.nvm/nvm.sh` når containeren allerede har Node 22, så
   `source ~/.nvm/nvm.sh && nvm use 22` fra dokumentasjonen og `.claude/launch.json` virker.
3. Installerer `playwright-cli`, som skillet med samme navn bruker.
4. Skriver `.env.staging.local` fra miljøvariablene, men bare når
   `NEXT_PUBLIC_SUPABASE_URL` peker på torny-staging (`snwmueecmfqqdurxedxv`). Peker den et
   annet sted, skrives ingenting. Prod-nøkler skal aldri ligge i sky-miljøet.
5. Gir Node 4 GB minne i økta. `tsc --noEmit` i pre-push-porten bruker rundt 2,7 GB, og
   standarden i sky-containeren er rundt 2 GB.

## Hva eieren setter opp én gang (i nettleseren)

- **Plugins og skills:** forge, humanizer, no-nb og board følger kontoen din på claude.ai og
  er med i alle økter. Superpowers slår du på under claude.ai → Customize → Plugins
  (Anthropic Directory → «Superpowers»). Prosjekt-skillene i `.claude/skills/` følger repoet.
- **Staging-nøkler:** i økta, åpne sky-miljø-menyen i tittellinja → Edit → miljøvariabler.
  Variablene skriptet leser: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `E2E_ADMIN_EMAIL`, `E2E_PLAYER_EMAIL`, `DEV_LOGIN_PASSWORD`,
  `NEXT_PUBLIC_ALLOW_SELF_REGISTRATION`, `NEXT_PUBLIC_PASSKEYS`. Kun staging-verdier.
- **Supabase, Vercel og GitHub** kommer som connectorer fra claude.ai, ikke fra filer.

## Det som bare finnes på Macen

- **Orkestratoren** (`jdl-plugins`, privat repo `jdlarssen/claude-plugins`) starter lokale
  Claude-økter og tavla på port 3939. Den er ikke satt opp for skyen.
- **`.env.local` med prod-nøkler** finnes bevisst ikke i skyen.
