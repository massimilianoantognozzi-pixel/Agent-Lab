
# Ambiente governato Agent-Lab

Esegui la build descritta nel [README](../../README.md) e apri **Apri-Agent-Lab-Completo.cmd**. Il primo avvio crea un profilo locale vuoto. Aggiungi il tuo provider nelle impostazioni dei modelli di AiderDesk e seleziona un modello nel profilo agente. Gli avvii successivi riutilizzano le impostazioni e le associazioni già salvate.

## Lavoro sul repository

- `/workflow bug <richiesta>` richiede un controllo di riproduzione che fallisca sullo stato iniziale.
- `/workflow change <richiesta>` prepara un piano con la differenza di comportamento, il riuso e i criteri verificabili.
- `/workflow feature <richiesta>` prepara un blueprint con flusso, dipendenze, scenari e domande aperte. Il testo libero avvia lo stesso percorso.
- `/workflow approve <versione>` approva la revisione mostrata in chat. Se le fonti, la memoria o la configurazione sono cambiate, l’approvazione perde validità.
- `/workflow status` rilegge piano e ricevuta. `/workflow resume` riprende un piano già approvato dopo un’interruzione.
- `/workflow learn` propone una lezione dal piano e dalla ricevuta. `/workflow remember <versione>` la approva per i piani futuri di quel progetto.

Le procedure sono integrate in `workflow-skills.ts`. Superpowers guida chiarimento, piano, debugging e revisione. Spec Kit e OpenSpec guidano requisiti, scenari e differenze rispetto all’esistente. Compound Engineering alimenta la memoria dopo approvazione. Il motore verifica autonomamente scope, approvazione, controllo di riproduzione per i bug, esiti dei controlli, revisione separata, inventario della consegna e applicabilità della patch.

Il risultato è una **cartella candidata e una patch Git**. Il messaggio di consegna indica entrambi i percorsi. Prima di integrare la patch nel repository, apri il diff e usa `git apply --check "<percorso patch>"` dalla radice. Applica la patch soltanto alla revisione prevista dal piano.

## Aggiungere un repository

Nel profilo locale `lab/profile/workflow-pilot/data`, copia `managed-workflow.example.json` in `managed-workflow.json`. L’esempio punta a `repository-example` e contiene gli identificativi segnaposto `your-provider-id` e `your-model-id`. Sostituiscili con quelli del tuo profilo agente. Per usare un altro repository, imposta identificativo, radice assoluta, fonti, contesto, file modificabili e controlli. Apri il progetto in AiderDesk e riavvia l’app dopo aver cambiato il file.

- Le fonti approvate sono richieste prima del piano e caricate con il loro ruolo. Inserisci lì regole, blueprint, decisioni e catalogo di componenti.
- I file del contesto vengono usati per pianificare. I file modificabili devono inoltre comparire nel piano approvato.
- Il profilo del modello deve coincidere con quello dichiarato nella configurazione. Prima di autorizzare un repository, verifica quali documenti possono essere inviati al provider scelto.
- I controlli locali possono verificare JSON, sintassi JS/TS, un’espressione TypeScript e condizioni testuali. Per eseguire il codice candidato, dichiara un controllo Docker con l’identificatore SHA-256 di un’immagine già disponibile e gli argomenti del test. Il job usa la copia in sola lettura, senza rete, con risorse limitate.
- I repository governati non avviano automaticamente estensioni o MCP del progetto. Il profilo Agent-Lab mantiene le estensioni del laboratorio, inclusi OpenAI Codex Auth e Ragionamento.

## Controllo dal telefono

Con l’avvio completo e il collegamento HTTPS configurato, apri **Impostazioni → Associa telefono** in AiderDesk. Dalla pagina remota puoi creare un task, inviare la richiesta, leggere il piano, approvare la sua versione, seguire i controlli, interrompere o riprendere il lavoro e revocare la sessione.

Il listener è su loopback. Per raggiungerlo da un altro dispositivo, inoltra **solo questo endpoint** mediante un collegamento privato cifrato o un reverse proxy HTTPS fidato. Il PC e Agent-Lab devono rimanere attivi. La pagina remota non contiene le credenziali del provider.

