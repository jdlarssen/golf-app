/**
 * Felles visnings-konstanter for spiller-velgeren (#435).
 *
 * Pending-spillere (invitert, men ikke fullført profil) har ingen `name`, så
 * velgeren brukte `email` som etikett. Den e-post-frie roster-varianten for
 * ikke-admin-flatene utelater `email` — så vi faller tilbake på denne nøytrale
 * etiketten i stedet for å lekke en e-postadresse.
 */
export const PENDING_PLAYER_LABEL = 'Invitert spiller';
