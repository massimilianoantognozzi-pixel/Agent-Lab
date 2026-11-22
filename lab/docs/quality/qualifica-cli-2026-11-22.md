# Qualifica dei pacchetti CLI e desktop del 22 novembre 2026

**Aggiornamento per l'uso locale.** Per installare il desktop sul PC usa il [setup con identità Agent-Lab](../INSTALLAZIONE-LOCALE.md). Questa pagina conserva la qualifica della CLI e dell'artefatto desktop precedente alla separazione da AiderDesk.

## Candidato finale

**Consegna verificata il 22 novembre 2026.** L'installer Windows e il tarball CLI contengono il runtime con validazione dei messaggi attiva e gestione corretta degli errori delle credenziali Vertex. I controlli del produttore e dei consumatori puliti contano zero advisory npm in tutte le categorie alla data del collaudo. I file qui collegati sono le copie locali di consegna.

| Artefatto | Dimensione | SHA-256 |
| --- | ---: | --- |
| [Installer Windows x64](../../artifacts/consegna-2026-11-22/aider-desk-0.88.0-setup.exe) | 353.156.160 byte | `2446f222a15d1786e8c0dfea857db548544027801126f388c1e39c0854a283ef` |
| [Tarball CLI per npm](../../artifacts/consegna-2026-11-22/aiderdesk-aiderdesk-0.87.0.tgz) | 32.636.190 byte | `c75cee7f18763087e7cef454e68048a07f2bf250935f3c672ebc685c469259be` |

Il [manifest delle impronte](../../artifacts/consegna-2026-11-22/SHA256.json) identifica entrambe le copie. L'installer NSIS non è firmato. L'app è stata avviata dal pacchetto scompattato con un profilo temporaneo, anche in modalità generale, e chiusa normalmente. Una verifica separata ha estratto `resources/app.asar` direttamente dall'installer mediante 7-Zip. L'impronta corrisponde all'ASAR eseguito, `d505686581755483c7994fe999359c3e9346888cff188535630a39cd27fcec00`. L'installer non è stato eseguito sul profilo utente.

| Verifica finale | Esito |
| --- | --- |
| Confezione Windows | L'ASAR esclude il marcatore sotto `lab/work` e la copia locale non verificata di Cloudflared. Renderer, bridge e API si avviano. Il terminale reale, un grafo ONNX CPU e una tabella LanceDB hanno funzionato dall'eseguibile confezionato. Cloudflared corrisponde al digest ufficiale indicato sotto. |
| SDK nel desktop e nella CLI | Tutti e quattro i JavaScript e le sei map distribuite di `ai@7.0.127` corrispondono byte per byte all'archivio originale. Gli ingressi import e default risolvono lo stesso `dist/index.js` con SHA-256 `5748ab47ddf2116c6511cbeec78e31e896a47529d424e6295de031b1d68c99d8`. Verificate le quattro varianti corrette di Requesty, le map distribuite, il rifiuto dei messaggi non validi e la gestione di un allegato sintetico. |
| Build e replica CLI | Build normale completata. Due `npm pack` hanno prodotto lo stesso tarball. `npm audit --include=dev` sul lock revisionato ha restituito zero avvisi. Tutti i 61 test della CLI sono passati. |
| Installazione Windows e Linux x64 | Installazione normale da tarball in due consumatori puliti, Windows con Node 24.14.0/npm 11.9.0 e Debian Linux con Node 24.22.1/npm 11.19.1. Nessun parametro per saltare CUDA. Help, avvio headless, modalità generale, health, rifiuto anonimo 401 e accesso 200 con credenziali sintetiche superati. Audit produzione a zero su ciascun consumatore. |
| Revisione indipendente del runner finale | Le API hanno restituito entrambi i cataloghi Gemini e Vertex con servizi sintetici HTTP/gRPC su loopback. La credenziale malformata ha ricevuto il messaggio fisso. Il marcatore di prova era assente da risposta e log e le richieste RPC non sono aumentate. |
| Memoria | Il tokenizer ha restituito gli stessi quattro ID su entrambi i sistemi. L'embedding CPU ha restituito 384 componenti. ONNX Node 1.31.1 viene installato sulla piattaforma del consumatore. Il sostituto Sharp privato corrisponde a `empty-npm-package@1.0.0`. La prova GPU separata è descritta sotto. |
| Progetto con SDK propri | Sei file preesistenti sono rimasti identici. Lo stesso avviso moderato e le stesse due segnalazioni alte sulle dipendenze già presenti erano rilevati prima e dopo l'installazione. |

