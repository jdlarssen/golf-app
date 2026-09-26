# Prosjekt-skills

Skills her lastes av alle Claude Code-økter i repoet. Når hver brukes i Tørny:
`docs/style-and-brand.md` §Designverktøy.

| Skill | Kilde | Lisens | Tørny-endring |
|---|---|---|---|
| `staging-verify` | Tørny (#1076) | — | — |
| `web-design-guidelines` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) `skills/web-design-guidelines` @ `063bee9` | MIT (oppgitt i repoets README; repoet har ingen LICENSE-fil) | Seksjonen «Tørny-ramme» |
| `playwright-cli` | [microsoft/playwright-cli](https://github.com/microsoft/playwright-cli) `skills/playwright-cli` @ `74354ec`, installert med `playwright-cli install --skills` (0.1.21) | Apache-2.0 (`playwright-cli/LICENSE`) | Seksjonen «Tørny-ramme» nederst |
| `design-taste-frontend` | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) `skills/taste-skill` @ `ce26fc2` | MIT (`design-taste-frontend/LICENSE`) | `description` avgrenset til markedsflater + seksjonen «Tørny-ramme» |

## Oppdatere en vendoret skill

1. Hent ny upstream-versjon av SKILL.md (for `playwright-cli`: `npm i -g @playwright/cli@latest`
   og så `playwright-cli install --skills`, som overskriver mappa).
2. Legg Tørny-endringen fra tabellen over tilbake. Ta den fra git-historikken
   (`git show HEAD:.claude/skills/<navn>/SKILL.md`).
3. Oppdater commit-SHA-en i tabellen.

`playwright-cli` krever kommandoen på maskinen: `npm i -g @playwright/cli@latest` (Node 22).
Skillen forklarer selv hva den gjør når kommandoen mangler.

## Vurdert og valgt bort

`djd933/claude-design-plugins` pakker de samme fem navnene som plugins. Den ble lest i sin
helhet 2026-09-26: opprettet tre dager før av en ukjent konto, 0 stjerner, og tynne
generiske kopier av originalene over (blant annet en blå standardpalett og Inter+Sora).
Originalene er bedre og vedlikeholdt av Vercel, Microsoft og Leonxlnx.

**Image-to-Code** ble ikke egen skill. Originalen (`Leonxlnx/taste-skill`
`skills/image-to-code-skill`) er skrevet for Codex og lager designbildene selv før den koder,
og det passer ikke et eksisterende produkt. En Tørny-versjon ble testet først, med et
konkurrent-skjermbilde og beskjeden «få leaderboardet vårt til å se sånn ut». Tre agenter
fikk oppgaven uten skill, og alle tre gjorde det riktige med `DESIGN.md` alene: de hentet
strukturen fra bildet og stilen fra Tørny, avviste gradient og emoji, gjenbrukte
komponentene og spurte eieren før de bygde. Uten en feil å rette tilfører skillen ingenting.
Regelen står derfor som én rad i `docs/style-and-brand.md` §Designverktøy.
