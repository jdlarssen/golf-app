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
Oppryddings-issuene for disse flatene (#1142, #1143, #1144, #1145) ligger parkert
av samme grunn — poler ikke en flate ingen står på.

## 3. Tillatte baner nå (per juli 2026)

| Bane | Hva | Issues |
|---|---|---|
| **Herding** | Kjernesløyfa skal aldri ødelegge en lørdag: stagingbevis-porten, staging/prod-paritet, rate-limit-tetting, natt-miljøets e2e | #1076, #1130, #1131, #1183 (+ flake-datapunktene #1132, #1168) |
| **Vekstsløyfa (Tier 1)** | Invitert spiller blir neste arrangør: onboarding uten vegger, kontekst før kode-veggen, kom-i-gang-sjekkliste | #1169, #1170, #1173, #1176, #1177 |
| **Sesongstyrt** | Kavalkaden — golfåret som delbar fortelling. Bygges mot sesongslutt; start dekomponering tidligst september | #1040 |
| **Eier-pull: avstand til green** | Crowdsourcet green-pinning + «~X m til green» på hullskjermen (v1 «ren pinning, én avstand»). Pull: eier + medspiller ba om det på en runde (§5); eier-utvalgt i board-møte 2026-07-10. Design: `docs/superpowers/specs/2026-07-10-avstand-til-green-design.md` | #1210 |

Når en bane tømmes, beslutter eieren neste — dokumentet oppdateres i samme PR.

## 4. Parkert — med vekke-trigger

| Hva | Issues | Vekkes av |
|---|---|---|
| Native app / App Store | #52, #53 | Klubb-skala med betalende klubb + eier-beslutning. PWA-en ER appen inntil da |
| Flere språk | #61, #455 | Ekte ikke-norskspråklige brukere i prod |
| Resend Pro / nytt mail-domene | #54, #55 | >100 mail/dag (som issuene selv sier) |
| Booking-integrasjon | #51 | En klubb ber om det |
| Adferdspsykologi-bølgen (resiprositet, tap-aversjon, anker, smart defaults m.m.) | #1171, #1172, #1174, #1175, #1178, #1179, #1185, #1186 | En ekte bruker etterspør tilsvarende — eller Tier 1-banen er tom og eieren åpner neste pulje |
| Emoji-reaksjoner på lag/matchplay | #977 | Målt bruk av reaksjoner i solo-formater |
| Null-bruk-opprydding cup/liga/betaling | #1142–#1145 | Ekte bruk av flaten (da poleres den), eller eier-beslutning om rydding |
| Restfunn subtraksjonsrevisjonen | #1069 | Eier-triage |

Worth-do-forenklingene fra subtraksjonsrevisjonen (#1133–#1141) er subtraksjon på
brukte flater og går fri av grensen — de kan tas når kapasitet finnes.
Beslutnings-issues (f.eks. #1146) venter på eier-svar og er verken parkert eller tillatt.

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
