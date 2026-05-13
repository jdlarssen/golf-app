import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';

export const metadata = {
  title: 'Personvern – Tørny',
};

export default function PrivacyPage() {
  return (
    <AppShell>
      <TopBar backHref="/" backLabel="Tilbake til hjem" kicker="Personvern" />

      <div className="space-y-8 text-sm leading-relaxed text-text">

        {/* Section 1 */}
        <section>
          <h2 className="font-serif text-xl font-medium text-text mb-3">
            Hvilke data lagrer Tørny om deg?
          </h2>
          <ul className="list-disc list-outside pl-5 space-y-1 text-text">
            <li>Navn og e-postadresse</li>
            <li>Kallenavn</li>
            <li>Handicap-indeks</li>
            <li>Scorekort og resultater fra runder du har spilt</li>
            <li>Invitasjoner du har sendt eller mottatt</li>
          </ul>
        </section>

        {/* Section 2 */}
        <section>
          <h2 className="font-serif text-xl font-medium text-text mb-3">
            Hvor lagres dataene?
          </h2>
          <p className="text-text-muted">
            Dataene lagres hos{' '}
            <span className="font-medium text-text">Supabase</span> i EU-regionen.
            Serverne befinner seg i Frankfurt, Tyskland, og er underlagt EUs
            personvernregler (GDPR).
          </p>
        </section>

        {/* Section 3 */}
        <section>
          <h2 className="font-serif text-xl font-medium text-text mb-3">
            Hvem ser dataene dine?
          </h2>
          <p className="text-text-muted mb-2">
            Andre spillere i samme turnering ser navn, kallenavn, handicap-indeks og
            spillresultatene dine.
          </p>
          <p className="text-text-muted">
            Administrator ser i tillegg e-postadressen din og kan slette deg fra
            appen.
          </p>
        </section>

        {/* Section 4 */}
        <section>
          <h2 className="font-serif text-xl font-medium text-text mb-3">
            Hvor lenge lagres dataene?
          </h2>
          <p className="text-text-muted">
            Dataene dine lagres inntil du ber om sletting via «Slett konto»-knappen
            i profilen (kommer snart), eller ber administrator slette deg fra
            appen.
          </p>
        </section>

        {/* Section 5 */}
        <section>
          <h2 className="font-serif text-xl font-medium text-text mb-3">
            Dine rettigheter
          </h2>
          <p className="text-text-muted mb-2">
            I henhold til GDPR har du rett til:
          </p>
          <ul className="list-disc list-outside pl-5 space-y-1 text-text-muted">
            <li>
              <span className="font-medium text-text">Innsyn</span> — du kan be om
              å se hvilke data vi har lagret om deg
            </li>
            <li>
              <span className="font-medium text-text">Retting</span> — du kan
              korrigere feil i profilen din
            </li>
            <li>
              <span className="font-medium text-text">Sletting</span> — du kan be
              om at dataene dine slettes
            </li>
            <li>
              <span className="font-medium text-text">Dataportabilitet</span> — du
              kan be om å få utlevert dataene dine i et maskinlesbart format
            </li>
          </ul>
        </section>

        {/* Section 6 */}
        <section>
          <h2 className="font-serif text-xl font-medium text-text mb-3">
            Kontakt
          </h2>
          <p className="text-text-muted">
            For spørsmål om personvern eller for å utøve rettighetene dine,
            send e-post til{' '}
            <a
              href="mailto:personvern@tornygolf.no"
              className="font-medium text-primary underline underline-offset-2"
            >
              personvern@tornygolf.no
            </a>
            .
          </p>
        </section>

      </div>
    </AppShell>
  );
}
