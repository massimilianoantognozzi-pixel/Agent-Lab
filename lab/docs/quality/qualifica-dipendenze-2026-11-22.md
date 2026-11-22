# Dipendenze, installazione e compatibilità del candidato Agent-Lab

Verifica del 22 novembre 2026 sul ramo `codex/close-security-review-14`, a partire da `430b6eb0` con modifiche locali. Le misure riguardano i file risolti nel produttore e nelle installazioni pulite. L'audit npm dipende dagli avvisi disponibili alla data della prova.

| Problema misurato | Correzione | Verifica funzionale |
|---|---|---|
| I componenti Google trascinavano versioni segnalate di Glob e Minimatch | AI Platform 7.8.0, Google Auth 11.3.4 e una risoluzione compatibile di `gcp-metadata` 8.1.2. Riallineata al manifest anche la copia obsoleta di Glob nel workspace tree-sitter. | Cataloghi Gemini e Vertex, generazione, autenticazione con dati sintetici, due pagine gRPC e API della CLI in locale. |
| Il postinstall modificava copie condivise degli SDK e il consumatore installava una versione vulnerabile di Sharp | La CLI prepara copie private degli SDK necessari e mantiene la sostituzione di Sharp già prevista per l'uso testuale di Transformers. I binari ONNX si installano per la piattaforma del consumatore. | Tokenizer, vettore a 384 dimensioni, immagine elaborata dall'adattatore Requesty e integrità dei file delle dipendenze preesistenti nel consumatore. |
| Su Linux il runtime 1.21.0 tentava di scaricare un archivio inesistente; la prima alternativa 1.23.2 introduceva una versione segnalata di adm-zip | ONNX Runtime Node 1.31.1, con la propria versione di `onnxruntime-common`. L'installazione usa il feed del produttore. La telemetria nativa viene disabilitata prima del caricamento nell'app. | Installazione ordinaria senza flag di esclusione su Linux e Windows; inferenza CPU e servizio locale. Matrice di controllo con valori `[2, 6, 6, 12]` su Windows DirectML e Linux CUDA con RTX 3090, senza fallback CPU e con il provider confermato dal profilo di esecuzione. [Documentazione ONNX sulla privacy](https://github.com/microsoft/onnxruntime/blob/main/docs/Privacy.md) |
| La versione di KaTeX caricata dal renderer rientrava in un avviso | KaTeX 0.18.10 anche per le dipendenze che la usano. | Nove test del Markdown. In Edge, formula accessibile con MathML e diagramma Mermaid con due nodi e formula nella SVG. [Avviso KaTeX](https://github.com/advisories/GHSA-238p-pmpm-9mq7) |
| Anche il grafo dei tool di sviluppo conteneva dipendenze segnalate | Aggiornati TypeScript ESLint e le risoluzioni del selettore PostCSS e di Minimatch. La verifica React usa il plugin mantenuto e conserva la diagnostica sugli opt-out del compilatore. | Confronto su hook validi e non validi; controllo della selezione dei file di packaging, della fusione ASAR e di 33 varianti tipografiche Tailwind. |
| Una patch preesistente disattivava la verifica dei messaggi nel desktop | Ripristinato il codice originale di `ai@7.0.127`. La preparazione dei messaggi converte il formato immagine storico prima della validazione. Il prebuild verifica il rifiuto dei messaggi malformati e il comportamento dell'adattatore Requesty. | Messaggio malformato rifiutato prima del trasporto; testo, uso di strumenti, immagini e ricevute storiche provati sugli adattatori e nel desktop. |

Gli output del confronto memoria sono stati ricontrollati anche sul nuovo runtime. Le due esecuzioni restituiscono lo stesso file. In 12 dei 48 casi cambia l'ordine o la composizione delle prime tre candidate; tutte le decisioni finali dei due metodi misurati coincidono con il precedente runtime. Il filtro sperimentale conserva il limite emerso sul caso pertinente perso. [Rapporto memoria](memoria-intento-2026-11-22/rapporto.md)

Su Vertex, progetto, regione e identità vanno configurati nel profilo, nelle variabili Aider impostate dall'operatore o nell'ambiente del processo. ADC supporta anche il file dell'account indicato dall'operatore. Un utente che prima ricavava il progetto soltanto dal file `.env` della home o da `--env-file` deve spostarlo in una di queste fonti. I file scelti dal repository non decidono l'identità o il progetto di fatturazione. Un'area `eu` o `us`, un modello publisher e un modello ottimizzato usano i percorsi previsti dallo SDK.

Per ripetere l'audit nel checkout usare `npm audit --include=dev`; per il pacchetto installare il tarball appena prodotto in una directory con un nuovo manifest e ripetere l'audit lì. Il [rapporto di distribuzione](qualifica-cli-2026-11-22.md) distingue il consumatore pulito, un progetto con dipendenze proprie, i controlli dell'ASAR e l'installer Windows. Gli SDK Google sono stati esercitati contro trasporti locali. Le prove non utilizzano account di produzione.

Durante una controprova separata, una copia annidata della libreria di autenticazione è sfuggita al trasporto simulato e ha inviato all'endpoint token di Google i soli valori sintetici del banco. La risposta è stata `invalid_client`. Il tentativo è escluso dalle prove positive; nessuna credenziale reale è stata utilizzata.

La verifica indipendente finale di Vertex e della preparazione dei messaggi ha superato 23 test con connessioni non-loopback bloccate prima del caricamento del test runner. È stato inoltre verificato che il catalogo e l'inferenza rifiutino credenziali esplicite con JSON malformato, nullo, vuoto o di tipo errato senza registrare il testo inserito.

La stessa verifica è stata ripetuta sulla CLI finale installata dal tarball con impronta `c75cee7f18763087e7cef454e68048a07f2bf250935f3c672ebc685c469259be`. Il servizio ha risposto 200 sul controllo di salute e 401 sulle impostazioni senza credenziali. I cataloghi Gemini e Vertex simulati sono stati letti con successo. Il caso di credenziali non valide ha restituito soltanto il messaggio previsto, senza chiamate gRPC aggiuntive né il valore del banco nei log.

Gitleaks non ha segnalato segreti nel materiale modificato con la configurazione del progetto. Forzando l'analisi a ignorare le annotazioni preesistenti, segnala due valori in `src/main/lab-local-model.ts`. Entrambi coincidono con le impronte SHA-256 dei file pubblici del tokenizer e con i valori della revisione Git di partenza.

## Verifiche congiunte del 22 novembre

| Controllo | Windows x64 | Ubuntu 24.04 x64 |
|---|---|---|
| Audit npm del checkout, inclusi gli strumenti di sviluppo | 0 avvisi noti | 0 avvisi noti dopo `npm ci` |
| Typecheck main/renderer e build Electron | Superati | Superati |
| Suite Node | 2.055 test superati, 1 escluso | 2.046 test superati, 9 esclusi |
| Suite renderer | 517 test superati | 517 test superati |
| Lint | 0 errori, 1 warning preesistente | 0 errori, stesso warning |

Su Windows sono stati abilitati il contenitore reale e le tre prove in finestre di test. La ricerca SearXNG esterna non aveva un endpoint configurato. Le esclusioni Linux coprono anche integrazioni opzionali e prove specifiche di Windows. La diagnostica rimasta nel lint riguarda l'opt-out esplicito dal React Compiler per l'albero della sidebar, che mantiene un'istanza mutabile. La CI per le PR è configurata nel repository; questi esiti provengono dal checkout e dal runner locale.

Il collaudo dal renderer Electron ha aperto un browser temporaneo dalla chat, compilato un modulo, inviato il valore e osservato la conferma. Il valore del banco è assente dal log di debug. La prova usa un provider simulato su loopback e l'assenso automatizzato al solo dialogo atteso. Il confronto sul modulo di navigazione ha usato invece il modello Devstral locale reale.
