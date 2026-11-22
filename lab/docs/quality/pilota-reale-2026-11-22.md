# Confronto tra agente generale e governato sul renderer di Agent-Lab

## Esito al primo tentativo

Sul modulo reale che gestisce i collegamenti alla finestra Diff, l’agente generale ha completato due incarichi su tre e il governato uno su tre. Le due modalità hanno superato prove diverse. Il campione comprende un modulo, tre richieste e un modello locale. L’esito di una singola esecuzione è variato anche a modello e strumenti invariati.

| Incarico | Generale | Governato |
|---|---|---|
| Correggere la decodifica di un percorso con una percentuale malformata | Contratto fallito. Quattro HTTP 500 del provider, nessuna modifica. 109 s | Contratto superato sul candidato consegnato. Tre risposte del modello, 32 s |
| Centralizzare la lettura dei parametri e usarla nella pagina Diff | Contratto superato sui due sorgenti modificati. Otto richieste, 70 s | Piano con tre domande, fermo prima della modifica. Una richiesta, 26 s |
| Generare un collegamento a partire da cartella e identificativo della task | Contratto superato sul sorgente modificato. Cinque richieste, 20 s | Piano con due domande, fermo prima della modifica. Una richiesta, 19 s |

Il primo caso generale ha incluso il caricamento a freddo dei pesi. I tempi includono apertura del desktop isolato, chiamate, verifiche e chiusura. L’ordine delle prove e il riuso della cache impediscono di usarli per stabilire quale modalità sia più veloce.

### Che cosa si è verificato

Le due modalità hanno ricevuto lo stesso testo di prodotto, gli stessi file iniziali e lo stesso contratto di accettazione. I sorgenti e il test originale provengono dal commit `430b6eb0`. Le copie conservano i percorsi e i contenuti reali di `routes.ts`, del suo test e, per l’incarico su due file, di `UpdatedFilesDiff.tsx`. Il bug genera effettivamente `URIError` nella base. Le altre due richieste sono modifiche proposte per il banco. I tre contratti fallivano sui sorgenti iniziali e passavano su una soluzione di controllo preparata a parte.

L’invio è avvenuto attraverso il vero desktop Electron compilato dal candidato del 19 novembre, tramite `window.api.runPrompt`. Entrambi i modi hanno usato `devstral-aiderdesk:24b` sul medesimo server Ollama locale. Le chiamate di piano, programmazione e revisione del governato sono eseguite dal motore nativo. Il banco approva soltanto una revisione che corrisponde ai file del brief ed è priva di domande aperte. Quando il generale usa la shell per verificare, l’estensione del banco ammette il solo comando concordato e gli restituisce l’esito del contratto. Lettura e scrittura passano per gli strumenti nativi, con i file autorizzati della copia. Il profilo locale della prova esclude chiamate a modelli cloud, strumenti di rete e altre estensioni del progetto.

Il controllo indipendente esegue le funzioni in Edge headless anche quando l’app dichiara il turno concluso. Per il cambiamento su due file invoca il componente reale con router, hook React e API sostituiti, e osserva il percorso passato a `getUpdatedFiles`. Ha verificato percorsi Windows, spazi, percentuali, simboli e Unicode. Sono rimaste prive di modifiche le fonti di riferimento, le regole e i test della proiezione. Il banco non ha avviato un’istanza completa del prodotto modificato né compilato sul ramo di produzione le soluzioni proposte.

### Ripetizione e interventi

| Prova separata | Generale | Governato |
|---|---|---|
| Stesso incarico sul bug su copie nuove, senza suggerimenti | Superato, 22 s | Contratto fallito, 143 s. Dopo sette diagnosi il motore si è fermato in attesa, inclusi ripetuti verdetti del revisore con schema non valido |
| Chiarimenti sugli input della funzionalità, identici per entrambi | Contratto fallito, 25 s. Il provider ha respinto il nome breve di uno strumento | Piano con due domande, 19 s |
| Chiarimenti sui parametri della modifica multifile, identici per entrambi | Contratto superato, 70 s | Piano con due domande, 38 s |
| Stessa funzionalità con anche i nomi completi degli strumenti esplicitati | Contratto fallito, 22 s. Il modello ha ancora richiesto `bash` | Contratto superato sul candidato, 45 s |

Le copie delle ripetizioni provenivano dai commit iniziali locali. Git su Windows vi ha applicato la conversione dei fine riga. I due modi di ciascuna coppia hanno ricevuto lo stesso testo e gli stessi sorgenti logici. Il percorso della copia, il contesto della sessione e lo stato della cache differiscono tra una prova e l’altra.

