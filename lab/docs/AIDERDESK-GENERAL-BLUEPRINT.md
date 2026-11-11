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
