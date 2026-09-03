// native/app/src/screens/EditProfile.tsx
// Native #1906: skjemaet bak «Rediger profil» — navn, kallenavn, handicap,
// kjønn og spillerklasse.
//
// **Skjermen skriver ikke selv, den spør.** Webbens `updateProfile` gjør TO
// ting: oppdaterer raden OG kaller `recomputeCourseHandicapForUser`, som
// skriver om de FROSNE banehandicapene i spill som allerede er i gang. Den
// jobben er service-role, og en telefon kan aldri holde den nøkkelen. Skrev
// appen `users` direkte, ville vi gjentatt Ryder Cup 2026-feilen: en spiller
// rettet et glemt plusshandicap-fortegn, spillene beholdt gammel CH, og han
// fikk fem slag for mye i tre aktive kamper. Derfor går lagringen gjennom
// `saveProfile` → `PUT /api/profile`, samme mønster som konto-sletting (#1876)
// og purring (#1889).
//
// **Skjermen kjenner ingen valideringsregel.** Grensene (0–54, plusshandicap
// ned til −10), enum-listene og rekkefølgen på sjekkene bor i
// `lib/users/profileInput.ts` — ett regel-hjem (AGENTS trap 4). Her sendes RÅ
// input, akkurat slik spilleren skrev den (norsk komma og alt), og svaret
// oversettes til en setning av `describeProfileSaveFailure`. Chip-etikettene
// under speiler parserens verdier ('mens'/'ladies', 'junior'/'normal'/
// 'senior') slik webbens skjema også gjør; parseren er fortsatt fasiten, og en
// verdi den ikke kjenner blir avvist der.
//
// **Lagring krever nett — den legges ALDRI i sync-køen.** En profilendring har
// ingen lokal-først-vei: regelen som må kjøre (recompute av frosne
// banehandicap) kjøres på serveren, så en køet endring ville ligget og latet
// som om den var lagret mens spillene fortsatt regnet på det gamle tallet.
// Uten nett stopper `saveProfile` med `offline`, og copyen sier at lagring
// krever tilkobling.
//
// **Recompute skjer på serveren, ikke her.** Appens cachede spill-bundle viser
// derfor det gamle banehandicapet til neste henting — GameHome henter på nytt
// ved fokus, så det retter seg av seg selv når spilleren går inn i runden.
//
// **Raden hentes av skjermen selv** (`fetchOwnProfile`), ikke sendt med som
// ruteparameter fra profil-rommet: samme funksjon, ingen duplisert lesning, og
// skjemaet kan ikke åpnes med et halvgammelt eller manglende øyeblikksbilde.
// Raden MÅ være lastet før feltene tegnes — «er noe endret?» finnes ikke uten
// et utgangspunkt, og uten det spørsmålet er «Lagre» bare en knapp som gjetter.
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { fetchOwnProfile, saveProfile } from '../data/profile';
import { PROFILE_TEXT, describeProfileSaveFailure } from '../lib/profileCopy';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { FONTS, TAP, useTheme } from '../theme';
import { fromSignedHcp } from '../../../../lib/handicap/sign';
import type { Gender, Level } from '../../../../lib/users/profileInput';

/**
 * Kjønn og spillerklasse — verdiene parseren godtar, med husets etiketter.
 *
 * Typene kommer fra parseren, ikke fra literalene her. Uten den bindingen ville
 * en skrivefeil i én av de fem strengene passert `tsc`, lint og jest, og først
 * dukket opp som et 400 spilleren ikke kommer forbi: chipen ser valgt ut, men
 * serveren avviser verdien. Nå faller `tsc` i stedet.
 */
const GENDER_OPTIONS: readonly { value: Gender; label: string }[] = [
  { value: 'mens', label: PROFILE_TEXT.genderMale },
  { value: 'ladies', label: PROFILE_TEXT.genderFemale },
];
const LEVEL_OPTIONS: readonly { value: Level; label: string }[] = [
  { value: 'junior', label: PROFILE_TEXT.levelJunior },
  { value: 'normal', label: PROFILE_TEXT.levelAdult },
  { value: 'senior', label: PROFILE_TEXT.levelSenior },
];

/** Spillerklasse når raden ikke har en — samme default som parseren bruker. */
const DEFAULT_LEVEL: Level = 'normal';

