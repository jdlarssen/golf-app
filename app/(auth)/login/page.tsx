import { signIn } from './actions';

type SearchParams = Promise<{
  error?: string | string[];
  next?: string | string[];
}>;

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Feil e-post eller passord.',
  unknown: 'Noe gikk galt. Prøv igjen.',
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const errorCode = first(params.error);
  const next = first(params.next) ?? '';
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  return (
    <main className="min-h-screen bg-gray-50 px-4">
      <div className="max-w-sm mx-auto mt-16 p-6 bg-white rounded-lg shadow">
        <h1 className="text-2xl font-semibold mb-6 text-center">Logg inn</h1>

        {errorMessage && (
          <div
            role="alert"
            className="bg-red-50 border border-red-200 text-red-700 p-3 rounded mb-4 text-sm"
          >
            {errorMessage}
          </div>
        )}

        <form action={signIn} className="space-y-4">
          <input type="hidden" name="next" value={next} />

          <div>
            <label htmlFor="email" className="text-sm font-medium text-gray-700">
              E-post
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full border rounded px-3 py-2 mt-1"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="text-sm font-medium text-gray-700"
            >
              Passord
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full border rounded px-3 py-2 mt-1"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-green-600 text-white py-2 rounded font-medium mt-4 hover:bg-green-700 transition-colors"
          >
            Logg inn
          </button>
        </form>

        <p className="text-xs text-gray-400 mt-6 text-center">
          Har du fått invitasjon? Klikk lenken i mailen for å registrere deg.
        </p>
      </div>
    </main>
  );
}
