# Ripresa del riallineamento generale

## Ambiente governato per repository (11 novembre 2026)

Il flusso sperimentato nel pilota è disponibile anche su repository dichiarati nel profilo locale. L’avvio completo riusa l’account e il selettore di ragionamento del pilota. Avvio, configurazione, comandi, memoria approvata, consegna della patch e pagina remota sono descritti in [WORKFLOW-ENVIRONMENT.md](WORKFLOW-ENVIRONMENT.md).


## Pilota sviluppo governato e requisito remoto (11 novembre 2026)

Il laboratorio usa la base locale AiderDesk 0.88.0 e l'estensione OpenAI Codex Auth 1.3.0 del checkout. Il profilo pilota è sotto `lab/profile/workflow-pilot`. L'avvio normale usa il profilo precedente. Il checkpoint sorgenti di questa sessione è `lab/work/workflow-checkpoint-1794420825613.zip`. Contiene 121 file e un manifesto con i digest. La verifica di riapertura ha confrontato ogni digest. Credenziali, profili e runtime sono fuori dal checkpoint sorgenti.

### Flusso del pilota

- Invia una richiesta in italiano o il dettato trascritto. Il software carica le fonti correnti, genera il piano e mostra la sua versione.
- Il comando desktop `/workflow approve <versione>` autorizza quella versione. Le domande aperte o le fonti cambiate fanno sospendere l'avanzamento.
- GPT-6.1 Sol genera una proposta per il solo `view.json` sintetico. Il processo principale controlla schema, riuso, etichette e comportamento in Edge su fixture fidata. Avvia una revisione separata con un nuovo contesto. Un esito assente o ambiguo lascia aperto il task.
- La proposta e le prove vengono salvate nel profilo prima della sostituzione atomica del file. `/workflow status` mostra lo stato. `/workflow resume` riprende una consegna registrata. `/workflow discard` scarta una proposta pendente.
- Il confronto con il percorso ordinario usando lo stesso modello e l'uso su repository reali restano prove successive. Il pilota dimostra il contratto sul campione e sui tre comportamenti definiti.

```powershell
node node_modules/electron-vite/bin/electron-vite.js build --outDir lab/work/workflow-pilot-build-reasoning
node lab/scripts/verify-workflow-pilot.mjs
node lab/scripts/launch-workflow-pilot.mjs
```

Nella finestra separata usare Impostazioni, Estensioni, OpenAI Codex Auth e Sign in with Browser. Il browser gestisce l'accesso. Il catalogo di GPT-6.1 Sol e la connessione effettiva sono due verifiche distinte.

### Ragionamento del modello

Nel pilota GPT-6.1 Sol, accanto al modello, il selettore Ragionamento offre Predefinito, Basso, Medio, Alto e Molto alto. La scelta è salvata nei metadati del task e vale per tutte le chiamate del ciclo governato. Electron ha verificato la selezione e la persistenza di Alto. Una richiesta reale su OpenAI Codex con reasoning high ha prodotto un piano nel task di verifica. La consegna approvata è stata controllata dopo la prova.

### Requisito remoto da sviluppare

Agent-Lab continua a eseguire il lavoro sul PC. Il cliente mobile deve poter vedere i task autorizzati, inviare richieste, leggere il blueprint, approvare la versione mostrata, seguire le prove e interrompere il task. La chiusura resta nelle mani dello stesso controllo applicativo. Il server web già presente è la base da valutare per riusare UI e sessione. Servono associazione del dispositivo, accesso privato cifrato, revoca e permessi limitati ai task selezionati. Le credenziali del provider restano nel profilo sul PC. Il pilota di questa sessione usa solo l'anteprima locale e l'approvazione da desktop.

### Esito del checkpoint