La ricevuta del freeze sorgenti ha SHA-256 `8b512f24e1aa8de66d1ba4fef5b18e43ef0f182b196809717702816cd27f821d` sopra il commit `430b6eb0`. Il sorgente finale Vertex ha SHA-256 `6224479ec8e9740a9373f5ac229a5b79a00afa75451235b1591122a4524c2c10`. Per l'ultimo aggiornamento è cambiato il solo `out/main/index.js`: gli altri cinque file main, il preload e tutti i 604 file del renderer erano identici. La copia scompattata conserva lo stesso runtime della consegna.

I log replicabili sono nella directory locale `lab/work/qualifica-cli-2026-11-22/consegna-build/`, tra cui `logs/consegna-win-result.json`, `logs/consegna-win-sdk-bytes.json`, `logs/consegna-zero-ci-summary.json` e `linux-consegna-results/`. Le prove con errori di filesystem iniettati hanno confermato il recupero da un `EPERM` transitorio su Windows e il ripristino dell'albero precedente dopo un `EIO`. Nessun pacchetto è stato pubblicato.

## Interventi verificati

**Desktop Windows x64.** La confezione precedente includeva un marcatore sintetico collocato in `lab/work/` in una copia del checkout. Con il nuovo [elenco dei file da distribuire](../../../electron-builder.yml), l'ASAR contiene alla radice solo `LICENSE`, `package.json`, `out` e `node_modules`. Il marcatore, i documenti di lavoro e gli script di sviluppo restano fuori. Presenza verificata di main, preload, renderer, logo per il QR, connettore, prompt, skill e Probe. La [prova ripetibile del pacchetto Windows](../../scripts/check-windows-package.mjs) apre il vero eseguibile in un profilo temporaneo, verifica il bridge, il renderer e l'API su loopback.

La ricetta Windows x64 prepara Cloudflared 2026.11.1 in una directory temporanea di build. Riusa un file locale soltanto se dimensione e SHA-256 coincidono con il rilascio ufficiale. Altrimenti scarica l'asset specifico e ne verifica i byte prima del confezionamento. Una prova con un eseguibile sintetico locale diverso lo ha lasciato intatto. Il file realmente confezionato pesa 55.483.112 byte e ha SHA-256 `341deda3db5ec498a0482254d6c38c0b7cf01a30c37bb5dd95d2216d08955e35`. L'indice ASAR esclude la copia del modulo npm, il file verificato risiede nell'area risorse utilizzata dall'app. La CLI distribuisce invece una dipendenza da `cloudflared@0.7.1`: il suo wrapper npm può scaricare `latest` durante l'installazione nel consumatore. Quel binario non è dentro il tarball CLI. La prova non avvia tunnel. [Cloudflare, checksum ufficiali della release del 17 novembre 2026](https://github.com/cloudflare/cloudflared/releases/tag/2026.11.1)

Un terminale aperto dal pacchetto ha eseguito il comando di prova con Electron 44.9.3. Il primo tentativo ordinario di electron-builder aveva richiesto a MSBuild le librerie Spectre x64. La [ricetta Windows](../../scripts/build-windows-package.mjs) usa il precompilato Node-API del produttore del terminale, lo controlla con l'Electron corrente e affida gli altri moduli di produzione e opzionali a electron-rebuild. Il controllo PTY viene ripetuto nell'ASAR confezionato. Il costruttore NSIS è stato eseguito senza pubblicazione e senza avviare l'installazione sul PC.

**CLI.** La distribuzione mantiene la validazione originaria di `ai` e include la correzione Requesty solo nella copia privata della CLI. In un progetto che aveva già gli SDK, tutti i cinque file di interesse conservano le impronte preinstallazione. Il runner elabora testo, storico dei risultati strumento e immagine con modello simulato, in streaming e in generazione singola. Un messaggio di forma non valida viene respinto. Requesty trasforma un allegato strutturato nel formato previsto dal trasporto simulato. Il pin pubblico di `ai` serve anche ai peer OpenRouter, Ollama e Langfuse. Toglierlo faceva installare una versione diversa senza ridurre le segnalazioni. Requesty rimane un input esatto di build e la relativa verifica di sicurezza lo include.