L’operatore ha anche risposto nella stessa task governata alle due serie di domande emerse al primo tentativo. Per la funzionalità il contratto ammette stringhe anche vuote, esclude `null` dalla firma e usa la semantica standard di `encodeURIComponent`. Per la modifica su due file specifica di leggere soltanto `project` e `task`, conservare il valore decodificato dal router e fornire stringa vuota se assente. Nel traffico al provider il campo `request` include queste risposte e `previous.questions` include le domande precedenti. Il motore ha conservato gli ID delle task e generato due revisioni nuove. Il modello ha riproposto le domande originarie in entrambi i casi, dopo 17 e 21 secondi rispettivamente. Nel campione la perdita di continuità si colloca nell’interpretazione della risposta da parte del modello.

### Diagnosi dei nomi degli strumenti

Il primo caricamento ha restituito quattro HTTP 500. Il banco aveva registrato lo stato HTTP senza conservare il corpo di quell’errore. La richiesta iniziale è stata quindi ricostruita dalla replica registrata ripristinando percorso e testo delle regole originarie. Ha la stessa lunghezza osservata di 15.630 byte. Una chiamata diagnostica al solo provider, priva di esecuzione degli strumenti, ha riprodotto HTTP 500 con `tool 'file_read' not found`. Il nome annunciato al provider era `power---file_read`. Nella prova della funzionalità con chiarimenti è stato invece catturato direttamente `tool 'bash' not found` in quattro risposte consecutive. L’elenco includeva `power---bash`. La disponibilità del modello e della memoria è confermata dalle risposte di inferenza delle medesime sessioni.

Il motore ordinario cerca già una corrispondenza per suffisso dopo un `NoSuchToolError` dell’AI SDK. In questi casi il provider rifiuta la richiesta prima di restituire una chiamata al dispatcher, quindi il recupero nel motore non interviene. Il punto di integrazione per un adattamento è la creazione del client Ollama e del relativo middleware. [Motore degli strumenti](../../../src/main/agent/agent.ts) · [Provider Ollama](../../../src/main/models/providers/ollama.ts)

### Esperimento con nomi brevi sul solo collegamento al modello

Un adattatore locale ha presentato al modello i quattro nomi brevi `file_read`, `file_edit`, `file_write` e `bash` quando i corrispondenti strumenti completi erano già autorizzati nella richiesta. Ha mantenuto i nove strumenti del generale, gli schemi degli argomenti e gli identificativi di chiamata. Prima di consegnare la risposta al client ha ripristinato i nomi nativi. Tre test hanno verificato la conservazione dello storico e degli argomenti, il rifiuto di collisioni o nomi assenti, e il limite alle risposte complete del banco. [Implementazione sperimentale](../../work/pilota-reale-2026-11-22/alias.mjs) · [Test del protocollo](../../work/pilota-reale-2026-11-22/test-alias.mjs)

Sul payload ricostruito dal primo bug, cambiando solo i nomi esposti al provider, il replay è passato da HTTP 500 a HTTP 200 e ha restituito `file_read`. Il client del banco lo ha ricondotto a `power---file_read`. La chiamata diagnostica si è fermata prima di eseguire uno strumento. Nelle due sessioni complete del generale, invece, il dispatcher nativo ha ricevuto ed eseguito nove chiamate coi nomi completi. Entrambi i contratti Edge sono passati. [Risposta con i nomi originali](../../work/pilota-reale-2026-11-22/replay-provider.json) · [Risposta con gli alias](../../work/pilota-reale-2026-11-22/replay-provider-alias.json)

| Incarico | Generale con alias | Governato sullo stesso collegamento |
|---|---|---|
| Bug della percentuale | Superato, cinque risposte HTTP 200, 19 s | Fermo sul verdetto del revisore, 127 s |
| Funzionalità del collegamento | Superata, sei risposte HTTP 200, 38 s | Piano con domande aperte, 17 s |

Le chiamate del governato in questi casi richiedono testo strutturato e non espongono strumenti, perciò la trasformazione dei nomi non si applica. Sul bug il replay di un messaggio al revisore ha riprodotto testo che descrive lo schema richiesto. Il parser ha rifiutato quel testo e il candidato è rimasto senza consegna. [Diagnosi del revisore](../../work/pilota-reale-2026-11-22/replay-revisore.json)

### Adattatore integrato e verificato nel desktop candidato