- 22 test mirati PASS, incluse approvazione obsoleta, verdetto mancante, browser rosso, ripresa di una consegna pendente e invalidazione dopo una modifica.
- Typecheck, lint sui file toccati, build separata e Gitleaks sul nuovo codice PASS.
- Smoke Electron PASS per registrazione di OpenAI Codex e GPT-6.1 Sol, instradamento del comando dalla chat e rifiuto di una chiusura senza prove. Playwright su Edge ha verificato la pagina campione in viewport mobile e il risultato del verificatore eseguito come processo separato.
- Riesame indipendente completato e rilievi trattati. Le prove automatizzate usano risposte simulate per il modello. Il login reale tramite codice dispositivo e la prima richiesta su OpenAI Codex con GPT-6.1 Sol sono riusciti l’11 novembre. Il task pilota 711c19d7 è stato approvato e consegnato con GPT-6.1 Sol. AiderDesk ha registrato lo stato DONE con esito dei controlli deterministici, della prova browser e della revisione separata. Il diff del campione contiene soltanto i tre flag previsti in view.json. Il controllo finale in Edge ha ripetuto tutti gli scenari approvati. Evidenza locale in lab/profile/workflow-pilot/data/workflow-live-delivery.json. L’utente ha approvato la consegna del pilota l’11 novembre 2026. Il confronto con il flusso ordinario resta da eseguire.
- La build finale del pilota è aperta sul profilo dedicato. I listener verificati del pilota accettano connessioni locali. Per il remoto restano implementazione, revisione e prova da un secondo dispositivo.

## DEVSTRAL LOCALE RIPRISTINATO - 10 novembre 2026

- Ripristinato il backend Ollama dedicato `127.0.0.1:11435` dopo il cambio
  di runtime da 0.40.12 a 0.40.15. Aggiornato solo il pin SHA-256 e il
  relativo commento in `lab/scripts/local-ollama.mjs`: firma Authenticode
  valida (Ollama Inc.), SHA-256 `544216ca2082b8bc19b4ba94b513f0098fa06774b232f3c140090e3449e322a5`.
  Review indipendente e `node --check lab/scripts/local-ollama.mjs`: PASS.
- Avvio da `node lab/scripts/launch.mjs`: finestra riaperta, backend 0.40.15
  su 11435, cloud disattivato, due modelli Devstral in catalogo. Archivio
  privato riusato; Ollama standard su 11434 e rimasto attivo.
- Prova sintetica sulla 11435 con l'adattatore Ollama usato dall'app: risposta
  semplice, esecuzione di una chiamata allo strumento `read_probe` e risposta
  basata sul valore restituito. Tre richieste `/api/chat` HTTP 200. Alias
  `devstral-aiderdesk:24b`, parser `ministral`, contesto 32768, modello
  interamente caricato in GPU durante la prova.
- La prova copre il ciclo richiesta/strumento/risposta con l'adattatore;
  non e un collaudo di tutti gli strumenti nativi o di Aider Code. Nessun
  commit/push. Un successivo cambio di binario richiede una nuova verifica
  della firma e dell'impronta prima di aggiornare il pin.

## AUTO-HANDOFF CONFIGURATO - notte 29/30 ottobre 2026

Fonte di dettaglio unica: [AUTO-HANDOFF.md](AUTO-HANDOFF.md). Handoff75/0 globale
e nei due profili, template/regola di continuita supportati, backup privato;
attivita aperta allineata a soglia ereditata e Autonoma.24prove offline PASS,
nessuna nuova chiamata modello e nessuna modifica dei sorgenti applicativi o
dell'orchestratore OpenCode. Restano limiti nativi di ereditarieta dal padre,
errori di handoff e fallback manuale. GLM4.5Flash resta primario.
App chiusa normalmente su richiesta utente; previsto spegnimento del PC a fine
controlli. Prossima eventuale verifica: handoff reale solo con autorizzazione
a consumare token. Nessun commit/push.

## INTERFACCIA ITALIANA APPLICATA - 28 ottobre 2026

