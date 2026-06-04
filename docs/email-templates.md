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
| **Magic Link** | ✅ Ja, **OTP-kode** | Sendes ved login til **eksisterende** auth-brukere. Viser en 6-sifret kode (`{{ .Token }}`), ingen lenke. Conditional på `.Data.inviter_name`. |
| **Confirm Signup** | ✅ Ja, **OTP-kode** | Sendes ved `signInWithOtp(shouldCreateUser:true)` til **nye** brukere — selvregistrering, admin-invitasjoner og venneinvitasjoner via `/invite`. Viser en 6-sifret kode (`{{ .Token }}`), ingen lenke. Conditional på `.Data.inviter_name`. |
| **Invite user** | ⚠️ Reserve | Vi bruker `signInWithOtp` i stedet, men hvis vi senere bytter til `auth.admin.inviteUserByEmail()` trigges denne |
| **Change Email Address** | ⚠️ Hvis brukt | Trigges hvis bruker bytter mail via Auth (ikke i UI per nå, men kan skje via dashboard) |
| **Reset Password** | ❌ Ikke i bruk | Vi har magic link only. Branded likevel. |

> ⚠️ **Begge login-malene MÅ vise OTP-kode (`{{ .Token }}`), ikke lenke (`{{ .ConfirmationURL }}`).**
> Appen ber alltid om en 6-sifret kode på `/login` og verifiserer med `verifyOtp({ type: 'email' })`. En lenke-basert mal gir mismatch (brukeren har ingen kode å taste) og gjeninnfører iOS-PWA-bruddet + mail-scanner-konsumeringen som var hele grunnen til OTP-migreringen 2026-05-13.
>
> **Magic Link** ble migrert til kode 2026-05-13. **Confirm Signup** ble migrert 2026-06-04 — den ble aldri trigget før åpen selvregistrering (#364) ble skrudd på, så den lå igjen som lenke-mal og sendte en «Bekreft kontoen»-lenke til den første nye brukeren. Symptom: e-post med lenke, app som ber om kode.

Alle malene under bruker samme Tørny-stil (forest-and-champagne) for visuell konsistens.

---

## 1. Magic Link — primær login

**Subject:** `{{ if .Data.inviter_name }}{{ .Data.inviter_name }} har invitert deg til Tørny{{ else }}Logg inn på Tørny{{ end }}`

**Body:**

```html
<!DOCTYPE html>
<html lang="nb-NO">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Logg inn på Tørny</title>
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
              <h1 style="font-family: Georgia, 'Times New Roman', serif; font-size: 24px; font-weight: 500; color: #1A2E1F; margin: 0 0 12px 0; line-height: 1.3;">
                {{ if .Data.inviter_name }}{{ .Data.inviter_name }} vil ha deg med på Tørny{{ else }}Klikk for å logge inn{{ end }}
              </h1>
              <p style="font-size: 15px; color: #1A2E1F; margin: 0 0 24px 0; line-height: 1.5;">
                {{ if .Data.inviter_name }}{{ .Data.inviter_name }} har invitert deg til Tørny. Skriv inn koden under i appen for å logge inn. Koden er gyldig i 1 time.{{ else }}Hei! Skriv inn koden under i appen for å logge inn. Koden er gyldig i 1 time.{{ end }}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <div style="background-color: #F8F6F0; border: 1px solid #E5E0D3; border-radius: 12px; padding: 20px; text-align: center;">
                <div style="font-size: 12px; color: #5C5347; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 8px;">Koden din</div>
                <div style="font-family: 'SF Mono', 'Courier New', Courier, monospace; font-size: 32px; font-weight: 600; color: #1B4332; letter-spacing: 0.25em;">{{ .Token }}</div>
              </div>
              <p style="font-size: 13px; color: #5C5347; margin: 20px 0 0 0; line-height: 1.5;">
                Skriv koden inn på innloggingssiden i Tørny. Du trenger ikke klikke noen lenke.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #F8F6F0; padding: 16px 32px; border-top: 1px solid #E5E0D3;">
              <p style="font-size: 12px; color: #5C5347; margin: 0; line-height: 1.5;">
                Mottok du denne uten å ha bedt om det? Bare ignorer mailen. Ingen får logget inn uten denne lenken.
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

## 4. Confirm Signup — invitasjoner til nye brukere

Sendes når `signInWithOtp({ shouldCreateUser: true })` kalles for en e-postadresse som **ikke** finnes i `auth.users` — altså åpen selvregistrering, admin-invitasjoner og venneinvitasjoner via `/invite`. **Viser OTP-kode (`{{ .Token }}`), ikke lenke** (se ⚠️-notisen øverst). Conditional på `.Data.inviter_name` så venneinvitasjoner får personlig hilsen mens selvreg/admin faller på generisk "Bekreft kontoen din"-tekst.

**Subject:** `{{ if .Data.inviter_name }}{{ .Data.inviter_name }} har invitert deg til Tørny{{ else }}Bekreft kontoen din i Tørny{{ end }}`

**Body:**

```html
<!DOCTYPE html>
<html lang="nb-NO">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bekreft kontoen din</title>
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
              <h1 style="font-family: Georgia, 'Times New Roman', serif; font-size: 24px; font-weight: 500; color: #1A2E1F; margin: 0 0 12px 0; line-height: 1.3;">
                {{ if .Data.inviter_name }}{{ .Data.inviter_name }} vil ha deg med på Tørny{{ else }}Bekreft kontoen din{{ end }}
              </h1>
              <p style="font-size: 15px; color: #1A2E1F; margin: 0 0 24px 0; line-height: 1.5;">
                {{ if .Data.inviter_name }}{{ .Data.inviter_name }} har invitert deg til Tørny. Skriv inn koden under i appen for å lage kontoen din. Koden er gyldig i 1 time.{{ else }}Velkommen til Tørny! Skriv inn koden under i appen for å bekrefte kontoen din. Koden er gyldig i 1 time.{{ end }}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <div style="background-color: #F8F6F0; border: 1px solid #E5E0D3; border-radius: 12px; padding: 20px; text-align: center;">
                <div style="font-size: 12px; color: #5C5347; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 8px;">Koden din</div>
                <div style="font-family: 'SF Mono', 'Courier New', Courier, monospace; font-size: 32px; font-weight: 600; color: #1B4332; letter-spacing: 0.25em;">{{ .Token }}</div>
              </div>
              <p style="font-size: 13px; color: #5C5347; margin: 20px 0 0 0; line-height: 1.5;">
                Skriv koden inn på innloggingssiden i Tørny. Du trenger ikke klikke noen lenke.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #F8F6F0; padding: 16px 32px; border-top: 1px solid #E5E0D3;">
              <p style="font-size: 12px; color: #5C5347; margin: 0; line-height: 1.5;">
                Var det ikke deg som registrerte deg? Bare ignorer mailen.
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