La preparazione usa `npm ci` con il lock revisionato. Registra le impronte di input e contenuto, confronta l'adattatore con una prova locale e sostituisce l'albero soltanto dopo la verifica. Una patch sintetica priva di modifiche veniva accettata dal solo patch-package: il controllo funzionale ora la rifiuta. La prova di errore ha lasciato immutati l'hash e il timestamp della precedente ricevuta valida. Una licenza alterata nel banco ha reso rosso il controllo prima del pack e una nuova preparazione ha ripristinato il contenuto. Due preparazioni consecutive su input validi sono riuscite.

**Memoria e portabilità.** Transformers 3.8.1 viene distribuito come codice JavaScript privato con lo stesso sostituto Sharp già fissato dal progetto. La CLI dichiara esplicitamente le dipendenze ONNX da installare sul sistema utente. L'archivio privato verificato è privo di DLL, eseguibili, moduli nativi Node e librerie native specifiche di piattaforma. Windows x64 e Linux x64 CPU hanno prodotto gli stessi quattro ID con il tokenizer locale verificato. La ricerca di caratteristiche del testo ha prodotto un vettore di 384 dimensioni su entrambi i sistemi. In ciascun banco l'addon ONNX proviene dall'installazione del consumatore. La normale apertura headless ha raggiunto `ready` e `/api/health`. La rotta `/api/settings` ha restituito 401 senza credenziali e 200 con le credenziali sintetiche. I test non chiamano un provider di modelli a pagamento.

**Verifiche sulle alternative.** Aggiungere al tarball il vero `npm-shrinkwrap.json` del produttore ha aggiunto 95.758 byte. Il consumatore npm 11.9.0 installato da file locale aveva al suo interno il lock con SHA-256 verificato, ma conservava Sharp 0.34.5 e Undici 5.29.0. Il suo audit contava ancora cinque segnalazioni alte. Questa alternativa è stata scartata. Anche la documentazione npm 12 indica esplicitamente che lo shrinkwrap incluso nella dipendenza non viene letto. Un aggiornamento diretto a Requesty 3.6.7 falliva invece nell'ingresso CommonJS dichiarato dal pacchetto. [npm CLI 12, sezione npm-shrinkwrap.json](https://github.com/npm/cli/blob/v12.2.3/docs/lib/content/configuring-npm/package-lock-json.md#npm-shrinkwrapjson)

### Prove del grafo di dipendenze prima del freeze applicativo

Il tarball `2f78b2240a69c2d97562b5f1d1c50db9d6f86d5f80f15c9a4dc7576522cf4d01` pesa 32.633.927 byte. Due esecuzioni di `npm pack` hanno prodotto lo stesso SHA-256. L'archivio contiene 2.539 file. Le versioni e i nomi di tutti i 13 pacchetti sotto il ramo SDK privato sono presenti nel lock verificato del produttore.

| Ingresso provato | Risultato del 22 novembre 2026 |
| --- | --- |
| Produttore CLI | Build completa, inclusa verifica del downloader e degli SDK. `npm audit --package-lock-only --include=dev` conta zero avvisi. La suite CLI conta 61 test superati. |
| Windows x64, Node 24.14.0 e npm 11.9.0 | Installazione ordinaria dal tarball in consumatore vuoto, con CI attiva. Help, avvio headless, ingresso in modalità generale e memoria locale verificati. `npm audit --omit=dev` conta zero avvisi. |
| Linux x64 Debian, Node 24.22.1 e npm 11.19.1 | Installazione ordinaria dello stesso tarball in un container vuoto, senza variabili per saltare CUDA. Help, servizio, autenticazione e memoria locale verificati. Audit produzione con zero avvisi. |
| Consumatore Windows con proprie copie di AI SDK, Requesty e Sharp | Sei file preesistenti conservano gli hash. Le tre segnalazioni preesistenti nel progetto sono le stesse prima e dopo l'installazione (due alte e una moderata, riferite alle sue copie di Undici, Busboy e provider-utils). |
| Revisione indipendente Google | Il runner installato ha restituito il catalogo Gemini e quello Vertex da due servizi locali HTTP/gRPC. Verificati la risposta health e il rifiuto dell'accesso anonimo alle impostazioni. Nessun account Google reale. |