La web app usa il primo progetto in `managed-workflow.json`. Per sceglierne un altro, imposta `AIDER_DESK_WORKFLOW_REMOTE_PROJECT` con il suo identificativo prima di avviare AiderDesk.

Sul telefono la Home mostra il progetto associato e le conversazioni. La chat conserva i messaggi del flusso governato. Il pannello dal basso contiene piano, verifiche e patch della revisione mostrata. I dettagli di esecuzione interni restano nel contesto desktop.

Il selettore **Manuale / Guidata / Autonoma** usa l’impostazione del task condivisa con AiderDesk. Le nuove chat iniziano in **Guidata** salvo scelta diversa. Se l’autonomia è bloccata dal PC, il telefono la mostra e il server rifiuta i cambi. Il pannello mostra **Accesso al PC · Progetto associato** separatamente. Ogni modalità mantiene l’approvazione del piano governato. Il ragionamento è configurabile dal compositore e salvato sullo stesso task.

## Ricostruzione e prova

```powershell
npm run typecheck
node node_modules/electron-vite/bin/electron-vite.js build --outDir lab/work/workflow-environment-desktop-pair-build
node lab/scripts/verify-workflow-environment.mjs
```

Il collaudo usa un repository dimostrativo e un profilo temporaneo per il browser remoto. Il test su telefono fisico attraverso un trasporto privato e le verifiche Docker con immagini del progetto si eseguono quando quei prerequisiti sono disponibili.


## Esito della consegna

La build completa è stata avviata con il profilo autenticato. GPT-6.1 Sol ha prodotto il piano del bug del repository dimostrativo a partire dal client remoto locale. Agent-Lab ha salvato la revisione in attesa di approvazione e il sorgente è rimasto identico. Il collaudo automatico ha eseguito la consegna con risposte controllate, verificando la riproduzione rossa, i controlli verdi, la review, la patch e l’invalidazione di una ricevuta modificata.

- 26 test mirati, typecheck, lint, build e controllo Gitleaks sul nuovo codice superati.
- Electron ed Edge hanno verificato associazione, task dal client mobile simulato e revoca. L’endpoint attivo ha rifiutato la lettura dei task senza associazione.
- L’asset principale del renderer è rimasto a 29.691.924 byte. La pagina remota pesa 6.146 byte prima della compressione e viene servita dall’ingresso separato.
- Il motore Docker non era attivo durante il collaudo. La prova da telefono attraverso un collegamento privato e il confronto con il flusso ordinario restano da eseguire.

## Web app Android e collaudo con Docker (11 novembre 2026)

In AiderDesk apri **Impostazioni → Associa telefono**. Con Tailscale attivo, scansiona il QR dal telefono. Il codice compare già compilato nella web app. Premi **Associa**. Quando sul telefono compare la Home, il QR si chiude sul PC e AiderDesk torna in primo piano. Da Chrome puoi scegliere **Installa app** o **Aggiungi a schermata Home**. Il QR è monouso e dura 20 minuti. Puoi annullarlo chiudendo la finestra. Il comando **Mostra-QR-Agent-Lab.cmd** resta disponibile come alternativa.

L’associazione resta registrata nel profilo di Agent-Lab attraverso i riavvii e il browser usa un cookie di lunga durata protetto. Se il browser cancella o perde quel cookie, puoi associarti di nuovo. **Revoca-Telefono-Agent-Lab.cmd** disassocia il telefono e invalida i QR precedenti dal PC. La voce **Disconnetti dispositivo** revoca la stessa associazione dal telefono.

Per configurare il collegamento privato su un nuovo PC Windows, avvia Docker Desktop e usa le immagini fissate nello script:

```powershell
docker pull tailscale/tailscale@sha256:ed6480b33c6eb67c9cbd203ed42b9fb57e361986725b6856def71b7a3d9e276c
docker pull node@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
node lab/scripts/start-agentlab-private.mjs
docker exec agentlab-remote-tailnet tailscale up --hostname=agent-lab --accept-dns=false --timeout=0s
```