Il provider di Agent-Lab applica la traduzione soltanto al modello `devstral-aiderdesk:24b` su endpoint HTTP o HTTPS di loopback. La mappa viene ricostruita per ogni richiesta con le funzioni effettivamente disponibili e le identità presenti nello storico. Un nome breve già occupato, anche da un’estensione omonima, conserva i nomi distinti. La traduzione riguarda i campi strutturati delle chiamate e dei risultati; gli argomenti, i testi e gli identificativi mantengono il contenuto originario. [Implementazione del provider](../../../src/main/models/providers/devstral-tool-names.ts) · [Test mirati](../../../src/main/models/providers/__tests__/devstral-tool-names.test.ts)

Sul candidato sono passati 17 test dei provider Ollama e Devstral, il typecheck Node, il lint dei file interessati e la build Electron in una directory isolata. I test coprono generazione diretta, streaming dell’app, frammenti incrementali, scelta forzata dello strumento, storico, concorrenza, collisioni con tool correnti o storici, tool proprietari, rifiuto di nomi non autorizzati e perimetro del modello.

La build finale (`f613abc3e62394e151ec8b363e7c8039339362184b0a284c7f1b5c95b623ca10` sul main compilato) ha inviato direttamente a `127.0.0.1:11435`, con i nove strumenti del confronto. Sul bug il contratto Edge è passato in 21 secondi. Sulla funzionalità il primo tentativo si è fermato dopo 18 secondi. Il modello aveva letto il file oltre l’ultima riga e insistito con comandi esplorativi non ammessi dal banco. Il contratto Edge falliva. Su una copia nuova, con il medesimo testo e gli stessi permessi, il contratto è passato in 24 secondi. Le tre sessioni hanno ricevuto 23 risposte HTTP 200; per tutte le 21 invocazioni gli eventi del provider e la cronologia dell’app provano la corrispondenza tra nome breve e nome nativo. La verifica indipendente ha rieseguito Edge anche sulla copia fallita. [Esiti sulla build finale](../../work/pilota-reale-2026-11-22/attestazione-adattatore-integrato-finale.json) · [Ripetizione della funzionalità](../../work/pilota-reale-2026-11-22/attestazione-adattatore-integrato-review.json)

Nel governato restano da affrontare il riuso effettivo delle risposte da parte del modello e la correzione del formato dei verdetti. Il pilota copre tre incarichi di navigazione e il modello locale qualificato. Una decisione sulle architetture di editing o su un secondo modello revisore richiede evidenze più ampie.

### Prova sul formato del verdetto e sulle domande ripetute

Il motore possiede già gli schemi Zod del piano e della revisione. Li serializza nelle istruzioni testuali prima di chiamare `generateText`. Per un piano non valido ritenta una volta con informazioni sui campi errati. Per una revisione non valida registra la diagnosi nel ciclo di recupero e torna al correttore. Nel replay del bug il modello aveva prodotto due blocchi Markdown, iniziando con la descrizione dello schema: il parser accetta un solo oggetto. [Generazione e validazione del governato](../../../src/main/task/repository-workflow.ts) · [Ingresso della task](../../../src/main/task/task.ts)

Per isolare l’effetto del formato abbiamo ripreso le richieste originali dei due piani chiariti e del revisore. Per ciascuna abbiamo effettuato una sola chiamata locale, aggiungendo soltanto il campo `format` con il JSON Schema già presente nel prompt. Il banco ha estratto dal sorgente le definizioni Zod e la funzione di parsing, verificando la coincidenza dei loro schemi con quelli registrati. Le chiamate hanno conservato gli stessi messaggi e non offrivano strumenti.

| Richiesta registrata | Risposta con `format` strutturato | Conseguenza osservata |
|---|---|---|
| Revisione del bug | Oggetto valido con `verdict: pass` e `findings: []`, 17 token | Su questa richiesta il formato consente al validatore di leggere il verdetto. Il banco si è fermato prima della consegna. |
| Piano della funzionalità | Oggetto valido, file corretti, due domande | Il modello ripete entrambe le domande iniziali, sebbene le risposte siano ancora nel testo ricevuto. |
| Piano della modifica multifile | Oggetto valido, file corretti, tre domande | Il modello ripete tutte e tre le domande iniziali alle quali l’operatore del banco ha già risposto. |