La catena Google usa Aiplatform 7.8.0, Google Auth 11.3.4 e GCP Metadata 8.1.2. I pin ONNX Node e Common sono 1.31.1. La variante web di ONNX resta alla versione originaria di Transformers. Sia su Windows sia su Linux il tokenizer locale verificato produce gli ID `4417, 1111, 85116, 2934`. L'embedding CPU produce 384 componenti. Il vecchio ONNX 1.21.0 su Linux CPU cercava un archivio GPU GitHub non disponibile. Il candidato 1.31.1 ha completato il normale postinstall con le risorse Microsoft. La memoria Agent-Lab è stata misurata su CPU. In una prova distinta del runtime 1.31.1, una RTX 3090 ha calcolato il prodotto matriciale atteso `[2, 6, 6, 12]` con il fallback CPU disabilitato, tramite DirectML su Windows e CUDA 13 su Linux. I profili di esecuzione identificano rispettivamente `DmlExecutionProvider` e `CUDAExecutionProvider`. Ricevute in `lab/work/qualifica-onnx-20261122/dml.log` e `gpu-linux.log`.

Il gate del produttore include anche Requesty e Transformers, pur classificati come dipendenze di build, perché il loro codice viene distribuito. Il gate del consumatore usa il suo albero realmente installato. I due esiti valgono per queste versioni e per il database di advisory consultato il 22 novembre. Log in `consegna-build/logs/` e `consegna-build/linux-production-results/` nel banco locale.

### Avvisi sul vecchio ramo Google

Le sei voci moderate incontrate prima della migrazione Google derivavano da due advisory. Nella risoluzione effettiva Gaxios 7.1.3 e Google-GAX 5.0.8 dichiaravano Rimraf 5, che manteneva Glob 10.5.0 e Minimatch 9.0.9. Nel codice JavaScript distribuito dai due padri, rispettivamente 24 e 47 file, la ricerca statica non ha individuato un riferimento letterale a questi tre pacchetti. Il loader del runner ha caricato i pacchetti Google e il Glob diretto 14.0.6 durante avvio, health e impostazioni. Le copie segnalate non sono comparse in questa traccia né durante l'inizializzazione locale del client ModelGarden e una richiesta Gaxios a un server di prova su loopback. L'evidenza copre questi flussi e lascia aperti altri percorsi dei provider. [Advisory Glob](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) · [Advisory Minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249)

### Checkpoint desktop precedente al freeze finale

Il banco conserva i dettagli in `lab/work/qualifica-cli-2026-11-22/consegna-build/`. Il manifest `logs/snapshot-desktop-approved.txt` identifica i sorgenti di prodotto sovrapposti a `430b6eb0`, inclusi Computer Use, gestione sessioni e adattatore Ollama: SHA-256 `d1cfd00f1d19e5cb93bd297ac87389a2329f1a121b56cf62a9db2aa91014684a`. Su questa revisione, prima della successiva migrazione Google, sono stati verificati ASAR `cae8c15679dd0a872dcaf6c2b7554646e9b40826e56978921e67cff34491a0f2` e [installer NSIS senza firma](../../work/qualifica-cli-2026-11-22/consegna-build/artifacts/desktop-approved/aider-desk-0.88.0-setup.exe), 285.149.689 byte, SHA-256 `e51e4e1d7b06915da4d67abfa802c83a77f4e41bd43009c42a515ec3895c0fdb`. Il desktop ha caricato il renderer dall'ASAR anche in modalità generale con profilo temporaneo. L'apertura dell'eseguibile scompattato è stata verificata separatamente dalla creazione del programma di installazione.

## Storico della prima qualifica su `430b6eb0`

**Prima prova sul commit `430b6eb0`: consegna non qualificata.** Nel progetto consumatore la CLI si apre e Probe si installa, ma due patch distribuite non raggiungono le dipendenze effettivamente usate. Con CI attiva l'installazione si interrompe. Anche il comando di build del pacchetto termina con errore al suo audit finale.

### Banco e artefatto

