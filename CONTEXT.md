# Finanze personali

Dominio della gestione delle finanze personali del proprietario.

## Language

**Proprietario**:
La persona che usa l'app esclusivamente per gestire le proprie finanze personali, non quelle di altri utenti.
_Avoid_: Cliente, account

**Spesa**:
Un pagamento per beni o servizi del proprietario, anche in contanti. La spesa e il movimento bancario che la rappresenta si riferiscono allo stesso pagamento.
_Avoid_: Movimento bancario come sinonimo di spesa

**Spesa manuale**:
Una spesa registrata dal proprietario, sia per pagamenti senza movimento bancario sia per pagamenti non ancora ricevuti dalla banca.
_Avoid_: Spesa extra

**Movimento bancario**:
Una registrazione di entrata o uscita sul conto comunicata dalla banca. Non identifica necessariamente una spesa.
_Avoid_: Spesa come sinonimo di qualsiasi uscita bancaria

**Riconciliazione**:
L'associazione tra una spesa manuale e il movimento bancario riferito allo stesso pagamento, che viene conteggiato una sola volta. Le corrispondenze dubbie richiedono conferma del proprietario.
_Avoid_: Duplicazione, seconda spesa

**Categoria di spesa**:
Una classificazione modificabile dal proprietario che raggruppa spese della stessa natura, come Alimentari o Trasporti. Nella prima versione una spesa puo avere una sola categoria assegnata, senza suddivisioni dell'importo tra categorie.
_Avoid_: Categoria bancaria

**Regola di categorizzazione**:
Un criterio che associa automaticamente una categoria alle spese in base all'esercente o alla descrizione. Il proprietario conserva la possibilita di correggere la categoria di una singola spesa.
_Avoid_: Suggerimento come sinonimo di assegnazione automatica

**Da categorizzare**:
Lo stato di una spesa senza categoria assegnata, anche quando nessuna regola di categorizzazione trova corrispondenza.
_Avoid_: Altro come sinonimo di categoria non assegnata

**Periodo di analisi**:
L'intervallo temporale scelto dal proprietario per analizzare le proprie finanze, delimitato da una data iniziale e una data finale.
_Avoid_: Periodo di sincronizzazione

**Storico disponibile**:
L'insieme dei movimenti recuperabili dal proprietario, senza un limite prefissato agli ultimi dodici mesi. Non implica che siano disponibili tutti i movimenti dall'apertura del conto.
_Avoid_: Storico completo garantito

**Copertura dei dati**:
L'estensione dei periodi per cui sono disponibili informazioni sulle finanze del proprietario, con eventuali lacune. Un periodo privo di dati non equivale a un periodo senza spese.
_Avoid_: Zero spese come sinonimo di dati mancanti

**Data dell'operazione**:
La data in cui viene effettuato il pagamento o l'operazione bancaria. Determina il periodo di analisi a cui appartiene la registrazione; in sua assenza si usa la data di contabilizzazione.
_Avoid_: Data di importazione, data valuta

**Data di contabilizzazione**:
La data in cui la banca registra contabilmente il movimento, che puo essere successiva alla data dell'operazione.
_Avoid_: Data dell'operazione come sinonimo

**Entrata**:
Un incasso del proprietario riconosciuto come reddito, come lo stipendio o gli interessi. Non identifica necessariamente qualsiasi movimento bancario in accredito.
_Avoid_: Accredito bancario come sinonimo di entrata

**Rimborso**:
Una restituzione totale o parziale di un pagamento, che riduce le spese della categoria originale nel periodo della propria data dell'operazione. Non costituisce un'entrata e non modifica il periodo dell'acquisto originale.
_Avoid_: Reddito, cancellazione dell'acquisto

**Spesa netta**:
Il totale delle spese meno i rimborsi riferiti al periodo di analisi, anche per una singola categoria. Puo essere negativo se i rimborsi del periodo superano le spese.
_Avoid_: Totale uscite registrate

**Risultato del periodo**:
La differenza tra il totale delle entrate e la spesa netta nel periodo di analisi. Non rappresenta il denaro presente sul conto bancario.
_Avoid_: Saldo bancario, risparmio garantito

**Saldo bancario**:
L'importo che la banca comunica come saldo di un conto in un determinato momento.
_Avoid_: Risultato del periodo

**Prelievo di contanti**:
Un'uscita dal conto bancario con cui il proprietario ottiene denaro contante. Non coincide con un successivo acquisto effettuato con quel denaro.
_Avoid_: Acquisto in contanti

**Trasferimento tra conti propri**:
Uno spostamento di denaro tra due conti del proprietario, distinto da un pagamento per beni o servizi.
_Avoid_: Spesa per beni o servizi

**Totale uscite registrate**:
La somma delle uscite bancarie, inclusi prelievi e trasferimenti tra conti propri, e delle spese manuali non riconciliate con un addebito dello stesso pagamento. Un prelievo di 100 EUR e una successiva cena in contanti da 30 EUR contribuiscono per 130 EUR: questo totale non misura le sole spese effettive.
_Avoid_: Totale spese effettive, diminuzione del patrimonio