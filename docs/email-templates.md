# Tørny — mail-maler

Supabase Auth bruker konfigurerbare HTML-maler for alle auth-mailer. Her er Tørny-brandede versjoner.

## Hvor du limer dem inn

1. Supabase Dashboard → **Authentication** (venstre meny)
2. Klikk **Email Templates** i undermenyen
3. Velg malen du vil endre (se under)
4. Oppdater **Subject** og lim inn **Body (HTML)**
5. **Save**

## Hvilke maler Tørny faktisk bruker

| Mal | Brukes av Tørny? | Beskrivelse |
|---|---|---|
| **Magic Link** | ✅ Ja, **OTP-kode** | Sendes ved login til **eksisterende** auth-brukere. **Språknøytral kode-mal (Fase M):** viser en 6-sifret kode (`{{ .Token }}`), ingen lenke, ingen prosa. |
| **Confirm Signup** | ✅ Ja, **OTP-kode** | Sendes ved `signInWithOtp(shouldCreateUser:true)` til **nye** brukere — selvregistrering, admin-invitasjoner og venneinvitasjoner via `/invite`. Samme **språknøytrale kode-mal** som Magic Link. |
| **Invite user** | ⚠️ Reserve | Vi bruker `signInWithOtp` i stedet, men hvis vi senere bytter til `auth.admin.inviteUserByEmail()` trigges denne |
| **Change Email Address** | ⚠️ Hvis brukt | Trigges hvis bruker bytter mail via Auth (ikke i UI per nå, men kan skje via dashboard) |
| **Reset Password** | ❌ Ikke i bruk | Vi har magic link only. Branded likevel. |

