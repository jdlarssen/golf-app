<!--
  Ferdiggrensen for Tørny. Opprettet 2026-07-10 etter eier-beslutning i økt.
  Eies av Jørgen — endres kun via PR han har sett. Konsumenter: økter og løkker
  som vurderer å opprette eller bygge feature-issues.
-->

# Hva er nok — ferdiggrensen for Tørny

Flyt-kompasset (`docs/flows/*-fremtid.svg` + `docs/user-flows.md`) sier hva kjernen ER.
Dette dokumentet sier det motsatte: hva som er ferdig, hva som er parkert, og hva som
skal til for å vekke noe. Formålet er å stoppe feature-push fra revisjoner og løkker —
backlogen skal vokse av ekte behov (pull), ikke av at maskineriet får gode ideer.
Konteksten som utløste dokumentet: appen har vært i ekte bruk siden 2026-06-20, kjernen
er komplett, og flaskehalsen er runder spilt — ikke funksjonalitet.

## Slik brukes dokumentet

- **Før et `enhancement`-issue opprettes eller bygges:** sjekk mot dette dokumentet.
  Issuet må enten (a) høre til en tillatt bane (§3), eller (b) navngi vekke-triggeren
  det svarer på (§5). Utenfor grensen: opprett gjerne issuet så ideen ikke mistes, men
  merk det `parked`, legg det i milestone «Backlog — uplanlagt / scale-triggered», og
  ikke bygg det.
- **Grensen gjelder ikke vedlikehold.** Bugs, sikkerhet, ytelse, opprydding og friksjon
  i eksisterende flater rammes aldri — det er stell, ikke nye features. Forenkling som
  krymper appen (subtraksjon på brukte flater) er alltid tillatt.
- **Grensen gjelder ikke verktøy.** Loop-/devx-infrastruktur styres av epic #1073, ikke
  av dette dokumentet.
- **Eieren overstyrer alltid.** En eksplisitt eier-bestilling er i seg selv en trigger.

## 1. Ferdig og fryst — kjernen

Alle flytene i `docs/user-flows.md` er bygget og i produksjon: innlogging (OTP),
invitasjoner og selv-påmelding, spill-veiviseren med den DB-drevne formatkatalogen
(20+ modi), offline scoring med sync, levering og godkjenning, leaderboards med podium,
avslutning med resultat-mail, klubber, venner, innboks, profil med historikk og
statistikk, GDPR-eksport og konto-sletting.

**Fryst betyr:** ingen nye features på disse flatene uten pull (§5). Ingen nye
spillformater uten at noen har bedt om dem. Bugfiks, sikkerhet og friksjonsretting
fortsetter som før.

## 2. Bygget, men ubrukt — fryst til bruk oppstår

