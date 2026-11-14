# AiderDesk personale - sviluppo generale

## Decisione attiva dell'utente

25 ottobre 2026, correzione esplicita ribadita dall'utente: il riferimento ai
lavori freelance era un esempio d'uso, non il limite del prodotto. Il lavoro
deve essere completo su AiderDesk e utilizzabile per sviluppo generale.
Il cloud gratuito e la prima scelta desiderata; il locale resta un fallback.
Questa fonte supera il perimetro limitato ai siti del precedente
FREELANCE-AGENT-BLUEPRINT.md, che resta come storico del banco di prova.

Ulteriore istruzione esplicita: "rimuovi tutte le restrizioni che hai imposto"
e "questo e un progetto completo per sviluppare qualsiasi cosa". L'utente
decide l'uso. Eliminare obblighi di template/stack, whitelist di linguaggi o
file e limitazioni di funzioni native introdotte nel laboratorio. Ripartire
dalle capacita complete upstream, integrando KB, gestione del contesto e
affidabilita. Le istruzioni costo0 e non modificare altri progetti durante
la costruzione restano vincoli dell'incarico, non una scelta di settore.

## Obiettivo e criteri di chiusura

- AiderDesk resta la base applicativa completa: interfaccia, progetti, chat,
  editor/review, profili e strumenti; le estensioni di sicurezza si integrano
  nel flusso invece di ridurre l'agente a tre template web.
- Lettura, ricerca, creazione e modifica di sorgenti di linguaggi diversi;
  storico/diff/ripristino restano indipendenti dai metadata Git non fidati.
- Esecuzione generale di comandi di sviluppo, test, build e diagnosi in un
  ambiente verificato del progetto, con stdout/stderr/codice uscita reali,
  cancellazione, timeout, recupero e niente accesso agli altri progetti.
- Ambiente AGENTS/skill/Serena riutilizzato dove pertinente. Serena deve
  riferirsi al progetto attivo e fornire analisi semantica reale; il vecchio
  percorso Python fisso non va esposto a progetti diversi.
- Knowledge Base compilata dal modello, selettiva e riutilizzabile tra lavori,
  legata a versioni/prove; distingue fatti osservati e interpretazioni.
- Provider cloud candidato validato per prezzo0 e limiti effettivi. Nessun
  abbonamento, ricarica o fallback a modelli pagati. Se non esiste un provider
  che garantisca tutti i vincoli, dichiararlo senza mascherare le quote.
- Fallback locale collaudato e cambio di modello controllato; la scelta
  Devstral non e definitiva e non e dimostrata superiore a Qwen Coder.
- Prove rappresentative su creazione, modifiche di codice esistente, debug,
  regressione e ripresa su piu linguaggi. La landing resta una sola prova.
- Verifica UI: file, confronto modifiche, errori conclusi, avvio/riapertura,
  conoscenza e risultato effettivamente utilizzabili dalla finestra.

## Responsabilità tecnica e continuità

L’utente decide obiettivi, requisiti e autorizzazioni. Agent-Lab è responsabile
della diagnosi, delle scelte implementative, delle correzioni, delle verifiche
e della ripresa. Il motore governa l’assegnazione ai ruoli, registra cause,
tentativi ed evidenze, cambia strategia quando una proposta fallisce e lascia
proseguire le attività indipendenti. Un errore tecnico apre lavoro di recupero
nel perimetro autorizzato. Il sistema conserva il punto di ripresa durante
interruzioni o indisponibilità di una risorsa.

Questo requisito si applica al ciclo Agent ordinario, al flusso governato,
alle code, ai subagenti, agli strumenti, alle skill e alla memoria. Il motore
può dichiarare completato un lavoro soltanto quando le prove applicabili
risultano superate sulla versione pertinente. Una prova storica resta
consultabile e una dipendenza incerta richiede indagine prima di riusare la
prova. L’integrazione già registrata resta recuperabile senza rieseguire il
lavoro. Le approvazioni di prodotto, accesso e pubblicazione seguono il
perimetro deciso dall’utente.

### Architettura dell’esecuzione

Il ciclo Agent e la coda governata riusano il runtime e gli adapter del
progetto. Gli adapter traducono le richieste del modello e i risultati dei
tool. Il motore conserva l’identità del lavoro, decide quando riprendere e
collega le prove alla versione verificata. La conclusione di un turno del
modello indica un evento di esecuzione. La consegna verificata richiede gli
esiti previsti dal piano.

