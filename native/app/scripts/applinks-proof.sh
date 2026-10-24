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
# (`entitlements-proof.sh`): venne-lenka og QR-koden på bag-taggen åpner
# appen, og ingenting annet på tornygolf.no gjør det. Appen kan ikke bære en
# nett-sesjon fra en lenke, så innlogging, invitasjoner og påmelding skal
# fortsatt åpnes i nettleseren.
#  - Hver autoVerify-sti for tornygolf.no MÅ være en av venne-stiene. En annen
#    sti, et filter uten sti (`*`), et underdomene og en vert som er en
#    ressursreferanse (`@string/…`, kan ikke leses her) er FAIL.
#  - Begge venne-stiene MÅ finnes, ellers åpner ikke lenka appen.
#  - Andre verter skrives ut som informasjon.
# Stiene står i `app.config.ts` (`STORE_FRIEND_LINK_PATH_PREFIXES`), og
# `applinks-proof.test.js` holder lista her i takt med den.

ANDROID_APPLINKS_HOST=tornygolf.no
ANDROID_APPLINKS_ALLOWED='pathPrefix:/venner/legg-til/ pathPrefix:/en/venner/legg-til/'

android_applinks_rules() {
  local file=$1 host spec want bad=0 seen=' ' missing=''
  while IFS=' ' read -r host spec; do
    [ -n "$host" ] || continue
    # Vertsnavn skiller ikke store og små bokstaver.
    host=$(printf '%s' "$host" | tr '[:upper:]' '[:lower:]')
    case "$host" in
      "$ANDROID_APPLINKS_HOST")
        case " $ANDROID_APPLINKS_ALLOWED " in
          *" $spec "*)
            seen="$seen$spec "
            say "      autoVerify: $host $spec (venne-lenka)"
            ;;
          *)
            bad=$((bad + 1))
            say "      autoVerify: $host $spec (ikke venne-lenka)"
            ;;
        esac
        ;;
      *."$ANDROID_APPLINKS_HOST")
        bad=$((bad + 1))
        say "      autoVerify: $host $spec (underdomene)"
        ;;
      @*)
        bad=$((bad + 1))
        say "      autoVerify: $host $spec (ressursreferanse som ikke kan leses her, regnes som $ANDROID_APPLINKS_HOST)"
        ;;
      *)
        say "      autoVerify: $host $spec (ikke $ANDROID_APPLINKS_HOST)"
        ;;
    esac
  done < <(sed -n 's/^autoverify-path=//p' "$file")

  for want in $ANDROID_APPLINKS_ALLOWED; do
    case "$seen" in
      *" $want "*) ;;
      *) missing="$missing $want" ;;
    esac
  done

  if [ "$bad" != "0" ]; then
    fail "$bad autoVerify-claim(er) for $ANDROID_APPLINKS_HOST utenfor venne-lenka. Bare $ANDROID_APPLINKS_ALLOWED er lov (#2627)"
  elif [ -n "$missing" ]; then
    fail "autoVerify for venne-lenka mangler:$missing. Uten den åpner ikke lenka appen på Android (#2627)"
  else
    pass "autoVerify bare for venne-lenka ($ANDROID_APPLINKS_HOST $ANDROID_APPLINKS_ALLOWED)"
  fi
}