/**
 * Raden kommer fra databasen som løse strenger, og skjemaet jobber med
 * parserens unioner. Disse to smalner den ned — og gjør det TRYGT: en verdi
 * kolonnen har, men chip-radene ikke kjenner (en gammel klasse, en skrivefeil
 * fra en tidligere flate), ville ellers ligget usynlig i skjemaet og blitt sendt
 * inn igjen ved neste lagring, hvorpå serveren avviste den med en feil
 * spilleren ikke kunne rette. Nå faller den tilbake til «ikke valgt» / default,
 * og spilleren ser hva som faktisk står.
 *
 * Eksportert fordi de er REGLER, ikke hjelpere — «hva godtar skjemaet» hører
 * hjemme i en Type A-test, ikke bak nok en render.
 */
export function asGender(value: string | null): Gender | null {
  return GENDER_OPTIONS.some((o) => o.value === value) ? (value as Gender) : null;
}

export function asLevel(value: string | null): Level {
  return LEVEL_OPTIONS.some((o) => o.value === value) ? (value as Level) : DEFAULT_LEVEL;
}

/**
 * Feltene slik de så ut da skjemaet åpnet.
 *
 * Sammenligningsgrunnlaget for «Lagre», og ingenting annet: den lagrede raden
 * i seg selv er uinteressant her, det er avstanden fra den som avgjør om
 * knappen skal være trykkbar.
 */
interface FormValues {
  name: string;
  nickname: string;
  /** Handicap som MAGNITUDE-tekst, uten fortegn — plusshandicap er `isPlus`. */
  magnitude: string;
  isPlus: boolean;
  /** `null` = ikke valgt, og da lar serveren verdien på raden stå (#1064). */
  gender: Gender | null;
  level: Level;
}

/**
 * Lagret rad → feltverdier.
 *
 * Handicapet ligger SIGNERT i databasen (plusshandicap er negativt), men
 * feltet tar en magnitude og en egen «+»-knapp — spilleren skal slippe å taste
 * fortegn på mobil. `fromSignedHcp` eier den oversettelsen for hele repoet, og
 * gjentas ikke her.
 *
 * Tallet vises med norsk komma fordi feltet skrives med et norsk tastatur.
 * Parseren tar imot begge deler, så «12,4» og «12.4» lagres likt.
 */
function valuesFrom(profile: {
  name: string | null;
  nickname: string | null;
  hcpIndex: number | null;
  gender: string | null;
  level: string | null;
}): FormValues {
  const hcp = profile.hcpIndex;
  const split = hcp != null ? fromSignedHcp(hcp) : null;
  return {
    name: profile.name ?? '',
    nickname: profile.nickname ?? '',
    magnitude: split ? String(split.magnitude).replace('.', ',') : '',
    isPlus: split?.isPlus ?? false,
    gender: asGender(profile.gender),
    level: asLevel(profile.level),
  };
}

