# Tørny — mail-maler

Supabase Auth bruker konfigurerbare HTML-maler for alle auth-mailer. Default-malene er på engelsk og generiske; her er Tørny-brandede versjoner du limer inn i Supabase Dashboard.

## Hvor du limer dem inn

1. Supabase Dashboard → **Authentication** (venstre meny)
2. Klikk **Email Templates** i undermenyen
3. Velg malen du vil endre (se under)
4. Lim inn HTML-en
5. **Save**

## 1. Magic Link (innlogging og invitasjoner)

Denne brukes både ved vanlig innlogging og når admin inviterer nye spillere.

**Subject:** `Logg inn på Tørny`

**Body (HTML):**

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
              <h1 style="font-family: Georgia, 'Times New Roman', serif; font-size: 24px; font-weight: 500; color: #1A2E1F; margin: 0 0 12px 0; line-height: 1.3;">Klikk for å logge inn</h1>
              <p style="font-size: 15px; color: #1A2E1F; margin: 0 0 24px 0; line-height: 1.5;">
                Hei! Klikk knappen under for å åpne Tørny. Lenken er gyldig i 1 time.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="{{ .ConfirmationURL }}" style="display: inline-block; background-color: #1B4332; color: #FFFFFF; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-size: 16px; font-weight: 500; letter-spacing: -0.01em;">
                      Logg inn på Tørny
                    </a>
                  </td>
                </tr>
              </table>
              <p style="font-size: 13px; color: #5C5347; margin: 24px 0 0 0; line-height: 1.5;">
                Knappen funker ikke? Kopier denne lenken inn i nettleseren:
              </p>
              <p style="font-size: 12px; color: #5C5347; margin: 8px 0 0 0; word-break: break-all; font-family: 'SF Mono', Consolas, Monaco, monospace;">
                {{ .ConfirmationURL }}
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #F8F6F0; padding: 16px 32px; border-top: 1px solid #E5E0D3;">
              <p style="font-size: 12px; color: #5C5347; margin: 0; line-height: 1.5;">
                Mottok du denne uten å ha bedt om det? Bare ignorer mailen — ingen får logget inn uten denne lenken.
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

## 2. Confirm Signup (deaktivert — vi bruker magic link)

Vi bruker `signInWithOtp` for all innlogging, ikke `signUp`. Denne malen vil normalt ikke trigge for Tørny, men kan oppdateres for sikkerhets skyld med samme stil.

## 3. Endre passord / Reset Password

Også ikke i bruk siden vi kun bruker magic link. Trenger ingen endring.

## Tips

- Test mail-en før du stoler på den: send invitasjon til din egen mail og åpne på både desktop og mobil
- Sjekk hvordan den ser ut i Gmail, Outlook og Apple Mail — alle tre er hovedklientene
- Hvis tekst klipper i Apple Mail: sjekk at all CSS er inline (det er den allerede)

## Hva du senere kan vurdere

- Legge til en lite illustrasjon eller fotografi (krever vert)
- Lokalisere subject etter context («Du er invitert til Tørny» vs «Logg inn») — krever to forskjellige `signInWithOtp`-flyter
- Mørk modus i mail (Apple Mail og Gmail støtter `@media (prefers-color-scheme: dark)` delvis)