Windows x64, Node 24.14.0, npm 11.9.0. Sorgenti da `git archive` del commit `430b6eb0d22d084e0e9f03e1bcf0b259c4a45c25`. Due progetti consumatori vuoti e separati, profilo sintetico, cache di prova e registro npm pubblico. I comandi di installazione hanno eseguito gli script del ciclo di vita. Gli smoke hanno escluso la risoluzione di moduli Node esterni al consumatore. Tutte le scritture del banco sono sotto `lab/work/qualifica-cli-2026-11-22/`.

Il tarball diagnostico `@aiderdesk/aiderdesk@0.87.0` contiene 660 file, 19.304.137 byte compressi. Il comando di build conserva la versione propria della CLI. SHA-256 dell'archivio ottenuto:

```text
73311ad5da148dc96688c8267ddf98023873314e3678fb6b41902f3c7c2aaaa9
```

### Risultati della prima prova

| Prova | Esito | Evidenza |
| --- | --- | --- |
| Preparazione del checkout da archivio | PASS | `npm ci --ignore-scripts --no-audit`, applicazione delle patch radice e `npm run build:extensions` terminati con codice 0. |
| `packages/app/build.sh` | FAIL | Runner, CLI, renderer, risorse e manifest generati. Il passo finale `npm audit fix` ha cambiato il lock nella copia del banco e restituito 1 con sei segnalazioni moderate nella catena di Glob/minimatch. Questa è la misura sull'albero di build del 22 novembre. |
| `npm pack` sui file prodotti prima dello stop | PASS | Presenti comando CLI, runner, renderer, risorse, downloader e due patch. Tutte le 75 dipendenze dirette dichiarate hanno versione esatta. Gli override corrispondono alla radice. Il tarball non contiene lock né shrinkwrap. |
| Consumatore, `npm install <tarball> --foreground-scripts --no-audit`, con `CI=1` | FAIL | `patch-package` cerca `node_modules/ai` e `node_modules/@requesty/ai-sdk` sotto la directory della CLI. npm li ha collocati nel progetto consumatore. I due errori interrompono il postinstall prima del download di Probe. |
| Altro consumatore, stesso comando con `CI` assente | FAIL sulla conformità delle patch | npm restituisce 0 e si installano 950 pacchetti. Entrambi gli errori compaiono nel postinstall. Tutti i cinque file interessati coincidono con i tarball originali del registro e differiscono dai file della build con patch applicate. |
| Probe Windows nel consumatore senza CI | PASS | Downloader incluso identico al sorgente archiviato. Il postinstall scarica il binario, verifica il digest e `probe.exe --version` restituisce `probe-code 0.6.0`. SHA-256 eseguibile `4468c1874e236e976d25faa803f18b0f55f942f526335747acbce2dbf9a1c023`. |
| Ingresso CLI installato | PASS ristretto | `node_modules/.bin/aiderdesk.cmd --help` elenca i comandi previsti. `--version` restituisce `0.87.0`. Restano da provare l'avvio del servizio e una sessione effettiva dopo la correzione della consegna. |

Il README della prima prova attribuiva al postinstall anche il download di `uv`. Il candidato descrive ora la verifica di Probe nel postinstall e la ricerca di `uv` durante la preparazione Python. Nel tarball provato lo script del pacchetto invoca `patch-package` e il downloader di Probe. L'archivio non contiene un eseguibile `uv`. La prova non ha esercitato la successiva preparazione Python.

### Dipendenze installate nella prima prova