Il JSON Schema ammette un elenco di domande aperte. Che una domanda sia necessaria alla luce di una risposta precedente è un giudizio sul contenuto. Il formato strutturato ha corretto l’emissione del verdetto nel singolo caso provato; per i due piani il problema misurato riguarda l’interpretazione del modello. Nel codice `Agent.generateObject` usa già `generateText` con `Output.object({ schema })`, e l’adattatore Ollama installato traduce lo schema nel parametro `format`. Il callback del governato riceve oggi soltanto fase e testo. Portarvi lo schema tipizzato è tecnicamente possibile con le autorizzazioni correnti. Richiederebbe una scelta esplicita sul protocollo condiviso, conservando i parametri del modello, l’interruzione, i controlli sul candidato e l’approvazione della specifica revisione. Nessuna modifica al protocollo è stata applicata durante questa prova. [Metodo strutturato esistente](../../../src/main/agent/agent.ts) · [Dati delle tre chiamate](../../work/pilota-reale-2026-11-22/confronto-schema.json)

### Correzioni del governato nel candidato successivo

Il revisore di codice e quello UI del governato ricevono lo schema Zod dell’effettivo verdetto quando il profilo usa il Devstral qualificato su Ollama locale. Il callback usa `Agent.generateObject`, conserva l’eventuale livello di ragionamento e consegna il risultato allo stesso validatore del motore. Un verdetto negativo, uno schema invalido o rilievi aperti continuano a impedire la consegna. Gli altri modelli conservano il percorso precedente. [Callback della task](../../../src/main/task/task.ts) · [Generazione strutturata](../../../src/main/agent/agent.ts)

Quando il piano attende una decisione, il Planner riceve separatamente l’obiettivo originario, le domande, la nuova risposta e lo storico degli eventuali chiarimenti. Una risposta numerata vale solo per la domanda corrispondente. Per chiudere una domanda il modello deve citare un estratto letterale pertinente dalla risposta e indicare che nulla resta da chiarire. Il motore controlla la provenienza del testo, conserva le domande senza riscontro e registra numero e citazione delle risposte accettate. Alle risposte rinviate esplicitamente, come «Non lo so», continua a corrispondere una domanda aperta. La pertinenza semantica di testo libero resta un giudizio del Planner. Ogni piano rivisto conserva una sua approvazione esplicita. [Motore](../../../src/main/task/repository-workflow.ts) · [Regressioni](../../../src/main/task/__tests__/repository-workflow.test.ts)

Durante la prova multifile, il candidato corretto superava il controllo funzionale ma Git rifiutava la patch in una cartella privata Windows con il messaggio `Filename too long`. Ripetendo sullo stesso percorso e con gli stessi byte, l’opzione `git -c core.longpaths=true apply --check` ha verificato entrambe le modifiche. Il candidato imposta l’opzione per quel singolo processo Git su Windows. Il percorso che prepara i rami usava già la stessa opzione. Una regressione verifica l’applicazione e controlla che la configurazione Git del repository resti invariata. [Diagnosi riproducibile](../../work/pilota-reale-2026-11-22/diagnosi-apply.json)

### Collaudo diretto del governato corretto

La build isolata con dipendenze aggiornate ha usato il modello locale sul medesimo modulo e gli stessi contratti Edge. Il main compilato ha SHA-256 `99bc5750388983402208454b0713a1a0488e06d8665c7ab18a0f7a0ca84c3b24`. In ciascuna delle tre richieste originarie il primo piano ha presentato domande. Dopo il chiarimento, il motore ha prodotto una nuova revisione con zero domande pendenti. Il banco l’ha approvata con il relativo identificativo.

| Richiesta | Domande prima → dopo | Esito indipendente al primo percorso completo |
|---|---:|---|
| Bug di decodifica | 3 → 0 | Consegna e contratto Edge superato in 63 s |
| Funzionalità del collegamento | 1 → 0 | Consegna e contratto Edge superato in 43 s |
| Modifica multifile | 2 → 0 | Dopo 240 s il motore ha conservato la diagnosi. Sette proposte non hanno superato il contratto sul percorso già decodificato. Nessuna consegna |
| Controllo separato con scelta realmente aperta | 1 → 1 | Dopo «Non lo so» il piano ha conservato la domanda. Nessuna approvazione e nessuna consegna, 31 s |

Nei due casi consegnati il trasporto verso Ollama ha incluso `format` con `verdict` e `findings` per il revisore e zero strumenti. Per il multifile il verificatore ha fermato il candidato prima che arrivasse al revisore. Il ricontrollo ha verificato i riferimenti alle risposte, gli ID delle revisioni, l’approvazione e i risultati Edge nelle copie effettive. Le suite mirate hanno superato 138 test. Due integrazioni opzionali, con motore di ricerca esterno e immagine Docker dedicata, erano escluse. Typecheck Node, lint mirato e build Electron sono passati. [Ricevute del governato](../../work/pilota-reale-2026-11-22/attestazione-governato-piano-v2.json)