Il confronto con Codex al commit
[`7194b21`](https://github.com/openai/codex/tree/7194b2177643f3c639cfc5b29f6398c545b0e7e2)
ha mostrato tre meccanismi applicabili al runtime esistente: risultati degli
strumenti reinseriti nel ciclo, esiti terminali distinti e ripresa da uno
stato persistente. Il suo App Server espone il ciclo completo via JSON-RPC.
L’SDK TypeScript avvia il binario e i provider del harness usano Responses.
Un eventuale adapter App Server si qualifica separatamente per provider
compatibili. Il registro degli adapter resta il punto d’integrazione dei
modelli già supportati da Agent-Lab.

Il motore Codex usa risultati strutturati e distingue un processo ancora
attivo da un processo terminato. Reinserisce i risultati degli strumenti
nella conversazione. I retry di trasporto, con backoff ed eventuale fallback
HTTP, sono separati dalle scelte di debugging del modello. Le istruzioni
locali vengono caricate per ambiente e gli strumenti di ricerca sono esposti
secondo le capacità del provider e le configurazioni. [Risultati dei comandi](https://github.com/openai/codex/blob/7194b2177643f3c639cfc5b29f6398c545b0e7e2/codex-rs/app-server-protocol/src/protocol/v2/item.rs#L376)
· [Retry](https://github.com/openai/codex/blob/7194b2177643f3c639cfc5b29f6398c545b0e7e2/codex-rs/core/src/responses_retry.rs#L58)
· [Istruzioni](https://github.com/openai/codex/blob/7194b2177643f3c639cfc5b29f6398c545b0e7e2/codex-rs/core/src/agents_md.rs#L59)
· [Ricerca](https://github.com/openai/codex/blob/7194b2177643f3c639cfc5b29f6398c545b0e7e2/codex-rs/core/src/tools/spec_plan.rs#L736)

La cronologia persistente, la compattazione del contesto e la continuazione
dell’obiettivo sono responsabilità distinte. Lo stop hook può riportare il
turno al modello con nuove evidenze. L’estensione Goal può avviare un altro
turno quando il thread è inattivo e l’obiettivo è ancora attivo. Agent-Lab
può usare gli stessi confini con la persistenza e gli strumenti già presenti,
tenendo la verifica del risultato nel motore governato. [Stop hook](https://github.com/openai/codex/blob/7194b2177643f3c639cfc5b29f6398c545b0e7e2/codex-rs/core/src/session/turn.rs#L808)
· [Continuazione](https://github.com/openai/codex/blob/7194b2177643f3c639cfc5b29f6398c545b0e7e2/codex-rs/ext/goal/src/runtime.rs#L434)
· [Persistenza](https://github.com/openai/codex/blob/7194b2177643f3c639cfc5b29f6398c545b0e7e2/codex-rs/thread-store/README.md)
· [Provider Responses](https://github.com/openai/codex/blob/7194b2177643f3c639cfc5b29f6398c545b0e7e2/codex-rs/model-provider-info/src/lib.rs#L110)
· [App Server](https://learn.chatgpt.com/docs/app-server)

## Vincoli invariati

Solo Agent-Lab e i deliverable della chat sono modificabili. Le installazioni
di origine e gli altri progetti restano in sola lettura. Nessun cambiamento
di fiducia Windows, PATH globale, certificati o account a pagamento.
Codice di progetto e metadata sono non fidati. Esecuzioni in ambienti separati,
segreti esclusi, accessi e provider controllati, review indipendente e oracoli
deterministici. I limiti fisici/tecnici vanno distinti dalle quote commerciali.

## Piano operativo di riallineamento

1. Salvare checkpoint verificato e anomalie del banco web; allineare fonti.
2. Inventariare le funzioni upstream gia disponibili e le restrizioni aggiunte.
3. Generalizzare file/progetto/comandi e recupero del ciclo agente mantenendo
   i confini; riusare componenti upstream senza riscrivere la shell.
4. Collegare Serena al progetto attivo in un ambiente controllato e provare
   il flusso semantico. Integrare KB con prove di lavori generali.
5. Selezionare cloud prezzo0 da fonti verificate e preparare la connessione;
   coinvolgere l'utente solo per l'eventuale chiave/login strettamente necessari.
6. Test su progetti generali, review, guida, valutazione modello/agente e chiusura.

Rischio4. Parent implementa, reviewer indipendente verifica delta. Nessun
commit/push automatico. Il precedente ciclo web non chiude questo obiettivo.
