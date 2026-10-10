# HelpMe

Web app personale per movimenti Fineco, spese manuali, categorie automatiche e analisi per intervalli di date. Next.js, Supabase e collegamento in sola lettura tramite Enable Banking.

## Stato

La prima versione locale e implementata e dispone di un'anteprima isolata con dati fittizi. Deploy Vercel, progetto Supabase, autenticazione reale, passkey sul dominio definitivo e consenso Fineco richiedono configurazione e verifiche sugli account esterni; non sono attivati dalla sola presenza del codice.

## Avvio locale

Richiede Node.js 22 e npm.

```sh
npm ci
npm run dev
```

- Accesso: http://localhost:3000
- Anteprima: http://localhost:3000/demo

L'anteprima non accede a Supabase o alla banca. Le modifiche sono solo in memoria e si azzerano ricaricando la pagina. In assenza di configurazione, l'accesso reale e le API dei dati sono bloccati.

## Supabase

1. Crea un progetto Supabase, preferibilmente in una regione UE.
2. Esegui nel SQL Editor la migrazione `supabase/migrations/202610100001_finance.sql`.
3. Crea il tuo unico utente email/password dal pannello Authentication, con email confermata. Non inserire la password in script, repository o chat.
4. Disabilita nuove registrazioni pubbliche nelle impostazioni Auth, abilita Email/Password e MFA TOTP. Imposta una password robusta e configura SMTP per il recupero email in produzione.
5. Registra lo UUID del tuo utente come proprietario tramite SQL Editor:

```sql
insert into public.app_owner(user_id)
values ('UUID-DEL-TUO-UTENTE');
```

6. Imposta Site URL e Redirect URLs sul dominio di produzione; per il test locale aggiungi l'origine locale esatta.
7. Configura le variabili indicate in `.env.example` in un file locale `.env.local` e nel progetto Vercel. `OWNER_USER_ID` deve coincidere con lo UUID nella tabella `app_owner`.
8. Al primo accesso registra Authenticator e verifica il codice. Database e API richiedono il livello `aal2`, anche se il browser possiede gia una sessione.

Le tabelle delle sessioni bancarie e degli stati di autorizzazione non sono accessibili ai ruoli del browser. La chiave `SUPABASE_SERVICE_ROLE_KEY` deve restare esclusivamente sul server.

## Passkey

Abilita Passkeys nel pannello Supabase, se disponibile sul progetto. Usa come Relying Party ID il dominio gratuito di produzione esatto, ad esempio `helpme-personale.vercel.app`, e come origin `https://helpme-personale.vercel.app`. Il nome e solo un esempio: la disponibilita va verificata su Vercel.

Non usare `vercel.app` come RP ID, ne domini temporanei di preview. Le passkey vengono registrate dalla pagina Sicurezza dopo un accesso con MFA; nessun dato biometrico e raccolto dall'app. Il dispositivo puo usare biometria o PIN.

Il supporto sperimentale e accettato ma non si presume che il login passkey produca `aal2`: quando non lo produce, l'app richiede anche Authenticator. L'eliminazione di quel passaggio richiede una verifica sul progetto reale, senza indebolire le policy RLS. Il recupero della password non rimuove il secondo fattore. Conserva Authenticator in un gestore sicuro con backup; in caso di perdita completa, il ripristino del fattore va effettuato dal proprietario attraverso il pannello amministrativo Supabase protetto, seguito da una nuova registrazione.

## Enable Banking e Fineco

Il catalogo pubblico consultato il 10 ottobre 2026 elenca FinecoBank in Italia con servizio AISP. Questo non verifica disponibilita del tuo particolare conto, dettagli delle carte, storico o stabilita della connessione reale.

1. Registra un'app in ambiente Production nel pannello Enable Banking.
2. Abilita l'uso ristretto tramite "Activate by linking accounts", autorizzando soltanto i tuoi conti personali.
3. Registra come redirect `https://IL-TUO-DOMINIO/api/bank/callback`; usa un'app separata per Sandbox.
4. Imposta `ENABLE_BANKING_APP_ID` e la chiave privata PKCS8 in `ENABLE_BANKING_PRIVATE_KEY`. Sono supportati PEM multilinea o sequenze `\n`. Non condividere la chiave in chat e non inserirla nel codice client.
5. Genera localmente due valori casuali distinti da 32 byte: `BANK_SESSION_ENCRYPTION_KEY` in base64 e `CRON_SECRET`. Inseriscili direttamente nelle variabili server, senza farli transitare in chat.
6. Dalla pagina Sicurezza avvia "Collega Fineco", completa il consenso nel flusso bancario e avvia la prima sincronizzazione. La whitelisting nel pannello non sostituisce l'autorizzazione dell'app.

