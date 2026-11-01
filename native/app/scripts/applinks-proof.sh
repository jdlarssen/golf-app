# native/app/scripts/applinks-proof.sh
# App Links-regelen for Android-butikkbygget (#2627). Egen fil så regelen kan
# kjøres på fakta uten en AAB (`applinks-proof.test.js`). Sources av
# `store-build-proof-android.sh`; kjøres ikke alene.
#
# Kalleren skal definere `say`, `pass` og `fail` og kalle
# `android_applinks_rules <fakta-fil>` med utdataene fra
# `android-proof.py manifest`. Regelen leser `autoverify-path=<vert> <sti>`-
# linjene (én per vert og sti-attributt i et filter med autoVerify, `*` når
# filteret ikke har noen sti).
#
# Regelen, motstykket til iOS-regelen om associated domains
# (`entitlements-proof.sh`): venne-lenka, QR-koden på bag-taggen og ligalenka
# åpner appen (#2748), og ingenting annet på tornygolf.no gjør det. Appen kan ikke
# bære en nett-sesjon fra en lenke, så innlogging og påmelding skal fortsatt åpnes
# i nettleseren.
#  - Hver autoVerify-sti for tornygolf.no og www.tornygolf.no MÅ være en av stiene
#    på lista. En annen sti, et filter uten sti (`*`), et annet underdomene og en
#    vert som er en ressursreferanse (`@string/…`, kan ikke leses her) er FAIL.
#  - Alle stiene MÅ finnes på begge vertene, ellers åpner ikke lenka appen.
#  - Andre verter skrives ut som informasjon.
# Stiene og vertene står i `app.config.ts` (`STORE_APP_LINK_PATH_PREFIXES`,
# `STORE_LINK_DOMAINS`), og `applinks-proof.test.js` holder lista her i takt med den.

ANDROID_APPLINKS_APEX=tornygolf.no
ANDROID_APPLINKS_HOSTS='tornygolf.no www.tornygolf.no'
ANDROID_APPLINKS_ALLOWED='pathPrefix:/venner/legg-til/ pathPrefix:/liga/bli-med/ pathPrefix:/en/venner/legg-til/ pathPrefix:/en/liga/bli-med/'

android_applinks_rules() {
  local file=$1 host spec want bad=0 seen=' ' missing=''
  while IFS=' ' read -r host spec; do
    [ -n "$host" ] || continue
    # Vertsnavn skiller ikke store og små bokstaver.
    host=$(printf '%s' "$host" | tr '[:upper:]' '[:lower:]')
    case " $ANDROID_APPLINKS_HOSTS " in
      *" $host "*)
        case " $ANDROID_APPLINKS_ALLOWED " in
          *" $spec "*)
            seen="$seen$host|$spec "
            say "      autoVerify: $host $spec (på lista)"
            ;;
          *)
            bad=$((bad + 1))
            say "      autoVerify: $host $spec (ikke på lista)"
            ;;
        esac
        ;;
      *)
        case "$host" in
          *."$ANDROID_APPLINKS_APEX")
            bad=$((bad + 1))
            say "      autoVerify: $host $spec (underdomene)"
            ;;
          @*)
            bad=$((bad + 1))
            say "      autoVerify: $host $spec (ressursreferanse som ikke kan leses her, regnes som $ANDROID_APPLINKS_APEX)"
            ;;
          *)
            say "      autoVerify: $host $spec (ikke $ANDROID_APPLINKS_APEX)"
            ;;
        esac
        ;;
    esac
  done < <(sed -n 's/^autoverify-path=//p' "$file")

  for host in $ANDROID_APPLINKS_HOSTS; do
    for want in $ANDROID_APPLINKS_ALLOWED; do
      case "$seen" in
        *" $host|$want "*) ;;
        *) missing="$missing $host|$want" ;;
      esac
    done
  done

  if [ "$bad" != "0" ]; then
    fail "$bad autoVerify-claim(er) for $ANDROID_APPLINKS_APEX utenfor lista. Bare $ANDROID_APPLINKS_ALLOWED på $ANDROID_APPLINKS_HOSTS er lov (#2748)"
  elif [ -n "$missing" ]; then
    fail "autoVerify mangler:$missing. Uten den åpner ikke lenka appen på Android (#2748)"
  else
    pass "autoVerify bare for lista ($ANDROID_APPLINKS_HOSTS: $ANDROID_APPLINKS_ALLOWED)"
  fi
}