Confronto tra il lock CLI versionato e i manifest su disco della nuova installazione locale. Gli override nel manifest del tarball non governano la risoluzione nel progetto che lo installa come dipendenza. npm documenta questa regola per il manifest radice. [npm CLI 11, package.json, sezione overrides](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#overrides)

| Pacchetto | Lock CLI del candidato | Progetto consumatore |
| --- | --- | --- |
| Sharp | `empty-npm-package@1.0.0` | `sharp@0.34.5` |
| Undici | 7.30.1 e 8.12.3 | 5.29.0, 7.30.2 e 8.12.3. La dipendenza diretta resta 8.12.3. |
| systeminformation | 5.33.16 | 5.33.23 |
| @ai-sdk/provider | 4.0.21 | 2.0.5, 3.0.19, 4.0.7, 4.0.21 e 4.0.39 |
| body-parser | 1.20.9 e 2.4.0 | 1.20.9 e 2.4.0 |
| Handlebars e Zod | 4.7.10 e 4.6.7 | 4.7.10 e 4.6.7 |

Il confronto misura cosa installa npm in questa configurazione. La raggiungibilità degli avvisi nell'uso quotidiano, le altre piattaforme e il pacchetto desktop richiedono prove proprie.

### Replica della prima prova

In una copia pulita del commit preparare i prerequisiti come nella prima riga della tabella. Avviare il file [build.sh](../../../packages/app/build.sh) con Git Bash e `node_modules/.bin` del checkout nel PATH del solo processo. Il primo comando dello script invoca `vite` direttamente. Salvare l'esito del suo audit. Da `packages/app` eseguire `npm pack --json --pack-destination <cartella-artefatti>`. Nei due progetti vuoti eseguire il comando di installazione della tabella una volta per valore di CI, con una configurazione npm vuota e la stessa versione di npm. I numeri delle dipendenze transitive possono cambiare nel tempo.

Per qualificare una correzione, entrambi i consumatori devono applicare il comportamento previsto con dipendenze collocate da npm e mostrare lo stesso esito di installazione. Aggiungere una prova funzionale delle due patch, verificare l'albero effettivo sul tarball e ripetere il collaudo del servizio headless. Log integrali, misure e comandi del banco sono conservati nella directory locale indicata sopra. Il candidato non è stato pubblicato.

## Storico del prototipo con due SDK privati

**Esito: fattibile su Windows nel banco isolato.** Dal tarball diagnostico sopra è stata ricavata una variante locale. Il produttore applica le due patch con errore bloccante, include `ai` e `@requesty/ai-sdk` mediante `bundleDependencies` e lascia al postinstall della CLI il download di Probe. Questa modalità di confezionamento è prevista da npm. [npm CLI 11, package.json, sezione bundleDependencies](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#bundledependencies)

Il progetto di prova aveva già installato le stesse versioni `ai@7.0.127` e `@requesty/ai-sdk@3.5.0`. Prima dell'installazione sono state registrate le impronte dei cinque file interessati. Poi `npm install <tarball> --foreground-scripts --no-audit` con `CI=1` si è concluso con codice 0. Il comando CLI `--help` ha funzionato e il postinstall ha verificato Probe. Il risultato riguarda l'installazione locale con npm 11.9.0.

| Prova di isolamento | Esito osservato |
| --- | --- |
| Risoluzione del modulo dal runner e dal progetto consumatore | Il runner risolve entrambi gli SDK dalla propria directory interna. Il consumatore risolve le copie proprie. |
| Confronto prima e dopo l'installazione | I cinque file del consumatore mantengono le cinque impronte originali. I cinque file caricabili dalle copie della CLI corrispondono alla build con le patch. |
| Immagine di prova con Requesty e trasporto simulato | La copia privata prepara l'immagine e il trasporto simulato restituisce il testo previsto. La copia originale del consumatore continua a rifiutare il formato strutturato dell'allegato prima del trasporto. Nessuna chiamata esterna. |
| Prompt di testo valido con `ai.generateText` e modello simulato | Entrambe le copie restituiscono il saluto atteso. La prova copre il normale ingresso CommonJS usato dal runner. |

Il tarball alternativo è di **23.188.065 byte**, un incremento di **3.883.928 byte (+20,1%)**. Il contenuto scompattato cresce di 19.367.676 byte e 2.492 file. npm elenca 12 nomi di pacchetto inclusi considerando le dipendenze transitive. SHA-256 del campione `0f0b98c7cfa333e96f92c4193d7d09bad8b813edd89753836748316a447f5464`. Il banco e i risultati sono in `lab/work/qualifica-cli-2026-11-22/prova-bundle/`.

**Decisione al termine del prototipo.** Il distributore dovrebbe fissare e verificare le versioni transitive del contenuto privato, conservarne avvisi e licenze e rivalutarlo ad ogni aggiornamento degli SDK. La patch esistente a `ai` esclude un controllo di validazione dei messaggi nell'ingresso CommonJS. Prima di distribuirla occorre identificare il caso funzionale che la richiede e decidere se mantenerla o restringerla. Quel pilota aveva verificato l'isolamento dei cinque file e un caso Requesty. A quel punto restavano da provare l'audit di build, gli altri override, il servizio headless e le altre piattaforme. Le prove successive, descritte in apertura, hanno qualificato la variante con Requesty privato e validazione originaria di `ai`.