export function EditProfile({ navigation }: ScreenProps<'EditProfile'>) {
  const { userId, email } = useSession();
  const { colors, ui } = useTheme();

  const [initial, setInitial] = useState<FormValues | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [values, setValues] = useState<FormValues | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOwnProfile(userId)
      .then((row) => {
        if (cancelled) return;
        const start = valuesFrom(row);
        setInitial(start);
        setValues(start);
      })
      .catch((err: unknown) => {
        console.error('[EditProfile] profiloppslag feilet', err);
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  /** Ett felt om gangen, uten å miste de andre. */
  const setField = useCallback(<K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((current) => (current ? { ...current, [key]: value } : current));
  }, []);

  /**
   * Trykket på «Lagre».
   *
   * `pending` nullstilles i ALLE grener, også den vellykkede: skjermen er
   * fortsatt montert i det øyeblikket, og en knapp som blir stående på
   * «Lagrer …» leser som at appen hang hvis navigeringen skulle utebli.
   */
  const onSave = useCallback(() => {
    if (!values) return;
    setPending(true);
    setError(null);
    void saveProfile({
      // RÅ input: parseren på serveren trimmer, tolker komma og avgjør. Appen
      // speiler ingen av de reglene.
      name: values.name,
      // Tomt kallenavn er `null`, ikke en tom streng — kolonnen er nullbar.
      nickname: values.nickname.trim() === '' ? null : values.nickname,
      hcpIndex: values.magnitude,
      hcpPlus: values.isPlus,
      gender: values.gender,
      level: values.level,
    })
      .then((result) => {
        setPending(false);
        if (result.ok) {
          // Tilbake til rommet med kvitteringen. Rommet viser banneret og
          // henter raden på nytt — det er der den nye verdien skal leses.
          navigation.navigate('Profile', { saved: true });
          return;
        }
        setError(describeProfileSaveFailure(result.reason));
      })
      .catch((err: unknown) => {
        console.error('[EditProfile] lagring kastet', err);
        setPending(false);
        setError(describeProfileSaveFailure('update_failed'));
      });
  }, [navigation, values]);

  if (loadFailed) {
    return (
      <ScrollView contentContainerStyle={ui.scroll} testID="edit-profile-screen">
        <Text style={ui.error} testID="edit-profile-load-error">
          {PROFILE_TEXT.loadFailedNote}
        </Text>
      </ScrollView>
    );
  }

  if (!values || !initial) {
    return (
      <View style={ui.centered} testID="edit-profile-loading">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // Webbens `dirty`, felt for felt. Trimmet på tekstfeltene: et mellomrom på
  // slutten er ikke en endring parseren ville lagret uansett.
  const dirty =
    values.name.trim() !== initial.name.trim() ||
    values.nickname.trim() !== initial.nickname.trim() ||
    values.magnitude.trim() !== initial.magnitude.trim() ||
    values.isPlus !== initial.isPlus ||
    values.gender !== initial.gender ||
    values.level !== initial.level;

  // Ekkoet under handicap-feltet — sikkerhetsnettet mot et stille feil-oppsett.
  // Det speiler det spilleren nettopp tastet (med norsk komma), i stedet for å
  // formatere om: `formatGolfboxHcp` på web går veien om `Intl`, og Hermes har
  // ikke ICU-dataene (samme grunn som `formatHcpNb` gir i `profileCopy.ts`).
  //
  // Gaten er NUMERISK, ikke «feltet er ikke tomt» — webben gjør det samme
  // (`ProfileFormBody` regner `Number.isFinite(parseFloat(...))`). Med en
  // tom-streng-gate ville «,» gitt «Lagres som +, · plusshandicap», og «0»
  // gitt «Lagres som +0» — som er direkte usant: `toSignedHcp` lagrer 0 for
  // magnitude 0 nettopp for å unngå −0, så det er ikke et plusshandicap.
  const typedMagnitude = values.magnitude.trim().replace('.', ',');
  const magnitudeNum = Number.parseFloat(typedMagnitude.replace(',', '.'));
  const plusEcho =
    values.isPlus && Number.isFinite(magnitudeNum)
      ? `${PROFILE_TEXT.savedAsPrefix} ${
          magnitudeNum === 0 ? typedMagnitude : `+${typedMagnitude}`
        } ${PROFILE_TEXT.savedAsSuffix}`
      : null;

  return (
    <ScrollView contentContainerStyle={ui.scroll} testID="edit-profile-screen">
      <Text style={ui.label}>{PROFILE_TEXT.nameLabel}</Text>
      <TextInput
        style={ui.input}
        value={values.name}
        onChangeText={(text) => setField('name', text)}
        autoCapitalize="words"
        autoComplete="name"
        placeholderTextColor={colors.muted}
        testID="edit-profile-name"
      />

      <Text style={ui.label}>{PROFILE_TEXT.nicknameLabel}</Text>
      <TextInput
        style={ui.input}
        value={values.nickname}
        onChangeText={(text) => setField('nickname', text)}
        placeholder={PROFILE_TEXT.nicknamePlaceholder}
        placeholderTextColor={colors.muted}
        testID="edit-profile-nickname"
      />

      <Text style={ui.label}>{PROFILE_TEXT.handicapLabel}</Text>
      {/* «+»-knappen er en chip og IKKE en `Switch`: en bryter ville lest som
          en innstilling ved siden av feltet, og den tar dessuten ikke imot
          injiserte tapp fra simulator-verktøyet — flyten hadde blitt umulig å
          klikke gjennom autonomt. Webben har samme knapp. */}
      <View style={styles.hcpRow}>
        <Chip
          label="+"
          accessibilityLabel={PROFILE_TEXT.plusHandicapLabel}
          selected={values.isPlus}
          onPress={() => setField('isPlus', !values.isPlus)}
          style={styles.plusChip}
          testID="edit-profile-hcp-plus"
        />
        <TextInput
          style={[ui.input, ui.num, styles.hcpInput]}
          value={values.magnitude}
          onChangeText={(text) => setField('magnitude', text)}
          keyboardType="decimal-pad"
          placeholderTextColor={colors.muted}
          testID="edit-profile-hcp"
        />
      </View>
      {plusEcho ? (
        <Text style={ui.muted} testID="edit-profile-hcp-echo">
          {plusEcho}
        </Text>
      ) : null}

      <Text style={ui.sectionTitle}>{PROFILE_TEXT.golfProfileLabel}</Text>

      <Text style={ui.label}>{PROFILE_TEXT.genderLegend}</Text>
      <View style={styles.chipRow}>
        {GENDER_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={values.gender === option.value}
            onPress={() => setField('gender', option.value)}
            testID={`edit-profile-gender-${option.value}`}
          />
        ))}
      </View>
      <Text style={ui.muted}>{PROFILE_TEXT.genderHint}</Text>

      <Text style={ui.label}>{PROFILE_TEXT.levelLegend}</Text>
      <View style={styles.chipRow}>
        {LEVEL_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={values.level === option.value}
            onPress={() => setField('level', option.value)}
            testID={`edit-profile-level-${option.value}`}
          />
        ))}
      </View>
      <Text style={ui.muted}>{PROFILE_TEXT.levelHint}</Text>

      {/* Adressen byttes ikke herfra på noen av flatene — den står her fordi
          spilleren skal slippe å lure på hvor den gjøres. */}
      {email ? (
        <Text style={[ui.muted, styles.emailLine]} testID="edit-profile-email">
          {`${email} · ${PROFILE_TEXT.emailLine}`}
        </Text>
      ) : null}

      <Pressable
        style={[ui.button, (!dirty || pending) && styles.buttonOff]}
        disabled={!dirty || pending}
        accessibilityState={{ disabled: !dirty || pending }}
        onPress={onSave}
        testID="edit-profile-save"
      >
        <Text style={ui.buttonText}>
          {pending ? PROFILE_TEXT.savePending : PROFILE_TEXT.saveButton}
        </Text>
      </Pressable>

      {/* Uten denne linja leser en grå «Lagre» som en ødelagt knapp. */}
      {!dirty ? (
        <Text style={ui.muted} testID="edit-profile-save-hint">
          {PROFILE_TEXT.saveHint}
        </Text>
      ) : null}

      {error ? (
        <Text style={ui.error} testID="edit-profile-error">
          {error}
        </Text>
      ) : null}
    </ScrollView>
  );
}

