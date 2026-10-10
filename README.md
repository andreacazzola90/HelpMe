# HelpMe

Web app personale per movimenti Fineco, spese manuali, categorie automatiche e analisi per intervalli di date. Next.js, Appwrite e collegamento in sola lettura tramite Enable Banking.

## Stato

Database e autenticazione sono migrati ad Appwrite. Nel progetto configurato sono stati creati database `helpme`, tabella privata `records`, categorie e regole iniziali. Archivio, transazioni, login, attivazione TOTP e accesso passkey sono stati verificati su Appwrite usando utenti e dati sintetici poi eliminati. Restano la creazione del tuo account, conferma email, passkey sul dominio definitivo, consenso Fineco e deploy Vercel.

## Avvio locale

Richiede Node.js 22 e npm.

```sh
npm ci
npm run dev
```

- Accesso: http://127.0.0.1:3000
- Anteprima: http://127.0.0.1:3000/demo

L'anteprima non accede ad Appwrite o alla banca. Le modifiche sono solo in memoria e si azzerano ricaricando la pagina. In assenza di configurazione, l'accesso reale e le API dei dati sono bloccati.

## Appwrite

1. Inserisci in `.env.local` l'endpoint base Appwrite (es. `https://fra.cloud.appwrite.io/v1`), `APPWRITE_PROJECT_ID` e `APPWRITE_API_KEY`. Per la prima registrazione dall'app locale puoi lasciare `OWNER_EMAIL` vuoto: l'email inserita nel modulo viene salvata come proprietario nel database. Il database predefinito e `helpme`; `APPWRITE_DATABASE_ID` consente di cambiarlo. Tutte queste variabili sono server-only: nessuna chiave amministrativa passa al browser.
2. La chiave deve consentire gestione database/tabelle/colonne/indici e lettura/scrittura righe per il setup, oltre a `users.read`, `users.write` e `sessions.write` per autenticazione e passkey. Dopo il setup puoi restringere i permessi di schema, mantenendo quelli necessari a utenti, sessioni, righe e transazioni. Revoca qualsiasi chiave gia esposta e non inserirla in chat o Git.
3. Esegui `npm run appwrite:setup`. Lo script e idempotente e non crea il proprietario. Se le colonne sono ancora in preparazione, rieseguilo quando Appwrite le indica disponibili.
4. Aggiungi nelle piattaforme Web Appwrite il nome host dell'app (`localhost` per le passkey locali e il dominio Vercel definitivo per la produzione). Abilita email/password e verifica la consegna delle email di conferma e recupero; configura SMTP quando necessario per le quote e il piano scelto.
5. Imposta `APP_URL` sull'origine esatta usata nel browser e riavvia il server. Per le passkey locali usa `http://localhost:3000`, non l'indirizzo IP. In produzione usa HTTPS.
6. In sviluppo locale premi "Crea account personale" e inserisci la tua email, password di almeno 12 caratteri e conferma password. L'account viene associato al proprietario nell'archivio privato `app_owner`, salvando anche l'email; login e recupero successivi non richiedono `OWNER_EMAIL`. Dopo la creazione, l'app passa alla conferma email e non accetta altri proprietari. Se `OWNER_EMAIL` e compilato, anche la prima registrazione locale resta limitata a quell'indirizzo.
7. Conferma l'email dal link ricevuto, accedi e configura Authenticator con il QR. Nessun dato finanziario e accessibile fino alla verifica TOTP.

La prima assegnazione del proprietario senza email preimpostata e consentita soltanto in `next dev`, con `APP_URL` su localhost o indirizzo di loopback e origine della richiesta corrispondente. Sul deploy pubblico devi aver gia completato la prima attivazione locale oppure preautorizzare la tua email in `OWNER_EMAIL`; non viene permesso al primo visitatore di appropriarsi dell'app. Se l'invio della conferma email fallisce, l'account resta creato e la schermata offre "Reinvia conferma" dopo aver corretto piattaforma Web e impostazioni email Appwrite.

I record vengono salvati nella tabella `records` come entita e payload JSON. Tabella e righe non concedono permessi agli utenti del browser: soltanto il server usa la chiave amministrativa dopo aver verificato identita del proprietario, email e fattore TOTP della sessione corrente. Il cookie di sessione e HttpOnly, Secure in HTTPS, SameSite=Lax; un'associazione privata tra hash del cookie e sessione permette di riconoscere anche le sessioni ancora in attesa di MFA. Lo stato delle sessioni e verificato sul provider per rilevare revoche.

Importazioni usano identificativi deterministici e transazioni per il singolo movimento e i relativi riferimenti, evitando inserimenti doppi. Riconciliazione e rinomina categorie sono transazionali. Un'importazione estesa puo essere salvata parzialmente prima di un timeout: una ripetizione ignora i movimenti gia importati.

Non era configurato un precedente archivio Supabase, quindi non sono stati trasferiti dati finanziari esistenti. Le vecchie dipendenze e la migrazione SQL sono state rimosse. Eventuali variabili Supabase presenti nel tuo file locale non vengono usate e non sono state cancellate automaticamente.

