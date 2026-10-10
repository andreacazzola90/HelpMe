# Prima versione: finanze personali

Requisiti confermati dal proprietario al termine della sessione di chiarimento. La prima versione locale e implementata; configurazione e verifiche sui servizi reali restano necessarie prima del deploy operativo. La guida di attivazione e in [README.md](../README.md).

## Ambito

- Uso esclusivamente personale, senza registrazione pubblica.
- Conto Fineco, saldo e dettagli disponibili dei movimenti di conto e dei pagamenti.
- Portafoglio titoli, posizioni e valutazioni degli investimenti esclusi dalla prima versione. Eventuali movimenti relativi a investimenti presenti nell'estratto conto restano visibili.
- Nessuna disposizione di pagamenti o modifica del conto bancario.

## Accesso e pubblicazione

- Pubblicazione su Vercel con indirizzo gratuito di produzione `nome-app.vercel.app`; nome e disponibilita da verificare.
- Appwrite per database e autenticazione, in sostituzione di Supabase su richiesta del proprietario.
- Creazione del primo account dalla schermata di accesso locale con email e password, senza dover inserire prima l'email nelle variabili. Il proprietario viene salvato nel database e le registrazioni successive restano chiuse; conferma email e attivazione MFA prima dell'accesso ai dati. Sul deploy pubblico la prima email va preautorizzata se non e gia stato creato il proprietario.
- Email e password con secondo fattore tramite app Authenticator.
- Passkey come accesso alternativo, con possibile verifica biometrica sul dispositivo o PIN, senza raccolta di dati biometrici nell'app.
- Passkey WebAuthn tramite token personalizzato Appwrite; Authenticator richiesto anche dopo il login passkey. Percorso email, password e Authenticator mantenuto disponibile.
- Accesso ai dati riservato al proprietario e protetto anche nel database e nelle API, non soltanto nell'interfaccia.
- Dominio di produzione stabile per le passkey; non usare i domini temporanei delle anteprime.

## Acquisizione dei dati

- Enable Banking come prima scelta, subordinata alla verifica del supporto effettivo del conto Fineco.
- Sincronizzazione giornaliera dei nuovi movimenti tramite API quando il collegamento e il consenso lo consentono.
- Importazione manuale CSV come alternativa e per integrare lo storico non disponibile via API; nessun download automatizzato dall'home banking.
- Recuperare tutto lo storico disponibile, senza limite iniziale di dodici mesi e senza promessa di completezza.
- Distinguere periodi senza dati da periodi con zero spese.
- Evitare duplicati tra importazioni API e CSV e conservare le correzioni del proprietario durante gli aggiornamenti.
- Non conservare le credenziali di accesso a Fineco.

## Spese e categorie

- Inserimento manuale di spese in contanti e pagamenti in attesa dell'addebito bancario.
- Riconciliazione tra spesa manuale e addebito dello stesso pagamento: conteggio unico e conferma del proprietario nei casi dubbi.
- Categorizzazione automatica mediante regole basate su esercente o descrizione, con categorie e assegnazioni correggibili.
- Spese non riconosciute nello stato "Da categorizzare".
- Una sola categoria per spesa nella prima versione, senza suddivisione dell'importo.
- Rimborsi come riduzioni della spesa nella categoria originale alla data del rimborso, non come reddito e senza modificare il periodo dell'acquisto.

## Analisi

- Selezione del periodo tramite date, con intervalli rapidi e date iniziale/finale; nessuna richiesta in linguaggio naturale nella prima versione.
- Spese per categoria, andamento temporale, entrate e confronto entrate/spese.
- Risultato del periodo calcolato come entrate meno spesa netta, distinto dal saldo bancario.
- Totale uscite registrate distinto dalle spese effettive: include prelievi, trasferimenti tra conti propri e spese manuali non riconciliate.
- Scelta esplicita del proprietario: prelievo di 100 EUR e cena in contanti da 30 EUR producono 130 EUR di uscite registrate, pur non rappresentando 130 EUR di consumi.
- Data dell'operazione come riferimento dei grafici; data di contabilizzazione solo in sua assenza.

## Verifiche prima dell'integrazione

- Disponibilita Fineco su Enable Banking, conti e dettagli accessibili, storico e limiti di sincronizzazione effettivi.
- Applicabilita della modalita gratuita ai propri conti e dei relativi termini e quote.
- Formato CSV effettivamente esportabile da Fineco e riconoscimento dei duplicati tra fonti.
- Registrazione e uso delle passkey sul dominio definitivo e sui dispositivi fisici, dopo verifica con autenticatore virtuale.
- Configurazione del recupero dell'accesso e rinnovo del consenso bancario, senza esposizione di segreti in chat.
- Limiti e costi dei piani Vercel e Appwrite, incluso il processo pianificato giornaliero; indirizzo finale di produzione.

## Riferimenti

- [Glossario del dominio](../CONTEXT.md)
- [Decisione sull'accesso](adr/0001-accesso-personale-con-passkey.md)
- [Migrazione ad Appwrite](adr/0002-appwrite-database-auth.md)