/**
 * Én valgbar chip — kjønn, spillerklasse og plusshandicap-knappen.
 *
 * Egen komponent her og ikke i `components/`: ingen annen flate har chips ennå,
 * og en delt primitiv før den har to kallere er et gjett om formen den skal ha.
 * Flyttes når nummer to dukker opp.
 */
function Chip({
  label,
  selected,
  onPress,
  style,
  testID,
  accessibilityLabel,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /**
   * Leses av skjermleser i stedet for `label`. Finnes for plusschipen, som er
   * et enslig «+» — «pluss, knapp» sier ingenting om hva den gjør. Webbens
   * tilsvarende knapp har samme etikett (`aria-label`).
   */
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      testID={testID}
      style={[
        styles.chip,
        {
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: selected ? colors.primary : colors.surface,
        },
        style,
      ]}
    >
      <Text style={[styles.chipText, { color: selected ? colors.onPrimary : colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hcpRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hcpInput: { flex: 1 },
  // Kvadratisk: knappen bærer ett tegn, og et bredt felt ved siden av et
  // ett-tegns ord ville sett ut som to like felter.
  plusChip: { minWidth: TAP, paddingHorizontal: 0 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: TAP,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontSize: 15, fontFamily: FONTS.sansMedium },
  emailLine: { marginTop: 16 },
  buttonOff: { opacity: 0.4 },
});