Richiesta utente di traduzione completa:1924voci, menu nativi, impostazioni,
messaggi e avvisi. Modifiche solo ad Agent-Lab. Italiano selezionato e GUI
riaperta/verificata; profili cloud4.5Flash/localeriserva preservati.
514testinterfacciaPASS,13miratiPASS, typecheck/lint/build/budget/smokePASS.
Review indipendente e backup della versione compilata precedente conservato.
Dettagli e limiti: LOCALIZATION-IT.md. Il menu nativo segue la lingua all'avvio;
dopo cambio lingua richiede riavvio. Altre lingue restano disponibili.

## CLOUD COLLEGATO E COLLAUDATO - 28 ottobre 2026, chiusura del blocco

Questa sezione supera i punti precedenti "chiave mancante/cloud disattivato".
L'utente ha creato e inserito personalmente una chiave Standard Z.AI e abilitato
il provider. Non ha condiviso la chiave in chat; nessuna carta o ricarica
attivata da Codex. Il saldo non e stato verificato: l'utente ha chiuso il portale.

- Scelta primaria nel profilo generale: Z.AI Standard (API), glm-4.5-flash.
  Profilo separato Devstral locale - riserva, id local-fallback. Nessun cambio
  automatico a un modello pagato. Strumenti e funzioni generali invariati.
- Listino ufficiale verificato oggi: glm-4.5-flash e glm-4.7-flash Free per
  input/cache/output. Tutti gli altri modelli del catalogo NON sono gratuiti.
  Non promettere assenza quote giornaliere o continuita illimitata: non provate.
- Catalogo /models omette le varianti Flash gratuite anche se /chat/completions
  le serve. Aggiunti come modelli custom nativi, con metadata prezzo0 e contesto
  128K per4.5/200K per4.7. Il provider e stato rinominato senza "gratuito" per
  evitare di classificare gratis l'intero catalogo.
- GLM4.5Flash rawAPI: risposta584ms, tool4179ms; proposta corretta su5casi con
  validatore indipendente. Report zai-4.5-flash-api-proof.json.
- GLM4.5Flash AgentAuto569c2510: saluto7703ms, lavoro22807ms. Letture, testFAIL,
  correzione reale e testPASS; cinque test indipendenti, immutati; zero domande.
  Tutte le risposte del modello hanno ID zai-standard-free-candidate/glm-4.5-flash.
  Report zai-4.5-aiderdesk-proof.json.
- GLM4.5Flash Code742825ad: modifica docstring reale15645ms; cinque test
  indipendenti PASS e testimmutati. Report zai-4.5-code-proof.json.
- GLM4.7Flash non scelto come primario: prima risposta429/1305(overload), poi
  risposta/tool200 in494/886ms ma prima proposta sbagliata. In Guided diagnosi
  corretta e richiesta approvazione prevista dal workflow; nessun edit.
  In Auto ha scritto formula corretta e rilanciato i test, ma non concluso
  entro600s; anche noStream ha superato180s sul saluto. Entrambe proveFAIL,
  non certificare la fase completa perche il codice appare corretto.
- Un tentativo4.5 invalidato per catch su return void nel controller, corretto
  con Promise.resolve e ripetuto. Non attribuirlo al modello.
- Il controller ora approva solo la domanda Code esatta della propria
  fixture/task; altre domande interrompono la prova. Non e un isolamento OS.
- Review indipendente zai_cloud_proof_review: tre finding dei probe risolti
  (PASS semantico, approvazioni ristrette, provider mantenuto in Code); review
  finale di promozione e report senza nuovi blocker nel perimetro letto.
- App riaperta da icona: GUI conferma glm-4.5-flash per Agent/Aider, contesto128K.
  CorePython pronto, aider-chat0.86.2 verificato. Locale sulla11435 separato.
- Nessun commit/push. Build/typecheck/lint e suite1530PASS/43FAILNode e509PASSUI
  del blocco precedente restano riusati: modificati solo script di prova e
  configurazioni private, non sorgenti applicativi dopo quei gate.

Prossimo uso: aprire il progetto desiderato, profilo AiderDesk - sviluppo
generale; scegliere Auto per esecuzione autonoma. Guided chiede approvazione
del piano per cambiamenti non banali, non e una quota di messaggi.
Per passare al locale scegliere Devstral locale - riserva dal menu profili.
Restano aperti43FAILupstreamWindows,10segnalazioni dipendenze(3alte), verifica
quote/saldo provider e copertura limitata delle prove. Nessuna certificazione
generale di sicurezza o autonomia su qualunque progetto.