Cup, liga og betaling (startkontingent/premiebord) er komplette, men hadde per
2026-07-07 null reell bruk i prod (0 cuper, 0 ligaer, 0 spill med kontingent).
Ingen videre investering utover sikkerhet og bugfiks før ekte bruk oppstår.
Oppryddings-issuene for disse flatene (#1142–#1145) lå parkert av samme grunn;
eieren vekket dem 2026-07-14 (se §4-noten).

**Unntak 2026-07-15 — #1052 (sponsorlogo på premiebordet):** bygget på den frosne
betaling-flaten etter eier-pull — en eksplisitt eier-bestilling overstyrer grensen
(jf. «Eieren overstyrer alltid» over). Flaten er fortsatt fryst; unntaket gjaldt
det ene issuet.

## 3. Tillatte baner nå (per juli 2026)

| Bane | Hva | Issues |
|---|---|---|
| **Herding** | Kjernesløyfa skal aldri ødelegge en lørdag: stagingbevis-porten, staging/prod-paritet, natt-miljøets e2e | #1076 (+ flake-datapunktet #1168) |
| **Sesongstyrt** | Kavalkaden — golfåret som delbar fortelling. Bygges mot sesongslutt; start dekomponering tidligst september | #1040 |

Når en bane tømmes, beslutter eieren neste — dokumentet oppdateres i samme PR.

**Tømt 2026-07-12 — Vekstsløyfa (Tier 1):** alle fem (#1169, #1170, #1173, #1176, #1177)
er bygget og i prod, sammen med forutsetningene #1183 (natt-e2e) og #1192 (funnel-måling).
Eieren åpnet samtidig adferdspsykologi-pulja (se §4-noten) — begge kjørt kontrakt-først
via `.forge/contracts/`.

**Tømt 2026-07-13 — avstand til green:** #1210 (crowdsourcet green-pinning + «~X m til
green» på hullskjermen) er levert og live i prod. Banen sto her som eier-pull etter
board-møtet 2026-07-10; design-dokumentet ligger i
`docs/superpowers/specs/2026-07-10-avstand-til-green-design.md`. Gjenværende baner er
Herding og Sesongstyrt — neste bane besluttes av eieren.

## 4. Parkert — med vekke-trigger

| Hva | Issues | Vekkes av |
|---|---|---|
| Native app / App Store | #52, #53 | Klubb-skala med betalende klubb + eier-beslutning. PWA-en ER appen inntil da |
| Flere språk | #61, #455 | Ekte ikke-norskspråklige brukere i prod |
| Resend Pro / nytt mail-domene | #54, #55 | >100 mail/dag (som issuene selv sier) |
| Booking-integrasjon | #51 | En klubb ber om det |
| Emoji-reaksjoner på lag/matchplay | #977 | Målt bruk av reaksjoner i solo-formater |
| Restfunn subtraksjonsrevisjonen | #1069 | Eier-triage |

Worth-do-forenklingene fra subtraksjonsrevisjonen (#1133–#1141) er alle tatt —
siste lukket 2026-07-15. Beslutnings-issues (f.eks. #1146) venter på eier-svar og
er verken parkert eller tillatt.

**Vekket 2026-07-14 — null-bruk-oppryddingen cup/liga/betaling (#1142–#1145):**
raden sto parkert med trigger «ekte bruk av flaten, eller eier-beslutning om
rydding» — eieren besluttet rydding. #1143 er bygget (lukket 2026-07-15);
#1142, #1144 og #1145 er merket `autonomy:ready` med kontrakter og går via
natt-køen. Merk: dette er rydding/subtraksjon, ikke ny investering — §2-frysen
for nye features på flatene står.

**Bygget 2026-07-10 → 12 — adferdspsykologi-bølgen:** bølgen sto parkert her med trigger
«Tier 1 tom + eieren åpner pulja» — begge slo til: #1171, #1172, #1174, #1175, #1178,
#1179, #1185, #1186 pluss de brainstormede #1193 (sosialt bevis) og #1194 (streak) er
alle bygget kontrakt-først og i prod. Effekten måles i onboarding-funnelen fra #1192.

## 5. Hva teller som «pull» (vekke-kriterier)

Noe av dette må være sant før et parkert issue vekkes eller et nytt feature-issue
regnes som innenfor grensen:

- **En navngitt ekte bruker har bedt om det** — feedback i appen, mail, eller muntlig
  til eieren. «Spillere kommer til å ville …» teller ikke; «Kristian spurte om …» teller.
- **Bruksdata viser behovet** — folk leter etter noe som ikke finnes, eller en flate
  med null bruk får faktisk bruk.
- **En skala-terskel issuet selv navngir er krysset** — mail-volum, klubbstørrelse,
  antall samtidige spill.
- **En sesong-hendelse inntreffer** — sesongslutt vekker Kavalkaden.

Dette er IKKE pull: en idé fra en revisjon eller løkke, et adferdspsykologi-prinsipp,
«hadde vært fint», eller at en konkurrent har funksjonen.

## 6. Vedlikehold av grensen

Eieren eier dette dokumentet. Økter og løkker foreslår endringer via PR — aldri ved å
tolke seg rundt den. Står grensen i veien for noe som kjennes riktig, er svaret å ta
det med eieren, ikke å bygge først og spørre etterpå.