> ⚠️ **Begge login-malene MÅ vise OTP-kode (`{{ .Token }}`), ikke lenke (`{{ .ConfirmationURL }}`).**
> Appen ber alltid om en 6-sifret kode på `/login` og verifiserer med `verifyOtp({ type: 'email' })`. En lenke-basert mal gir mismatch (brukeren har ingen kode å taste) og gjeninnfører iOS-PWA-bruddet + mail-scanner-konsumeringen som var hele grunnen til OTP-migreringen 2026-05-13.
>
> **Magic Link** ble migrert til kode 2026-05-13. **Confirm Signup** ble migrert 2026-06-04 — den ble aldri trigget før åpen selvregistrering (#364) ble skrudd på, så den lå igjen som lenke-mal og sendte en «Bekreft kontoen»-lenke til den første nye brukeren. Symptom: e-post med lenke, app som ber om kode.

Alle malene under bruker samme Tørny-stil (forest-and-champagne) for visuell konsistens.

> 🌍 **Fase M (#594) — språknøytral kode-mal.** Supabase Auth kan ikke velge mal etter mottakerens språk, og å stable norsk + engelsk i samme mail skalerer ikke når flere språk kommer. Løsningen er å fjerne prosaen: kode-mailen er nå merkevaren + selve koden + en kort gyldighet (`60 min`) — null setninger å oversette. Den fungerer likt for norsk, engelsk og alle framtidige språk uten endring.
>
> Det henger på en enkel innsikt: brukeren ba nettopp om koden fra `/login`-skjermen, som allerede er på språket deres, så de vet hva koden er til. Og «hvem inviterte deg»-konteksten leveres separat av invitasjons-mailen via Resend, som nå er lokalisert (Fase M). Kode-mailen trenger derfor bare å levere koden.

---

## 1. Magic Link / Confirm Signup — login-kode (språknøytral)

Begge login-malene (**Magic Link** for eksisterende brukere og **Confirm Signup** for nye) bruker denne ene språknøytrale malen. Lim den inn i begge.

**Subject:** `{{ .Token }} · Tørny`

> Koden står først i subject-en, så brukeren ser den rett i varselet/innboks-listen uten å åpne mailen. `·` og merkevaren er språknøytrale.

**Body:**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tørny</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8F6F0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #F8F6F0; padding: 48px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="400" style="max-width: 400px; background-color: #FFFFFF; border: 1px solid #E5E0D3; border-radius: 16px;">
          <tr>
            <td align="center" style="padding: 36px 32px 0 32px;">
              <div style="font-family: Georgia, 'Times New Roman', serif; font-size: 28px; font-weight: 500; color: #1B4332; letter-spacing: -0.01em; line-height: 1;">Tørny<span style="color: #C9A961;">.</span></div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 32px 24px 6px 24px;">
              <div style="font-family: 'SF Mono', 'Courier New', Courier, monospace; font-size: 40px; font-weight: 600; color: #1B4332; letter-spacing: 0.28em; line-height: 1.1; padding-left: 0.28em;">{{ .Token }}</div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 0 32px 36px 32px;">
              <div style="font-size: 13px; color: #8A8175; letter-spacing: 0.06em;">&#9203;&nbsp; 60 min</div>
            </td>
          </tr>
        </table>
        <p style="font-size: 11px; color: #8A8175; margin: 18px 0 0 0; letter-spacing: 0.04em;">Tørny &middot; golf</p>
      </td>
    </tr>
  </table>
</body>
</html>
```

> **Hvorfor ingen «ikke deg?»-fotnote:** kode-malen har ingen lenke å klikke og koden er verdiløs uten appen + tilgang til denne innboksen, så phishing-flaten er minimal. En sikkerhets-setning ville måtte stå på ett språk og bryte språknøytraliteten. `&#9203;` er timeglass-symbolet (gyldighet) — dekorativt, degraderer pent hvis en klient ikke viser det.

---

## 2. Invite User

Brukes hvis vi senere bytter fra `signInWithOtp` til `auth.admin.inviteUserByEmail()` for admin-initierte invitasjoner. Velkomstvinkling.

**Subject:** `Du er invitert til Tørny`

**Body:**

```html
<!DOCTYPE html>
<html lang="nb-NO">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Du er invitert til Tørny</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8F6F0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1A2E1F;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #F8F6F0; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="480" style="max-width: 480px; background-color: #FFFFFF; border: 1px solid #E5E0D3; border-radius: 16px; overflow: hidden;">
          <tr>
            <td style="padding: 32px 32px 8px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color: #1B4332; color: #FFFFFF; width: 40px; height: 40px; border-radius: 10px; text-align: center; font-family: Georgia, 'Times New Roman', serif; font-size: 22px; font-weight: 500; vertical-align: middle;">T</td>
                  <td style="padding-left: 12px; vertical-align: middle;">
                    <div style="font-family: Georgia, 'Times New Roman', serif; font-size: 18px; font-weight: 500; color: #1A2E1F; line-height: 1.2;">Tørny</div>
                    <div style="font-size: 10px; color: #5C5347; text-transform: uppercase; letter-spacing: 0.18em; margin-top: 2px;">Turnering</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 32px 8px 32px;">
              <h1 style="font-family: Georgia, 'Times New Roman', serif; font-size: 24px; font-weight: 500; color: #1A2E1F; margin: 0 0 12px 0; line-height: 1.3;">Du er invitert</h1>
              <p style="font-size: 15px; color: #1A2E1F; margin: 0 0 16px 0; line-height: 1.5;">
                Du er invitert til å bli med på en runde golf i Tørny, appen for å arrangere golf-turneringer for kompisgjenger og klubber.
              </p>
              <p style="font-size: 15px; color: #1A2E1F; margin: 0 0 24px 0; line-height: 1.5;">
                Klikk knappen under for å akseptere invitasjonen og fullføre profilen din. Lenken er gyldig i 24 timer.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="{{ .ConfirmationURL }}" style="display: inline-block; background-color: #1B4332; color: #FFFFFF; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-size: 16px; font-weight: 500; letter-spacing: -0.01em;">
                      Aksepter invitasjonen
                    </a>
                  </td>
                </tr>
              </table>
              <p style="font-size: 13px; color: #5C5347; margin: 24px 0 0 0; line-height: 1.5;">
                Knappen funker ikke? <a href="{{ .ConfirmationURL }}" style="color: #1B4332; text-decoration: underline;">Åpne lenken direkte</a>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #F8F6F0; padding: 16px 32px; border-top: 1px solid #E5E0D3;">
              <p style="font-size: 12px; color: #5C5347; margin: 0; line-height: 1.5;">
                Kjenner du ikke avsender? Bare ignorer mailen. Ingen får tilgang uten at du selv aksepterer.
              </p>
            </td>
          </tr>
        </table>
        <p style="font-size: 11px; color: #5C5347; margin: 16px 0 0 0;">
          Tørny · turneringsapp for golf
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## 3. Change Email Address

Trigges når en bruker bytter e-postadresse — sendes til den NYE adressen for bekreftelse.

**Subject:** `Bekreft ny e-postadresse for Tørny`

**Body:**

```html
<!DOCTYPE html>
<html lang="nb-NO">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bekreft ny e-postadresse</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8F6F0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1A2E1F;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #F8F6F0; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="480" style="max-width: 480px; background-color: #FFFFFF; border: 1px solid #E5E0D3; border-radius: 16px; overflow: hidden;">
          <tr>
            <td style="padding: 32px 32px 8px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color: #1B4332; color: #FFFFFF; width: 40px; height: 40px; border-radius: 10px; text-align: center; font-family: Georgia, 'Times New Roman', serif; font-size: 22px; font-weight: 500; vertical-align: middle;">T</td>
                  <td style="padding-left: 12px; vertical-align: middle;">
                    <div style="font-family: Georgia, 'Times New Roman', serif; font-size: 18px; font-weight: 500; color: #1A2E1F; line-height: 1.2;">Tørny</div>
                    <div style="font-size: 10px; color: #5C5347; text-transform: uppercase; letter-spacing: 0.18em; margin-top: 2px;">Turnering</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 32px 8px 32px;">
              <h1 style="font-family: Georgia, 'Times New Roman', serif; font-size: 24px; font-weight: 500; color: #1A2E1F; margin: 0 0 12px 0; line-height: 1.3;">Bekreft ny e-postadresse</h1>
              <p style="font-size: 15px; color: #1A2E1F; margin: 0 0 16px 0; line-height: 1.5;">
                Du har bedt om å endre e-postadressen din i Tørny til <strong>{{ .NewEmail }}</strong>.
              </p>
              <p style="font-size: 15px; color: #1A2E1F; margin: 0 0 24px 0; line-height: 1.5;">
                Klikk knappen under for å bekrefte endringen. Lenken er gyldig i 1 time.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="{{ .ConfirmationURL }}" style="display: inline-block; background-color: #1B4332; color: #FFFFFF; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-size: 16px; font-weight: 500; letter-spacing: -0.01em;">
                      Bekreft ny e-post
                    </a>
                  </td>
                </tr>
              </table>
              <p style="font-size: 13px; color: #5C5347; margin: 24px 0 0 0; line-height: 1.5;">
                Knappen funker ikke? <a href="{{ .ConfirmationURL }}" style="color: #1B4332; text-decoration: underline;">Åpne lenken direkte</a>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #F8F6F0; padding: 16px 32px; border-top: 1px solid #E5E0D3;">
              <p style="font-size: 12px; color: #5C5347; margin: 0; line-height: 1.5;">
                Var det ikke deg som forespurte dette? Ignorer mailen. Adressen din blir ikke endret med mindre du klikker lenken.
              </p>
            </td>
          </tr>
        </table>
        <p style="font-size: 11px; color: #5C5347; margin: 16px 0 0 0;">
          Tørny · turneringsapp for golf
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## 4. Confirm Signup — nye brukere

Sendes når `signInWithOtp({ shouldCreateUser: true })` kalles for en e-postadresse som **ikke** finnes i `auth.users` — altså åpen selvregistrering, admin-invitasjoner og venneinvitasjoner via `/invite`. **Viser OTP-kode (`{{ .Token }}`), ikke lenke** (se ⚠️-notisen øverst).

Bruk **nøyaktig samme språknøytrale mal som seksjon 1** (Magic Link / Confirm Signup) — subject `{{ .Token }} · Tørny` og samme body. De to malene er identiske; Supabase krever bare at begge fylles ut hver for seg.

---

## 5. Reset Password (ikke i bruk, men brandet for konsistens)

**Subject:** `Tilbakestill passord for Tørny`

**Body:**

```html
<!DOCTYPE html>
<html lang="nb-NO">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tilbakestill passord</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8F6F0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1A2E1F;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #F8F6F0; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="480" style="max-width: 480px; background-color: #FFFFFF; border: 1px solid #E5E0D3; border-radius: 16px; overflow: hidden;">
          <tr>
            <td style="padding: 32px 32px 8px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color: #1B4332; color: #FFFFFF; width: 40px; height: 40px; border-radius: 10px; text-align: center; font-family: Georgia, 'Times New Roman', serif; font-size: 22px; font-weight: 500; vertical-align: middle;">T</td>
                  <td style="padding-left: 12px; vertical-align: middle;">
                    <div style="font-family: Georgia, 'Times New Roman', serif; font-size: 18px; font-weight: 500; color: #1A2E1F; line-height: 1.2;">Tørny</div>
                    <div style="font-size: 10px; color: #5C5347; text-transform: uppercase; letter-spacing: 0.18em; margin-top: 2px;">Turnering</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 32px 8px 32px;">
              <h1 style="font-family: Georgia, 'Times New Roman', serif; font-size: 24px; font-weight: 500; color: #1A2E1F; margin: 0 0 12px 0; line-height: 1.3;">Tilbakestill passordet ditt</h1>
              <p style="font-size: 15px; color: #1A2E1F; margin: 0 0 24px 0; line-height: 1.5;">
                Klikk knappen under for å velge et nytt passord. Lenken er gyldig i 1 time.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="{{ .ConfirmationURL }}" style="display: inline-block; background-color: #1B4332; color: #FFFFFF; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-size: 16px; font-weight: 500; letter-spacing: -0.01em;">
                      Velg nytt passord
                    </a>
                  </td>
                </tr>
              </table>
              <p style="font-size: 13px; color: #5C5347; margin: 24px 0 0 0; line-height: 1.5;">
                Knappen funker ikke? <a href="{{ .ConfirmationURL }}" style="color: #1B4332; text-decoration: underline;">Åpne lenken direkte</a>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #F8F6F0; padding: 16px 32px; border-top: 1px solid #E5E0D3;">
              <p style="font-size: 12px; color: #5C5347; margin: 0; line-height: 1.5;">
                Var det ikke deg som bestilte dette? Ignorer mailen. Passordet ditt blir ikke endret.
              </p>
            </td>
          </tr>
        </table>
        <p style="font-size: 11px; color: #5C5347; margin: 16px 0 0 0;">
          Tørny · turneringsapp for golf
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## Tips

- Test mail-en før du stoler på den: send invitasjon til din egen mail og åpne på både desktop og mobil
- Sjekk hvordan den ser ut i Gmail, Outlook og Apple Mail
- Hvis tekst klipper i Apple Mail: sjekk at all CSS er inline (det er den allerede)

## Hva du senere kan vurdere

- Legge til en lite illustrasjon eller fotografi (krever vert)
- Lokalisere subject etter context («Du er invitert til Tørny» vs «Logg inn») — krever to forskjellige `signInWithOtp`-flyter
- Mørk modus i mail (Apple Mail og Gmail støtter `@media (prefers-color-scheme: dark)` delvis)