Una ripresa tecnica separata ha usato lo stesso ID di task e la stessa revisione approvata del multifile. L’oracolo ha mantenuto identici criteri e asserzioni, aggiungendo al messaggio di errore i valori divergenti. Per la cartella `C:\Mia %20` il candidato restituiva `C:\Mia  `, trasformando la sequenza letterale `%20` in uno spazio. Dopo quattro ulteriori proposte in 149 s il contratto falliva ancora. Il correttore vedeva l’errore reale e la proposta precedente; il campo `files` del suo input descriveva la base iniziale. Una futura prova può misurare se mostrare prima il candidato respinto aiuta il modello a correggerlo. Il motore ha conservato la diagnosi e non ha consegnato alcun candidato multifile in questa esecuzione. [Ricevuta e ruoli della ripresa](../../work/pilota-reale-2026-11-22/sessioni/governato-change-piano-v2-diagnosi/esito.json)

### Contesto del correttore dopo un candidato respinto

Il candidato successivo presenta in `files` il contenuto dei file approvati sul quale i controlli sono davvero terminati, compresi i cambiamenti già validi. Il correttore riceve la base originaria in `originalFiles` e gli esiti in `candidateChecks`. La proposta richiesta resta la modifica completa rispetto alla base approvata. I file del contesto non ripetono sotto un altro nome una versione differente di uno stesso file modificabile.

Il checkpoint collega revisione, modifiche ed esiti mediante un’impronta. Il motore ricontrolla nelle copie private le vecchie proposte con una ricevuta assente o incoerente prima di presentarle come misurate. Un percorso estraneo viene escluso. I test di ripresa hanno conservato una nota valida mentre veniva corretto il filtro nell’altro file; hanno coperto un checkpoint corrente, uno precedente senza ricevuta, uno con ricevuta discordante e una proposta fuori perimetro. [Motore di recupero](../../../src/main/task/repository-workflow.ts) · [Test della ripresa](../../../src/main/task/__tests__/repository-workflow.test.ts)

La prova finale ha riaperto la stessa task multifile e la stessa revisione approvata, a partire dal checkpoint precedente che aveva conservato undici tentativi senza una ricevuta dei controlli. Il banco ha ricostruito i file attesi dalla proposta respinta e ha verificato, nel primo ingresso al correttore, la coincidenza con `files`; `originalFiles` coincideva invece con la copia iniziale. Non sono stati forniti suggerimenti di patch al modello.

**La ripresa ha consegnato entrambi i file e ha superato il contratto Edge originale.** Ha richiesto 134 secondi e otto chiamate locali: due passaggi dell’orchestratore, quattro del correttore, revisione del codice e revisione UI. Entrambi i revisori hanno ricevuto lo schema di verdetto. Il controllo finale indipendente ha eseguito di nuovo l’oracolo originario, senza arricchimenti nei messaggi di errore. Il main compilato per questo passaggio ha SHA-256 `dec4d45c6edacfd630e9396b1578b7364df28aa4114ab322ebbb7afacc594f8a`. Le due suite workflow sulla revisione finale contano 72 test superati e due integrazioni esterne opzionali escluse; typecheck Node, lint mirato e build Electron sono passati. Il successo della ripresa è distinto dal risultato storico dei primi tentativi. [Attestazione indipendente della ripresa multifile](../../work/pilota-reale-2026-11-22/attestazione-debug-multifile.json)

### Versione del runtime locale

All’avvio del pilota il launcher quotidiano accettava soltanto il digest di Ollama 0.40.16, mentre il PC aveva installato la 0.40.17. Il membro `ollama.exe` dell’archivio Windows x64 ufficiale coincide con quello installato, SHA-256 `929941de0cd0ef8fb95f9f2c7fe8f9645897942a6492539915a5383066b47207`, con firma Authenticode valida di Ollama Inc. Il banco ha verificato la proprietà del listener su loopback e il modello usando una copia separata dei pesi. A conclusione del lavoro il launcher del candidato accetta i due digest qualificati di 0.40.16 e 0.40.17. [Launcher del candidato](../../scripts/local-ollama.mjs) · [Release ufficiale Ollama](https://github.com/ollama/ollama/releases/tag/v0.40.17)

I materiali del pilota sono locali. Il [piano fissato](../../work/pilota-reale-2026-11-22/piano.md), i [tre incarichi](../../work/pilota-reale-2026-11-22/casi.mjs), il [contratto Edge](../../work/pilota-reale-2026-11-22/controllo.mjs) e la [replica indipendente dei sei risultati primari](../../work/pilota-reale-2026-11-22/replica-contratti.json) sono nel checkout usato per la prova.