## RIPRESA ATTIVA - 28 ottobre 2026

La richiesta "riprendi il lavoro su AiderDesk" revoca la pausa sotto.
Perimetro invariato: AiderDesk completo, sviluppo deciso dall'utente.

Completato e verificato oggi:

- Migrazione v3 al fallback devstral-aiderdesk:24b solo se era selezionata la
  vecchia base; altre scelte e override modello conservati. Alias con stessi
  pesi, parser ministral e num_ctx32768; un alias divergente non si sovrascrive.
- Ambiente generale eredita la toolchain dell'utente, senza IPC Codex. Non
  impone offline, Git privato o Python interno al PATH. Prove sintetiche hanno
  impostazioni proprie. Nessuna modifica delle variabili globali Windows.
- Avvio GUI anche senza backend locale: prova reale di indisponibilita PASS,
  finestra utilizzabile e chiusura normale exit0. Riavvio da icona Desktop e
  doppio avvio mantengono la stessa istanza. Diff slug.ts verificato in GUI.
- La copia privata Serena usa il progetto attivo; rimossa anche l'esclusione
  execute_shell_command che apparteneva al prototipo. Nuove scelte utente
  successive non vengono azzerate. Nessuna modifica Serena originale.
- Task TypeScript8157ccca: Serena simbolica sul file attivo, implementazione
  slugify, cinque test indipendenti PASS e test immutati; lavoro37.475s,
  saluto/riscaldamento separato38.796s. Report general-typescript-proof.json.
- Task Aider Code a1884db3: JSDoc aggiunto realmente al file in10.977s;
  regressione5test PASS, test immutati. Report general-aider-code-proof.json.
  La prima prova aveva ereditato una vecchia fixture Claude; il controller ora
  passa mainModel/weakModel alla creazione. Corretto anche il caso applicativo
  in cui il cambio modello prima del connector veniva perso: pendingModels
  consegnato una volta, prima di Ready. Test mirato2PASS.
- KB esclude anche lo storico .aider.*history dalla raccolta automatica.
  Dieci test GeneralMode/KB PASS; otto controlli script/config PASS.
- Build/typecheck completi PASS. Lint file modificati PASS dopo sola pulizia
  di parentesi/formattazione. Node1530PASS/43FAIL; confronto nomi43fallimenti
  identici al riferimento precedente, nessun nuovo fallimento. Renderer509PASS.
- Review indipendente general_resume_review: due findingP2 (temporanei fissi
  e contesto alias divergente) risolti e testati; nessun nuovo blocker concreto
  nel delta AiderManager. Review statica, nessuna certificazione generale.
- Ollama aggiornato esternamente a0.40.12: firma Authenticode Valid OllamaInc,
  release ufficiale verificata e hash runtime ricontrollato. Nuovo digest
  aa76635f0a54c663093a9d1c307f6abde3fb4fa0b1aebfd42f71b6faeec0a8e5.
- Audit aggiornato:10segnalazioni (3high,2moderate,5low,0critical). Alte su
  zod3/zod-validation-error e vecchio eslint-plugin-react-compiler; nessuna
  promessa di sicurezza universale. File npm-audit-2026-10-28.json.
- Hash originali OpenCode AGENTS/opencode.json e Serena invariati.

Punto aperto che richiede l'utente:

- Provider Z.AI Standard gratuito predisposto, disattivato, chiave vuota:
  endpoint https://api.z.ai/api/paas/v4, glm-4.7-flash, thinking disabled.
  Il listino ufficiale conferma Free input/cache/output; quote giornaliere,
  accesso saldozero e comportamento reale vanno provati con chiave Standard.
- L'utente possiede soltanto una chiave OpenRouter: non e valida per Z.AI.
  Aperta pagina ufficiale API Keys; login e creazione chiave affidati all'utente,
  senza incollarla in chat. Nessuna carta, ricarica o piano pagato autorizzato.
