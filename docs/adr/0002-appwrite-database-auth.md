# Database e autenticazione su Appwrite

Su richiesta del proprietario sostituiamo Supabase con Appwrite per database e autenticazione. La decisione precedente sulle passkey Supabase e superata: usiamo SimpleWebAuthn, challenge monouso e token personalizzati Appwrite, mantenendo TOTP obbligatorio anche dopo un login passkey per non considerare automaticamente una sessione personalizzata equivalente a una sessione MFA.

## Conseguenze

I record finanziari sono nella tabella privata `records`, senza permessi client, e passano esclusivamente dalle API Next.js dopo la verifica server di proprietario, email e fattori della sessione. Questo sostituisce le policy PostgreSQL RLS con un confine server esplicito; la chiave amministrativa non puo essere esposta al browser. Payload JSON e indici per entita mantengono il modello attuale e transazioni Appwrite proteggono importazioni, riconciliazioni e rinomina categorie, ma non offrono i vincoli SQL precedenti: le validazioni risiedono nel modulo delle operazioni sui dati.

Non risultava configurato un archivio Supabase con dati da trasferire. Login, TOTP, archivio e passkey con autenticatore virtuale sono stati verificati contro Appwrite con utenti sintetici eliminati. I codici di recupero MFA sono disabilitati perche il progetto Appwrite li ha rifiutati con `user_invalid_token`; resta il backup Authenticator e il ripristino amministrativo documentato, senza disabilitare la verifica MFA dei dati.