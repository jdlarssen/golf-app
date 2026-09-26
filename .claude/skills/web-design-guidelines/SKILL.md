---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## Tørny-ramme (les før du rapporterer funn)

Reglene under hentes ferskt fra Vercel og er skrevet for engelsk UI. I Tørny gjelder
dette i tillegg, og det vinner ved konflikt:

- **Norsk copy:** setningsstil i overskrifter og knapper (ikke Title Case), «» som
  anførselstegn (ikke “ ”) og reglene i `docs/copy-style.md`. «Title Case»- og
  «curly quotes»-regelen gir derfor ingen funn her; `…` framfor `...` gjelder.
- **Merkevaren er låst:** farger, fonter og komponenter står i `DESIGN.md`. Foreslå
  aldri ny palett eller font som «fiks».
- **Allerede håndhevet, sjekk før du rapporterer:** den globale `:focus-visible`-ringen
  i `app/globals.css` (#1386), så `outline-none` er ikke automatisk et funn;
  `tabular-nums`/`.score-num` for tall; `tap-extend` for 44 px trykkflater (#1356);
  kontrast-tokenene `--*-text` (#1374, #1388, #1686).
- **Tørny er en mobil-PWA**, og iPhone Safari er hovedplattformen: vekt trykk,
  safe-area og lesbarhet i sollys over hover og tastatursnarveier.
- **Funn blir handling, ikke issues:** feil og friksjon uten produktvalg fikses i
  PR-en (`docs/issue-workflow.md` §Null-vekst); utseende-endringer er produktvalg
  (`docs/pr-workflow.md`).

## How It Works

1. Fetch the latest guidelines from the source URL below
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in the fetched guidelines
4. Output findings in the terse `file:line` format

## Guidelines Source

Fetch fresh guidelines before each review:

```
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

Use WebFetch to retrieve the latest rules. The fetched content contains all the rules and output format instructions.

## Usage

When a user provides a file or pattern argument:
1. Fetch guidelines from the source URL above
2. Read the specified files
3. Apply all rules from the fetched guidelines
4. Output findings using the format specified in the guidelines

If no files specified, ask the user which files to review.