- Dopo inserimento nell'app, fare test reale di risposta+tool, errori429/402,
  costo e limiti account; se richiede pagamento, scartare questa pista.
- Qwen non scaricato/testato: nessuna superiorita Devstral dimostrata. Locale
  gia riqualificato per continuita; confronto equo futuro su medesimi compiti.

Non ripetere automaticamente suite gia valide dopo sole modifiche documentali.
Nessun commit/push delle modifiche applicative. App lasciata aperta all'utente.

## PAUSA ESPLICITA UTENTE - 26 ottobre 2026

L'utente ha chiesto: "ok per adesso fermati riprendiamo domani".
Non avviare altre implementazioni, inferenze o prove durante la pausa.
Questo checkpoint prevale sui paragrafi di avanzamento precedenti sotto,
che sono storici e contengono passi nel frattempo completati.

Stato verificato alla pausa:

- Nessun processo Electron/Ollama/Node/Python/uv riferito ad Agent-Lab o alla
  porta privata 11435 risulta ancora attivo. Non e stato arrestato il servizio
  Ollama originale sulla porta 11434. Tutti i revisori risultano completati.
- La prova generale reale e riuscita con devstral-aiderdesk:24b: progetto
  Python fuori dal vecchio workspace web, lettura sorgenti/test, diagnosi,
  correzione e riesecuzione. Cinque test indipendenti superati senza modificare
  i test. Fase di lavoro circa 42 secondi; saluto separato circa 21 secondi.
  Evidenza: lab/work/general-gui-proof.json, task 17ab2714.
- File e diff disponibili; KB generata dal modello; chiusura app con exit 0.
- L'alias usa gli stessi pesi di Devstral e il parser ministral: nessun secondo
  download del modello. Prova: lab/work/devstral-parser-proof.json.
- Dieci test mirati GeneralMode/KB superati. Aider/Python privato installato e
  pronto; Code mode e Serena sul progetto effettivo ancora da provare.
- I controlli KB usano evidenze native, hash, sanitizzazione e Gitleaks prima
  dell'invio/persistenza; storico senza formatVersion escluso dalla ricerca.
- Nessun account cloud collegato, chiave usata, acquisto o servizio pagato.
  GLM-4.7-Flash Standard e un candidato gratuito da qualificare, NON una
  garanzia di assenza quote o di accesso con saldo zero.
- Modifiche locali salvate nei file; nessun commit o push applicativo.

Ripresa consigliata, nell'ordine:

1. Promuovere l'alias qualificato a fallback predefinito senza sovrascrivere
   altre scelte utente; rendere il backend locale opzionale per avviare la GUI.
2. Eliminare dall'ambiente generale i vincoli ereditati dal prototipo (flag
   offline, override Git, alterazioni della toolchain); tenere separate le
   impostazioni delle sole prove sintetiche e non importare segreti Codex.
3. Ripulire lab/AGENTS.md dalle vecchie regole web contraddittorie, conservando
   lo storico. La decisione esplicita utente e gia approvata e registrata.
4. Provare un progetto Node/TypeScript, Serena e Aider Code mode; conservare
   il report Python riuscito prima di riutilizzare il nome del report.
5. Preparare il provider Standard gratuito; chiedere solo l'eventuale chiave
   personale necessaria, da inserire direttamente nell'app, senza pagamenti.
6. Build/typecheck/lint/test pertinenti e review indipendente finale; spiegare
   separatamente i 43 fallimenti Windows upstream e le 13 segnalazioni audit
   note (3 high, 5 moderate, 5 low), senza dichiarare certificazione generale.
7. Collaudo launcher/chiusura/riapertura, consegna e valutazione onesta. Devstral
   non e dimostrato superiore a Qwen, che non e stato ancora provato qui.

