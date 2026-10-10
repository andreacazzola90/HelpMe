# Accesso personale con passkey sperimentali

Per l'app a uso esclusivamente personale scegliamo email e password con secondo fattore TOTP tramite Supabase Auth, mantenendo questo percorso disponibile anche quando non si puo usare una passkey. Accettiamo nella prima versione le passkey di Supabase come accesso alternativo, nonostante il supporto sperimentale, per consentire l'autenticazione tramite il dispositivo senza raccogliere dati biometrici; il dispositivo puo usare biometria o PIN.

## Conseguenze

L'abilitazione delle passkey resta subordinata alla verifica dell'accesso protetto a database e API: una sessione ottenuta con passkey non va considerata automaticamente equivalente a una sessione con secondo fattore verificato. Le modifiche alle API sperimentali possono richiedere manutenzione; il percorso email, password e TOTP deve restare funzionante.

Per evitare l'acquisto di un dominio usiamo un indirizzo gratuito di produzione `nome-app.vercel.app`, il cui nome esatto resta da scegliere e verificare. Le passkey sono legate al dominio di registrazione (Relying Party ID): manterremo stabile questo indirizzo, senza registrarle sui domini temporanei delle anteprime Vercel. Cambiarlo rende inutilizzabili le passkey esistenti e richiede una nuova registrazione.

## Fonti

- [Supabase: passkey authentication](https://supabase.com/docs/guides/auth/passkeys)
- [Supabase: multi-factor authentication](https://supabase.com/docs/guides/auth/auth-mfa)

Documentazione consultata il 10 ottobre 2026. Questa decisione non attesta che l'integrazione sia stata implementata o verificata.