La prima sincronizzazione richiede lo storico piu esteso disponibile; quelle successive recuperano dal precedente aggiornamento con sette giorni di sovrapposizione. Vengono importati i movimenti contabilizzati `BOOK`, usando data operazione e, se assente, contabilizzazione. Sessioni cifrate AES-256-GCM, stato monouso con scadenza, token RSA sul server. La sincronizzazione non dispone pagamenti.

## CSV e analisi

La mappatura delle colonne e esplicita e offre anteprima ed errori di riga. Supporta importo con segno oppure colonne separate entrata/uscita, date ISO o `gg/mm/aaaa`, importi italiani o internazionali. Il formato esatto dei file Fineco non e ancora verificato su un'esportazione reale.

Per incrociare CSV e API seleziona lo stesso conto collegato. Il conto CSV provvisorio `fineco` non viene automaticamente associato a uno specifico conto autorizzato: collega prima Fineco se prevedi di usare entrambe le fonti. Riferimenti esterni e impronte di conto/data/descrizione/importo/valuta/occorrenza evitano reimportazioni esatte. Descrizioni diverse o esportazioni parziali senza riferimenti affidabili possono richiedere un controllo manuale: non e garantita una deduplicazione universale.

Una correzione manuale della categoria resta bloccata contro la riapplicazione delle regole. Le regole non riconosciute lasciano la spesa da categorizzare; prelievi, giroconti e rimborsi chiaramente descritti vengono distinti dalle spese ordinarie, ma il tipo puo essere corretto.

Il totale uscite registrate include prelievi, trasferimenti e contanti: 100 EUR prelevati e 30 EUR di cena danno 130 EUR. La spesa netta e invece 30 EUR. I rimborsi riducono la categoria originale nel proprio periodo; entrate meno spese nette e distinto dal saldo bancario. I grafici usano giorni per intervalli brevi, mesi per intervalli piu lunghi e anni per storici oltre vent'anni. Le analisi aggregano EUR; altre valute rimangono memorizzate senza conversione implicita.

Limiti della prima versione: file CSV da 1,5 MB, 10.000 movimenti per importazione/sincronizzazione, 50.000 movimenti caricati nella vista complessiva. CSV non attesta copertura completa dello storico.

## Vercel

Importa il repository nel tuo account Vercel come progetto Next.js oppure usa la CLI autenticata. Usa il dominio gratuito definitivo per `APP_URL`, Supabase e i redirect Enable Banking. Configura tutte le variabili dell'esempio e ridistribuisci: quelle `NEXT_PUBLIC_*` sono incorporate nella build; tutte le altre restano server-only.

`vercel.json` programma una chiamata giornaliera a `/api/cron` alle 06:00 UTC. Il percorso richiede `Authorization: Bearer CRON_SECRET`, che Vercel aggiunge usando la variabile del progetto. Il cron si attiva soltanto in produzione. Su Hobby l'esecuzione giornaliera e supportata, ma puo avvenire entro la relativa finestra oraria; non e garantita precisione al minuto. Il codice non viene pubblicato automaticamente da questa guida.

Enable Banking e gratuito per uso personale entro i suoi termini e quote; uso commerciale richiede un contratto. Vercel Hobby e Supabase Free sono candidati per partire senza canone, non una garanzia di costo zero o disponibilita continua: verifica quote, durata delle funzioni, SMTP, eventuale sospensione del database inattivo e politiche correnti. Un primo storico esteso potrebbe superare il tempo della funzione e richiedere importazioni CSV piu piccole.

## Verifica

```sh
npm test
npm run typecheck
npm run build
```

Per i test browser dell'anteprima avvia prima il server locale, quindi esegui in un altro terminale:

```sh
npx playwright install chromium
npm run test:browser
```

I test browser includono un controllo specifico dell'ambiente senza configurazione Supabase; quel controllo va eseguito prima di impostare le credenziali reali. `TEST_APP_URL` consente di cambiare l'indirizzo del server di test. Le catture desktop e mobile vengono salvate in `test-results/`, escluso dal repository.

I test coprono calcoli, rimborsi, date, CSV, token bancario e migrazione/RLS su PostgreSQL locale tramite PGlite. I flussi dell'anteprima sono stati verificati nel browser su desktop e mobile. Login reale, consenso Fineco, passkey hardware e cron in produzione richiedono i progetti esterni configurati.

## Fonti

- [Enable Banking: API](https://enablebanking.com/docs/api/reference/)
- [Enable Banking: uso dei propri conti](https://enablebanking.com/docs/api/linked-accounts/)
- [Enable Banking: termini e gratuita](https://enablebanking.com/terms/)
- [Supabase: passkey](https://supabase.com/docs/guides/auth/passkeys)
- [Supabase: MFA](https://supabase.com/docs/guides/auth/auth-mfa)
- [Vercel: cron e piani](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Requisiti](docs/REQUISITI.md)
- [Glossario](CONTEXT.md)