Il vecchio controller di test riemetteva storico con loadTask: corretto.
Non usare i vecchi tempi/cicli web come misura pulita di autonomia del modello.
Il perimetro resta AiderDesk completo per qualsiasi sviluppo deciso dall'utente;
gli altri progetti e le configurazioni originali restano fuori dalle modifiche.

## Storico precedente al checkpoint di pausa

Decisione utente vincolante: AiderDesk completo, qualsiasi sviluppo deciso da
lui. Rimuovere tutte le restrizioni imposte di progetto, linguaggio, template
e funzioni. Cloud gratuito prioritario/localefallback. Registrato nella memoria
personale su sua richiesta (nota2026-10-25T221700-aiderdesk-sviluppo-generale.md).
NON CHIUDERE sulla demo web e non proporre ancora piccoli lavori come perimetro.

## Fatto nel codice, ancora da provare

- Nuovo configure-general-gui.mjs: profilo strumenti nativi completi, maxIterations0,
  Power/Aider/Todo/Subagents/Tasks/Skills/Extensions e Serena; GeneralModeTRUE,
  LabModeFALSE, quindi nessuna whitelist/file/shell/workspace/metadataGit del
  laboratorio ristretto viene applicata. L'app conserva la propria directory
  dati e porta locale, senza cambiamenti globali Windows.
- Launcher punta a configureGeneralGui/generalEnvironment. Questo script NON
  e ancora stato eseguito/qualificato. L'app e attualmente chiusa dopo la prova
  normale del collegamento; ultimo backend11435 chiuso.
- Ambiente Python/uv perprocesso in lab/profile: cache, managedPython, tooldir,
  venv in lab/profile/data/python-venv (costante upstream). Aiderchat fissato
  a0.86.2 verificato da metadata PyPI ufficiale, autoreAider-AI/aider. Upstream
  installer e stato letto: uvvenv--python3.12--clear nel solo venv dedicato,
  pip install di core+pacchetti fissati. UV gia installato in.local/bin.
  Nessuna esecuzione dell'installer ancora effettuata in modalita generale.
- Serena globalcopy cambia --project fisso in ${taskDir}; upstream MCP gia
  interpola e separa le istanze perproject/task. SERENA_HOME resta copia privata.
- ModelManager in GeneralMode usa normale catalogo/provider; solo il Devstral
  noto conserva il conteggio esatto/reserva32k nel wrapperlocale. Nessuna
  limitazione di altri modelli/provider. Nessun servizio pagato attivato.
- Nuovo general-knowledge.ts e tools/general-knowledge.ts: registro dei risultati
  reali del terminale con exitCode, hash dei file osservati e output; generazione
  JSON di lezione dallo stesso modello e ricerca4voci, senzaembeddings. Hook in
  Agent.processStep e fineprompt; tutti gli strumenti nativi restano presenti.
- Typechecknode PASS dopo primi hook, lintauto sui file principali. Prima di
  avviare controllare nuovamente e aggiungere test significativi per GENERAL.

## Prossimi passi necessari

IMPORTANTE emerso nello smoke: NON fare polling con window.api.loadTask:
riemette vecchie risposte/storico e puo alterare/chiudere prematuramente la
prova. Corretto smoke-general con getTasks read-only, listener domande e
risposte nuove perID/timestamp; loadTask soltanto dopo la fine. Il primo
tentativo generale e stato chiuso dal controller dopo il primo testFAIL,
non e una misura valida dell'autonomia del modello. Nessun giudizio negativo
va attribuito a quel tentativo. Anche i vecchi datiweb hanno questo fattore
di disturbo: i PASSfunzionali restano verificati indipendentemente, l'autonomia
va riprovata pulitamente. L'utente e stato avvisato del difetto del test.
Promosso il fix ordinecleanup da Lab a TUTTI: chiudere progetti prima DB/estensioni.

1. Rivedere compileGeneralKnowledge/observeGeneralToolResult: eliminare stato
   run anche su errore/abort nel finally globale di Agent; controllare fake
   risultati/staleness e tutti i promptutente mantenuti. Non chiamareun'uscita0
   certificazione dell'intero progetto: scope e file osservati sono espliciti.