Completa il login nella tua rete Tailscale, poi esegui `docker exec agentlab-remote-tailnet tailscale serve --bg --https=443 http://127.0.0.1:8080`. Riavvia Agent-Lab per rilevare l’indirizzo HTTPS privato. Il relay inoltra le rotte della web app al listener locale sulla porta 24363. Per usare il telefono lascia attivi PC, Docker Desktop e Agent-Lab e collega il telefono alla stessa rete Tailscale.

### Risultati sul bug del filtro dei turni

- Il task governato `c73f696a`, approvato dall’utente, ha consegnato la patch di `src/turni.ts`. Ha registrato sintassi, regressione, etichette, review separata e verifica di applicabilità della patch. Il sorgente di partenza è stato controllato dopo la consegna.
- Il task ordinario `5d98c76f` ha usato GPT-6.1 Sol, la stessa richiesta e una copia della stessa partenza. Aveva strumenti limitati al repository sintetico e lo stesso controllo Docker disponibile. Ha eseguito il test rosso, corretto il filtro, rieseguito il test verde e raggiunto `READY_FOR_REVIEW`. Una prima prova ordinaria è stata esclusa perché il perimetro bloccava la ricerca dei file.
- Il controllo Docker indipendente ha verificato il caso originale rosso, la consegna governata verde e la correzione ordinaria verde. Ha controllato anche assenza di interfacce di rete extra e volume sorgente in sola lettura. Un test separato ha eseguito il runner Docker dell’ambiente governato dalla riproduzione alla consegna.
- I due percorsi hanno risolto lo stesso caso funzionale. Nel percorso governato l’approvazione, la review separata e le prove erano condizioni della consegna. Nel percorso ordinario il modello ha scelto di eseguire la regressione e il task è arrivato alla revisione.
- Edge ha verificato manifest, icone, fallback offline e associazione su viewport mobile. L’installazione e il giudizio grafico sul telefono fisico sono rimandati come richiesto.

### Interfaccia remota aggiornata

La build con Home, nuova chat e conversazione è attiva all’indirizzo privato. Electron ed Edge hanno verificato ricerca, riapertura della cronologia, salvataggio di autonomia e ragionamento, blocco dal PC e revoca. Le prove UI con risposte controllate hanno verificato i pulsanti del piano e della patch con la revisione corretta. Il server è stato verificato anche via HTTPS privato e restituisce 401 prima dell’associazione. I 25 test mirati, typecheck, lint, build e Gitleaks sono passati. L’asset principale del renderer desktop conserva lo stesso hash della build precedente. La pagina remota è di 42.719 byte prima della compressione. Il collaudo grafico è stato eseguito a 320 e 390 px in Edge. La tastiera e l’installazione sul telefono fisico restano da provare sul dispositivo.

### Associazione persistente e QR

Edge ha verificato la lettura del frammento, la conferma esplicita, il cookie protetto e la riapertura in una nuova scheda dopo il riavvio di Agent-Lab, senza un secondo pairing. La verifica Tailscale ha associato e poi revocato un dispositivo di prova. L’utente ha confermato l’associazione dal proprio telefono. L’encoder QR locale proviene da Project Nayuki, licenza MIT, revisione bcfe1b018cec5f1f91b5705eca5bb4cdd34e9f8d.

### QR integrato in AiderDesk

Il collaudo Electron ed Edge ha verificato apertura dal menu, chiusura dopo la conferma della Home, rifiuto del QR annullato, riapertura dopo il riavvio e revoca. Una conferma di un dispositivo precedente lascia aperta la finestra del nuovo QR. Il server rifiuta le conferme senza cookie o da un’origine diversa. Sono passati i 20 test mirati, incluso il runner Docker, oltre a typecheck, lint, build e Gitleaks. Dopo il riavvio della build aggiornata, il record dell’associazione esistente ha conservato la stessa impronta e il relay ha restituito 200 per la Home e 401 per i task senza cookie.

Se la connessione si interrompe mentre il telefono conferma l’accesso, riapri la web app per inviare di nuovo la conferma. Il collaudo del nuovo dialogo usa Edge con viewport mobile.