## Passkey

Le passkey sono implementate con SimpleWebAuthn e sessioni Appwrite create tramite token personalizzato dopo la verifica della firma. Relying Party ID e origin derivano dall'hostname e dall'origine di `APP_URL`. Il dominio di produzione deve restare stabile; il suo nome e la disponibilita vanno verificati su Vercel.

Non usare `vercel.app` come RP ID, ne domini temporanei di preview. Le passkey vengono registrate dalla pagina Sicurezza dopo un accesso con MFA; nessun dato biometrico e raccolto dall'app. Il dispositivo puo usare biometria o PIN.

Challenge monouso di cinque minuti, cookie HttpOnly di associazione al browser, verifica dell'origine, user verification obbligatoria e contatore della credenziale proteggono il flusso. Il login passkey sostituisce la password ma richiede ancora Authenticator per accedere ai dati finanziari. Il flusso e stato verificato con un autenticatore virtuale Chromium contro Appwrite reale; Face ID/Touch ID su dispositivi fisici e dominio di produzione restano da provare.

Il recupero password via email non rimuove il secondo fattore. I codici di recupero MFA non sono abilitati nell'app: il progetto Appwrite configurato li ha rifiutati nei test con `user_invalid_token`. Conserva Authenticator in un gestore sicuro con backup; in caso di perdita completa usa il ripristino amministrativo dell'utente nel pannello Appwrite protetto, revoca le sessioni e registra nuovamente TOTP. Non disabilitare i controlli MFA dell'app come scorciatoia.

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

Importa il repository nel tuo account Vercel come progetto Next.js oppure usa la CLI autenticata. Usa il dominio gratuito definitivo per `APP_URL`, la piattaforma Web Appwrite e i redirect Enable Banking. Configura tutte le variabili dell'esempio e ridistribuisci. Database e autenticazione restano su Appwrite; Vercel ospita l'app e il server. Non impostare `APPWRITE_TEST_SERVER` in produzione.

`vercel.json` programma una chiamata giornaliera a `/api/cron` alle 06:00 UTC. Il percorso richiede `Authorization: Bearer CRON_SECRET`, che Vercel aggiunge usando la variabile del progetto. Il cron si attiva soltanto in produzione. Su Hobby l'esecuzione giornaliera e supportata, ma puo avvenire entro la relativa finestra oraria; non e garantita precisione al minuto. Il codice non viene pubblicato automaticamente da questa guida.

Enable Banking e gratuito per uso personale entro i suoi termini e quote; uso commerciale richiede un contratto. Vercel Hobby e Appwrite Free sono candidati per partire senza canone, non una garanzia di costo zero o disponibilita continua: verifica quote di database, righe, transazioni, utenti, funzioni e SMTP. Le importazioni richiedono richieste al provider per ogni movimento: uno storico esteso puo superare il tempo della funzione e richiedere file CSV piu piccoli.

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

I test browser coprono anteprima desktop/mobile, registrazione, passaggio MFA e rifiuto di cookie/origini non autorizzati. `TEST_APP_URL` consente di cambiare l'indirizzo del server di test. Le catture vengono salvate in `test-results/`, escluso dal repository.

`npm run test:appwrite` esegue le prove remote di archivio privato, commit/rollback e TOTP usando record e utenti sintetici poi eliminati. Richiede la configurazione del progetto; non stampa password, OTP o chiavi.

Il test completo `tests/appwrite-browser.spec.ts` verifica la prima registrazione dal modulo senza `OWNER_EMAIL`, il rifiuto di altre registrazioni, attivazione TOTP dalla UI, salvataggio movimento e registrazione/login WebAuthn con autenticatore virtuale. La conferma della casella sintetica viene simulata con l'API amministrativa; non attesta la consegna email alla tua casella. Eseguibile soltanto prima di creare un proprietario reale: non sovrascrive il proprietario esistente. Avvia un server isolato e poi il test:

```sh
APPWRITE_TEST_SERVER=1 APP_URL=http://localhost:3002 OWNER_EMAIL= npm run dev -- --port 3002
```

```sh
TEST_APP_URL=http://localhost:3002 node --env-file=.env.local node_modules/@playwright/test/cli.js test tests/appwrite-browser.spec.ts --workers=1 --reporter=list
```

Questi test non verificano la consegna di email alla tua casella, il consenso Fineco, biometria hardware o cron in produzione. Non inviare credenziali o codici in chat.

## Fonti

- [Enable Banking: API](https://enablebanking.com/docs/api/reference/)
- [Enable Banking: uso dei propri conti](https://enablebanking.com/docs/api/linked-accounts/)
- [Enable Banking: termini e gratuita](https://enablebanking.com/terms/)
- [Appwrite: sessioni SSR](https://appwrite.io/docs/products/auth/server-side-rendering)
- [Appwrite: MFA](https://appwrite.io/docs/products/auth/mfa)
- [Appwrite: token personalizzati](https://appwrite.io/docs/products/auth/custom-token)
- [Vercel: cron e piani](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Requisiti](docs/REQUISITI.md)
- [Glossario](CONTEXT.md)