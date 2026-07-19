runde 1 — ACCEPT — ingen findings (observasjon: PPR soft-404 på ugyldige slugs, pre-eksisterende, filt som eget issue)
runde 2 (staging-verify): FUNN proxy.ts + innlogget-nav — PUBLIC strippet brukerheaderen så innloggede mistet bunn-nav på /spillformater (fella fra #1185). FIKSET: flyttet til AUTH_OPTIONAL_PATH_PATTERN; anonym 200 + innlogget nav re-verifisert på staging.