2. Unit: GeneralMode mostra tutti i tool nativi, nessun filtro/mutazione filetype;
   KB negativa per commandFAIL/stale/rispostaJSONnonvalida, positiva scritta dal
   generator controllato. Verificare non duplicare risultati quandoprocessStep
   aggiornaUI e poi evidence. Aggiungere testgetAllFiles senzaGit con.py/.rs/.cs
   e config nonweb nella cartella di prova.
3. Build e avvio generale, verifica setupPython e strumenti. Controller
   compare/provenienza/backup dei file prima di attivare? Bootstrapvenv deve
   rimanere solo nel path dedicato, evitare installazioni globali.
4. Smoke nativo reale con progettoPython multifile+unittest, modifica/debug e
   regressione; Node/TS o altro caso. Serena sul progetto corretto, KBautocreata.
   Verificare lista file/diff, terminale, ripresa e nessuna quota60passaggi.
5. Cloud: auditor ha indicato Z.AI STANDARD GLM-4.7-Flash come prima candidata,
   Free input/cache/output nel listino. Quote giornaliere assenti NON garantite;
   saldozero/noCard da provare con chiavepersonale senzaacquisti. Il CodingPlan
   ZAI e separato/pagato: usare Standard via OpenAICompatible/api/paas/v4.
   Nessuna chiave importata o disponibile qui. Preparare configurazione concreta
   poi chiedereutente solo chiave/login direttamenteapp quando indispensabile.
   NVIDIA catalogo e seconda pista freeperprototipazione ma quote/crediti moderni
   non sufficientemente documentati nellefonti primarie consultate. Groq/Gemini
   hannoquoteRPD/TPD esplicite; Cerebras free limitato e pricing correntediverso.
6. Review indipendente (worker/read-only) e chiusura solo dopo flusso generale.

## Evidenze precedenti riutilizzabili, non perimetro attivo

README/SESSION-STATE hanno ancora paragrafi storici web: riorganizzare allafine.
Banco web: crea landing5m48s, vecchio task fallisce60iterazioni, taskpulito con
feedback preciso corregge in97s. Non chiamarequelrisultato autonomia totale.
33azioni indipendenti browserPASS + oracolo volutamenteerratorespinto; screenshot
outputs ancora da esportare. Ultimaprovaweb33f817ff-15db-4191-a287-6c0d51d78441;
SHA1a5c8ee912c0230eb11037e6a9a6b32aac15479204c89647873f1ca65ed845db.
KBautomaticae07070db-0bba-4185-9170-cc19d4d4629f.

Rotelline: bugupstream ignorava tool-error. Agent ora emetteToolMessage con
isError/finished anche su chunk/contenterrore; ContextManager lo mantiene nella
riapertura. Due testPASS, UI reale CUA ha mostrato Xrossa e nessunospinnerpendente.

LabUIfile/diff aggiunti perprofiloristretto, inclusa normalizzazionecase/separatori
Windows. Ultima suiteNode1518PASS/43FAILbaseline, poi1testcase aggiunto13PASSper
lab-projects. Renderer509PASS dopo rerun isolato (primo fullsotto carico1timeoutHome5s,
Home9PASSisolato). Audit app13 (3high5moderate5low) noto/degradato.

Cloudsourceauditor: docs.z.ai/guides/overview/pricing, /api-reference/rate-limit,
/guides/overview/quick-start; OpenCodeZenfreeora403 perclientdiversiOpenCode
(dev.opencode.ai/v2/docs/console/api/inference), MiMoCodegratuitotemporaneo e
prodotto separato dall'API. LLMAPI$0 inconflittoTermsdepósito; Neuralwatttrialcard.

Valutazione finale richiestautente: qualita codice, risultato/autonomia/tempi,
spiegareDevstral scelto perriprenderevecchiaprova NON superioreQwen dimostrato.
Qwen3Coder30B Q4ufficiale19GB/MoE3.3B attivi e candidatomisurabile sulla3090 ma
non scaricato/testato, noaffermazionemigliore/performancegarantita.
