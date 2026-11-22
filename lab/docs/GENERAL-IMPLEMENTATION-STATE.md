# Ripresa del riallineamento generale

## 22 novembre 2026 — Documenti dalla chat desktop

Il progetto dispone dello strumento `documents---generate` per creare e verificare Word, PDF ed Excel. Riutilizza il modello del progetto e ricava la tabella stampata dai risultati ricalcolati in Calc. Le consegne versionate comprendono i file richiesti, le anteprime, i dati di origine e la ricevuta. [Uso dalla chat](DOCUMENTI-LOCALI.md) · [Collaudo](quality/documenti-locali-2026-11-22.md).

## 22 novembre 2026 — Cinque lavori prima delle nuove funzionalità

Massimiliano ha confermato il computer use generale e la precedenza dei cinque lavori su immagini, documenti e Remote. Il perimetro del computer use comprende applicazioni Windows e browser.

1. **Computer Use.** Nel candidato desktop Windows x64 la chat usa Cua Driver 0.52.0, la versione verificata nel lock Hermes. L'utente condivide una finestra con il modello scelto oppure autorizza un browser Chromium temporaneo. Sono state provate scrittura e conferma in un modulo WinForms e in Edge; nel browser privato il test legge il valore ricevuto da un server locale e controlla che il PID termini su Stop. Le prove automatizzano il consenso solo su finestre del banco. La guida riporta comandi, copertura e limiti. [Computer Use](COMPUTER-USE.md)
2. **Distribuzione CLI e desktop.** Il collaudo in un progetto consumatore ha individuato due SDK con patch non applicate, differenze nelle dipendenze effettive e materiale di lavoro incluso dalla vecchia configurazione di packaging. Le prove coprono l'installazione pulita, la salvaguardia delle dipendenze del consumatore, avvio, accesso negato e autorizzato sul servizio isolato e contenuto dell'ASAR. Nel pacchetto con i nuovi SDK il consumatore pulito Windows e Linux supera l'installazione ordinaria e l'audit. Le dipendenze già installate dal consumatore conservano le proprie impronte. Il lock completo del desktop restituisce zero avvisi noti anche includendo i tool di sviluppo. ONNX è stato provato su CPU e, con fallback CPU disabilitato, su DirectML e CUDA. La preparazione delle vecchie chat avviene prima della validazione SDK. [Dipendenze e compatibilità](quality/qualifica-dipendenze-2026-11-22.md). [Rapporto di distribuzione](quality/qualifica-cli-2026-11-22.md)
3. **Workflow governato e Linux.** Il correttore riceve la diagnostica Docker strutturata. Il piano e la consegna indicano il metodo del controllo. Nell'esempio Turni il test esegue la funzione e rileva anche il risultato nell'ordine sbagliato. La copia Linux con Node 24 ha superato build, typecheck, 2.014 test Node e 517 renderer. Cinque esclusioni sono registrate nel rapporto. Gitleaks verifica il digest dei binari Windows e Linux x64. Il container resta in sola lettura con UID non privilegiato; la copia privata è stata verificata anche in caso di errore e Stop. La prima esecuzione della CI su GitHub richiede la pubblicazione del ramo o della PR. [Rapporto Linux e CI](quality/qualifica-workflow-2026-11-22.md)
4. **Confronto su codice reale.** Il progetto scelto è Agent-Lab stesso. Su copie isolate del modulo navigazione, entrambe le modalità hanno affrontato un bug, una modifica su più file e una funzionalità con lo stesso Devstral locale. Al primo tentativo la modalità generale ha superato due contratti Edge e la governata uno. Il pilota ha individuato un errore HTTP 500 quando il provider annunciava al modello nomi di strumenti che Devstral poi abbreviava. La correzione traduce quattro nomi univoci solo sull'alias Devstral locale; l'app riceve i nomi originali e mantiene i controlli. Sulla revisione finale il bug passa e la funzionalità passa dopo una ripetizione. Nel governato ora il Planner distingue le risposte ricevute dalle decisioni ancora aperte. Devstral riceve lo schema del verdetto del revisore; la validazione e l'approvazione della revisione restano obbligatorie. Quando un candidato fallisce, il correttore vede i file effettivamente collaudati e la base originale separatamente. Il multifile è stato completato sulla stessa revisione approvata e ha superato il contratto Edge originale. Un chiarimento volutamente incerto ha mantenuto il piano in attesa. [Esiti per caso, modalità e tentativo](quality/pilota-reale-2026-11-22.md)
5. **Memoria delle correzioni.** La regola delle correzioni approvate vale per tutti i componenti del progetto e per ogni nuovo utilizzo. Il desktop la trasmette alla chat Agente e ai ruoli di pianificazione, design, implementazione, correzione e revisione. Il banco concordato sul progetto Edilas resta la prenotazione dalla riga cliente. [Correzioni approvate e componenti condivisi](AIDERDESK-WORKFLOW-BLUEPRINT.md#correzioni-approvate-e-componenti-condivisi)

   Per la ricerca di lezioni tecniche, alla [prima prova di 30 casi](quality/memoria-it-2026-11-22/rapporto.md) è seguito un campione indipendente di 48. Fra 24 richieste estranee il nuovo filtro riduce i falsi allarmi da 9 a 2. Fra 24 pertinenti scende da 17 a 16 risposte giuste. Il criterio fissato prima della misura richiedeva di conservare le correzioni utili. La replica è identica e il profilo desktop mantiene la configurazione attuale. [Rapporto sul filtro di intento](quality/memoria-intento-2026-11-22/rapporto.md)

Massimiliano ha definito il consenso per l’intera coda dopo l’approvazione del blueprint e l’ordine di iniziare. [Decisione e comportamento alla ripresa](AIDERDESK-WORKFLOW-BLUEPRINT.md#4-avvio-e-scelta-dei-task). Restano il collaudo immagini sul conto personale e la discussione sull’app Remote nativa, compresa la durata delle credenziali. Selettore degli ambienti e connettore portatile restano proposte da definire.

**Consegna locale Windows x64.** L’[installer con la funzione documenti](../artifacts/Agent-Lab-locale-documenti/Agent-Lab-0.88.0-setup.exe) ha SHA-256 `6f40ef58b0b460023e471f90af40c1ce172c49e43c7b14cc4c77abd804968984`. I due launcher del checkout includono la stessa build. Il primo avvio diretto usa il profilo Agent-Lab e il servizio su 127.0.0.1:24364. [Collaudo della riapertura](quality/ripristino-stato-scheda-2026-11-22.md) · [Prova in due chat con GLM](quality/riuso-componenti-2026-11-22.md) · [Guida locale](INSTALLAZIONE-LOCALE.md) · [CLI](../artifacts/consegna-2026-11-22/aiderdesk-aiderdesk-0.87.0.tgz)

**Punto di ripresa — immagini.** Massimiliano ha approvato la generazione e la modifica dalla chat e dal Designer per uso locale. Il collegamento al suo account e la verifica dei crediti inclusi sono rinviati al suo rientro. Prima della prova reale, aprire *Impostazioni → Generali → Generazione immagini*, selezionare un profilo OpenAI con chiave propria e verificare sul portale OpenAI il credito dell’organizzazione associata. Il modello iniziale è Sunburst con qualità bassa e formato 1024 × 1024. La selezione è indipendente dal modello di coding. [Guida ai crediti inclusi](https://developers.openai.com/api/docs/guides/chatgpt-api-credits)

Il desktop richiede un consenso per ciascun invio. Mostra prompt, riferimenti, destinazione, profilo e stima del costo del solo output. Le ricevute conservano i conteggi comunicati dal provider e il costo calcolato quando i dati lo permettono. I riferimenti provengono dal progetto aperto e ogni risultato viene salvato in un nuovo PNG. Una richiesta con esito incerto conserva la propria ricevuta per consentire la verifica del consumo. La prova in Electron ha verificato creazione, modifica, riapertura delle anteprime e uso degli asset nella scena. [Esito e prove riproducibili](quality/immagini-locali-2026-11-22.md)

Distribuzione pubblica, Store, eventuale firma per terzi e download tramite GitHub rimangono rinviati.

**Commit manuale proposto.** Summary `Qualifica Computer Use, workflow e distribuzione Agent-Lab`. Description `Integra il driver Windows con consenso per finestra e browser temporaneo. Corregge il recupero del governato e i nomi strumenti di Devstral. Qualifica la migrazione Google, i pacchetti e i controlli Linux/Windows. Registra i risultati della memoria senza attivare il filtro sperimentale.`

## Chiusura del 19 novembre 2026 — Prova di memoria in italiano

**Punto di ripresa per il 20 novembre.** Leggere prima il
[rapporto dei 21 casi](quality/memoria-it-2026-11-19/Prova-memoria-Agent-Lab-IT.html)
e discutere con Massimiliano se provare un controllo del sintomo e della
prova associata prima di mostrare una lezione. L’attivazione sul desktop
è una decisione aperta. La configurazione di uso quotidiano mantiene la
memoria semantica disattivata.

Il banco isolato usa sei schede italiane derivate da comportamenti coperti
dai test. Modello multilingue ONNX q8 eseguito sul PC, taratura e test
separati. Su 12 richieste pertinenti, la ricerca attuale mette al primo
posto 9 correzioni, la semantica 7 e l’ibrida 10. Su 9 richieste da
scartare l’attuale suggerisce una lezione in 8 casi. La semantica con
soglia dà un falso allarme; l’ibrida con soglia si astiene su tutti i
21 casi, incluse tutte le richieste pertinenti.

Sulle 10 parafrasi supplementari prive di termini utili in comune con la
scheda attesa, la semantica colloca la correzione giusta al primo posto
5 volte, l’ibrida 4 e l’attuale 0. La somiglianza aiuta a trovare candidati;
la soglia provata non basta a decidere quando suggerirli. Verifiche eseguite:
38 test di riferimento superati, replica primaria identica e controllo dei
conteggi indipendente. Nell’[archivio di replica](quality/memoria-it-2026-11-19/Dati-e-replica-memoria-IT.zip)
si trovano testi, etichette, punteggi e sorgente del recupero provato.
Le ricevute del banco sono simulate; il collaudo non ha eseguito una
correzione automatica su un progetto cliente.

**Checkpoint Git di fine giornata.** Il commit `213b7727` conserva rapporto,
dati replicabili e punto di ripresa. Massimiliano ha autorizzato anche la
pubblicazione del candidato completo sul ramo `codex/close-security-review-14`
di `origin`, inclusa la bonifica del 18 novembre, i comandi di sessione e la
chiusura desktop. Per la ripresa verificare l'allineamento del ramo con
`origin/codex/close-security-review-14`. La qualifica del pacchetto di
distribuzione e le attività aperte del riesame tecnico restano descritte nel
piano più sotto. La copia di recupero locale del checkout prima dei commit
è in `lab/work/chiusura-sessione-2026-11-19/`.

Prima del push del candidato completo sono passati il typecheck Node/Web,
28 test mirati su chiusura, confini di accesso, estensioni e memoria e il
controllo delle cinque localizzazioni. Gitleaks non ha trovato segreti
nello snapshot dei file da pubblicare. La replica eseguita dall'archivio
Git ha restituito gli stessi JSON sia per il test principale sia per la
prova supplementare.

L'utente ha chiarito il 15 novembre che l'agente deve proseguire
finché può compiere un'azione tecnica in autonomia. Una review
o un errore recuperabile non richiedono un nuovo prompt.
«Riprendi» è ammesso dopo la chiusura del lavoro o quando un
impedimento concreto rende impraticabile la ripresa automatica.
Una validazione manuale necessaria può sospenderlo. Diagnosi,
codice e verifiche tecniche rimangono responsabilità di Agent-Lab.
L'agente può chiedere informazioni sul prodotto e decisioni.
In attesa della risposta, prosegue il lavoro indipendente per
cui dispone già di istruzioni chiare.

Per le API, il perimetro confermato è limitato ai modelli offerti
gratuitamente, come GLM sulla piattaforma Standard. Un eventuale
account Anthropic sarà collegato tramite OAuth autorizzato per il
client. Il collaudo attuale mantiene i provider del profilo.

## 19 novembre 2026 — Chiusura immediata del desktop da sorgente

La finestra Electron aperta con `Apri-Agent-Lab.cmd` intercetta `/chiudi`
all’invio. L’ingresso desktop blocca nuove operazioni nel checkout e conserva
le richieste in coda. Attende le scritture e le ricevute già in corso. I test
nativi dichiarati interrompibili possono essere fermati durante l’esecuzione;
per strumenti o comandi dagli effetti incerti aspetta la fine dell’operazione.
Il connettore Aider aggiornato conferma l’arresto dopo l’uscita dei propri
worker. Una sessione già ferma conserva il suo checkpoint.

Per la chiusura il desktop usa le evidenze della task e i documenti di
stato/ripresa del progetto. Se occorre aggiornarli, pubblica la nota insieme
alle modifiche attribuite alla sessione. Verifica il commit sul ramo remoto
e indica i file rimasti locali. Se il push viene rifiutato conserva il commit
per il tentativo successivo. Il flusso governato avviato dal desktop usa il
ramo di sviluppo configurato. Nel collaudo Git i remoti sono repository bare
locali. L’icona Agent-Lab del desktop ora apre la build in `out/` tramite
`lab/scripts/launch.mjs`. L’avvio dall’icona è stato verificato fino alla
finestra principale. Il collegamento precedente alla r108 è conservato in
`lab/work/desktop-shortcut-backup/Agent-Lab-r108.lnk`.

La prova nella vera app Electron, con profilo temporaneo e remoto bare, ha
confrontato i byte di `root-turn.json` prima e dopo l’invio di `/chiudi`.
Il checkpoint è identico, l’handoff aggiornato è leggibile dal remoto e
lo staging estraneo è conservato. Altri test coprono il comando duplicato
durante una scrittura, il test interrompibile, il rifiuto del push con retry
sullo stesso SHA e il ramo di sviluppo con il checkout principale aperto.

## 19 novembre 2026 — Prompt di sessione e richiamo delle lezioni

I tre prompt concordati sono in [lab/commands](../commands). Nel profilo
generale desktop sono comandi personalizzati nativi, disponibili anche con
l’icona r108. `/inizia` avvia dal blueprint, `/riprendi` usa la documentazione
del progetto, `/chiudi` chiede arresto sicuro, handoff, commit e push. Sulla
r108 un comando personalizzato inviato durante un turno viene accodato.
Su questa versione, se la chat custodisce un turno tecnico interrotto,
si può eseguire il prompt di chiusura da una nuova chat dello stesso
repository per conservare il checkpoint originale.
Prima di pubblicare si verifica il lavoro effettivamente pronto.

Nel candidato, il flusso governato usa i testi entro i propri permessi e le
proprie approvazioni. Le richieste di chiusura governate possono produrre un
piano per il lavoro consentito. Il motore governato non dispone di un passo
che esegua il push remoto. Nessuna pubblicazione è stata provata su un
progetto reale. Per l’icona desktop vale il checkpoint di chiusura immediata
riportato sopra. Il servizio telefono installato usa la consegna precedente.

La memoria governata confermata e la Knowledge Base generale conservano ruoli
distinti. Nel candidato, pianificazione, implementazione e debug cercano
precedenti nel solo checkout pertinente, anche alla ripresa di un piano già
approvato. Il richiamo automatico richiede una ricevuta shell coerente con
esito zero. La lezione è consultiva e non cambia la revisione del piano.
La ricerca lessicale scarta i risultati privi di corrispondenze. Nel profilo
locale la query di controllo dell’audit è passata da quattro risultati a zero.
In una prova sintetica «riavvio worker» ha recuperato la lezione corretta.
«Alla riapertura partono due processi» ha dato zero risultati. Il confronto
successivo fra ricerca lessicale e semantica è nel rapporto di chiusura
del 19 novembre in apertura di questo documento.

Le prove isolate coprono la lettura dei tre file da parte del gestore
nativo, la chiusura inviata dal telefono con il riferimento all’attività
originale e il recupero della lezione in una ripresa dopo verifica fallita.
Il collaudo mobile usa Edge headless con servizi simulati.

## Ripresa 18 novembre 2026 — Riesame Claude e lock CLI

Riletto integralmente il PDF del 16 novembre sul commit r108 e confrontati
gli 11 punti di critica e le quattro sezioni sicurezza con il candidato
attuale. Il riesame distingue sorgenti, dipendenze installate e consegna:
il profilo di uso corrente e la build desktop r108 non sono stati aggiornati.
Il triage statico, gli audit e le prove sono nella raccolta locale collegata
sotto, directory `artifacts/claude-review-2026-11-18/`.

- Il lock CLI era discordante dal proprio manifest per OpenTelemetry,
  Glob e Zod. Allineato Undici al pin root 8.12.3 e copiati gli stessi
  overrides previsti dal generatore; rigenerato il lock in copia isolata,
  con aggiornamento mirato di body-parser. Conservate le dipendenze
  esclusive CLI. Manifest e lock applicati coincidono byte per byte con
  quelli dell'installazione pulita verificata.
- Review indipendente finale dei due manifest: nessuna regressione statica
  rilevata e nessuna vecchia copia dei pacchetti coinvolti nel nuovo lock.
  Il tarball pubblicabile non è stato qualificato: npm esclude il lockfile
  e il downloader Probe viene copiato nella build. Il risultato sul checkout
  non prova l'installazione o gli overrides della distribuzione pubblicata.
- Audit CLI produzione: da 19 segnalazioni (quattro alte) a 13
  (11 medie, due basse, nessuna alta/critica). Il gate alla soglia alta
  termina con exit 0; l'audit completo resta non verde. Audit del lock
  root, senza modificarlo: 11 segnalazioni, sei medie e cinque basse.
  La raggiungibilità dei rilievi residui resta da valutare.
- Installazione CLI con `npm ci --ignore-scripts`: PASS. Suite CLI sulla
  copia isolata: 61 test PASS, con Vitest già disponibile come harness
  e gli stessi pattern di test/alias; non sono stati eseguiti postinstall,
  packaging o launcher. Verificate anche le copie realmente installate
  di Undici, body-parser, systeminformation e Zod.
- Sul sorgente corrente: 29 test mirati host/MCP/URL/remote e nove test
  di configurazione PASS; typecheck Node/Web PASS. Corretto solo il
  formato di open-url e di due test già presenti alla ripresa; lint
  ristretto PASS e 14 test URL/MCP nuovamente PASS. Gitleaks sul diff
  selezionato di manifest, lock e open-url: nessun segreto rilevato.
- Review indipendente del riesame: corretta la distinzione tra dialogo
  nativo dell'app e autorizzazione OS/UAC; il filtro URL di open-url vale
  nel ramo headless. I test URL simulano i processi e non provano l'avvio
  dei browser su Linux/macOS/WSL. Gli override browser sono eseguibili;
  compatibilità Windows con `.cmd`/associazioni non qualificata.
- Il preflight trova Semgrep, Gitleaks e OSV, ma Knip manca. Non è stata
  avviata una nuova scansione generale: il PASS Semgrep finale riguarda
  solo i sette file runtime del blocco; codice morto/RLS non ricevono
  un nuovo verdetto. Nessuna modifica a DB o autenticazione di rete.

**Decisione successivamente approvata dall'utente nella stessa ripresa:**
mantenere autonomia senza tetto fisso e Serena disponibile; arrestare le
ripetizioni senza progresso con checkpoint, legando il consenso host
desktop all'incarico/progetto e rinnovandolo al cambio di perimetro.
La decisione è registrata nel blueprint generale e implementata nel
candidato in `agent-progress.ts`, ciclo Agent, checkpoint/ripresa Task e
consenso host. Due review finali separate sono favorevoli dopo i fix a
stdin, steering, ingressi autonomi e modalità non tracciate, ownership
delle deleghe, processi/worker pendenti e concorrenza/errori della ripresa.
Il lavoro fermato rimane incompleto e conserva il contesto. Nessun tetto
globale: il richiamo alla strategia precede l'arresto delle ripetizioni.

Gate finali sullo stesso sorgente: 1.997 test Node PASS, due esclusi
opzionali del governato (ricerca reale e immagine Docker non configurate),
148 file; build con typecheck Node/Web, lint ristretto e diff check PASS.
Semgrep sui sette file runtime del blocco: zero corrispondenze e zero
errori di parsing; Gitleaks sullo snapshot: nessun segreto. Questi esiti
non estendono la copertura all'intero progetto o alla history.
Impronta aggregata dei 17 file verificati:
`ca869cf4ba7aa15bae9b39636c920765ba2f2928bc235ae988eb8710debd0ae7`.
Rapporto finale e log nella raccolta locale citata sotto, file
`artifacts/claude-review-2026-11-18/esito-blocco.md`.
L'icona confezionata di uso corrente non è stata aggiornata; `out/`
contiene la nuova compilazione da sorgente. Qualificazione di consegna
ancora aperta, incluse le dipendenze desktop locali datate e il tarball.

Restano da concordare la durata/inattività delle credenziali remote,
il significato di approvazione della coda e l'eventuale revisore con altro
modello. Il consenso host nel candidato non è una sandbox;
il controllo MCP per task copre `execute_shell_command`, non ogni possibile
tool esecutivo di futuri server globali.

Restano i blocchi del piano su feedback Docker, copertura comportamentale,
portabilità, valutazione CI e prova su progetto reale autorizzato. Nessuna
modifica a questi flussi, nessun commit/push, deploy o aggiornamento icona.

## Checkpoint 18 novembre 2026 — Verifica dei 14 rilievi originali chiusa

La verifica locale dei 14 rilievi della scansione
`4863d378-59dd-4d0f-ac55-765cd32aa286` è conclusa sul ramo
`codex/close-security-review-14`, sopra r108 `7add80a5`. I due revisori
indipendenti confermano `fixed` per tutti i rilievi originali. La scansione
storica sigillata resta invariata; questo è un successivo esito di verifica,
non una certificazione generale di sicurezza e non un penetration test.

- Impronta dei file di codice/configurazione modificati (manifest del
  checkpoint, Markdown escluso):
  `77f8278c78461c7b860434b641bbfc4e90180a5bbd8e245229eb98b9ed05cb63`.
- Corretta l'autorità dei processi MCP di progetto: nuova conferma nativa
  per ogni nuovo processo stdio, annullamento predefinito e spiegazione di
  codice/dipendenze mutabili e permessi OS. In headless serve il consenso
  esplicito `AIDER_DESK_ALLOW_PROJECT_MCP=true`, distinto dal consenso alla
  shell ordinaria. La configurazione viene ricontrollata dopo il dialogo e
  prima di ogni invocazione; revoca e diniego non lasciano un client
  utilizzabile o un'inizializzazione fallita permanentemente nel pool.
- Corretto il riconoscimento dei nomi con backslash nello ZIP Probe Windows.
  Dimensioni e digest fissati restano identici. Download reale, cache,
  ricerca e prove negative di integrità/proxy sono passati.
- Riallineato solo Handlebars 4.7.10 nel lockfile CLI, già richiesto dal
  manifest. Installazione pulita senza script e 61 test CLI superati.
- Suite Node finale: 1.941 superati, 2 esclusi, 144 file; typecheck Node/Web,
  build Electron, prove mirate e controlli di accesso negato superati.
  Anche la build MCP è passata; lint sulle modifiche senza errori, con nove
  warning (file esclusi dalla configurazione e import Axios).
  La suite renderer precedente (516 test) è riusata: i sorgenti interessati
  coincidono con il checkpoint del 15 novembre, senza nuove modifiche UI.
- Launcher `.cmd` reale eseguito su copia isolata, con dipendenze locali,
  profilo app e home OS sintetici. Due avvii, chiusura ordinata, persistenza
  al riavvio, API preload e blocco della navigazione estranea superati.
  Il collaudo abilita CDP solo sull'istanza di prova. I processi di prova
  sono stati chiusi; build e icona desktop di uso corrente non aggiornate.
- Docker: sette sentinelle sintetiche escluse dal contesto effettivo del
  builder, con sorgente legittimo conservato. Nessun profilo reale copiato.
- Gitleaks sulle modifiche: nessun segreto rilevato. Semgrep: 44 segnali
  esaminati, con quattro warning di parsing parziale; non è un gate verde.
  Dipendenze/OSV e codice morto non ricevono un nuovo verdetto da questa prova.

**Rilievo aggiuntivo registrato per il punto 2:** su Unix headless,
`src/main/utils/open-url.ts:78-89` passa URL a una shell usando
`JSON.stringify` come quoting. Il percorso Git Log può derivare la URL da
una remote del checkout e conservare sostituzioni shell. Il problema è
preesistente, confermato staticamente e condizionale all'estensione e
all'azione dell'utente; non dimostra esposizione del desktop Windows.
La patch senza URL interpolata nella shell era già presente alla ripresa
del riesame Claude; esito e limiti delle prove sono nel checkpoint sopra.
Anche l'avviso della finestra di progresso nell'avvio da sorgente
isolato resta una nota funzionale: non ha impedito l'apertura o il riavvio.

Report e prove conservati nella raccolta locale Codex Security di Agent-Lab:
`C:\Users\Pc Gaming\.codex\state\plugins\codex-security\scans\Agent-Lab\artifacts-288e037fedd7a2bd4d63c0e4982112dce3f1d8e161d462cfb0999189b3aae092\report_validation.md`.
Nessun commit, push, deploy o pentest. Prossima attività: punto 2 del piano.

## Ripresa 16 novembre 2026 — Bonifica sicurezza locale (storico)

La working tree di Agent-Lab contiene la bonifica dei 14 rilievi sopra
il commit r108 `7add80a5a38f54359091e28609d725cb5bd6be8d`. L'utente ha
chiesto la chiusura a questo punto. La ripresa parte dalla working tree
locale e dal checkpoint verificato, senza commit, push o pentest.

- I quattro rilievi iniziali hanno interventi su ricerca Probe, gestione
  delle identità Socket.IO, autenticazione REST e approvazione delle
  estensioni di progetto. Le modifiche successive coprono approvazioni Bash,
  perimetro dei percorsi, MCP, Plannotator, Electron, Docker, log terminale
  e integrità di Probe. Le review indipendenti hanno fatto emergere i casi
  di revoca, ripresa, configurazioni e dipendenze poi affrontati nel diff.
- I tool sui file verificano il checkout canonico. Il terminale integrato
  richiede una concessione distinta per eseguire comandi sull'host. In headless
  l'operatore la dichiara all'avvio tramite `AIDER_DESK_ALLOW_HOST_SHELL=true`.
  Una shell concessa dall'operatore conserva i permessi dell'account OS.
- La build Electron è riuscita e il preload compilato è stato aperto in un
  processo Electron con sandbox, profilo isolato e IPC sintetico. La build
  di prova e i log sono in `E:\Agent-Lab-remediation-build-5cb69e364ca74471b1bc92fb7b4ffdfb`.
  La prova usa una finestra di collaudo e la r108 del collegamento desktop
  resta la build di uso corrente. La build di prova precede la correzione
  finale del blocco MCP.
- Typecheck Node/Web superato. Suite renderer 516 test superati. Suite Node
  completa con 1.923 superati, due esclusi e due timeout nelle integrazioni
  MCP OAuth e SSE. In isolamento il timeout è ricomparso. Il pool leggeva
  la Promise della nuova connessione dopo un `await`, finendo per attendere
  se stessa. La lettura è stata spostata prima dell'attesa. Typecheck Node
  e i tre retest mirati OAuth, SSE e fiducia MCP sono passati. Il risultato
  è in `E:\Agent-Lab-remediation-mcp-corrected.log`. Test CLI mirati Probe 10
  superati. `npm ci` separato per la suite CLI completa resta bloccato
  dalla discrepanza del lockfile `handlebars` 4.7.9 rispetto a 4.7.10.
- Probe Windows è stato provato con una ricerca legittima su file sintetico.
  Il controllo del binario in cache e l'oscuramento del proxy sono passati.
  Gitleaks sulle modifiche ha esito 0. Semgrep mirato ha elaborato 56 file
  senza errori e ha restituito 17 corrispondenze da conservare come segnali
  statici, distinte dai rilievi verificati. I log completi delle suite sono
  `E:\Agent-Lab-remediation-node-final.log` e `E:\Agent-Lab-remediation-web-final.log`.

### Piano di ripresa

**Priorità concordata il 22 novembre 2026.** I cinque lavori e i relativi collaudi sono registrati nel checkpoint in apertura. L'elenco seguente conserva le dipendenze, i requisiti precedenti e il perimetro delle milestone successive.

1. **CHIUSO il 18 novembre: verifica dei 14 rilievi originali.** Esiti,
   impronta, test e limiti sono nel checkpoint sopra e nel report collegato.
   Prima di una build di consegna o dell'aggiornamento dell'icona desktop,
   affrontare il rilievo aggiuntivo registrato nel punto 2 e il relativo
   riesame. L'assenza di rilievi originali aperti non equivale a un via libera
   generale o a una verifica dell'esposizione online.
2. **Riesame Claude e blocco generale verificati nel candidato.** Il PDF
   `Audit approfondito — Agent-Lab.pdf` riguarda il commit r108 `7add80a5`.
   Consenso host, arresto delle ripetizioni e lock CLI sono stati affrontati
   nel checkpoint sopra, distinguendo sorgente, dipendenze installate e
   consegna. Restano i limiti dichiarati per headless, permessi OS e nuovi
   tool esecutivi MCP globali; il detector copre le operazioni caratterizzate,
   non ogni progresso esterno. Prima di consegnare, qualificare installazione
   pulita e artefatto finale. I punti seguenti restano aperti.
3. **Correggere le criticità confermate del governato e della portabilità.**
   Dare al correttore l'errore reale dei controlli Docker, limitando l'output
   e oscurando i dati sensibili. Usare test comportamentali per i criteri
   funzionali e indicare esplicitamente i controlli di sola sintassi.
   Verificare la portabilità di Gitleaks e Docker. Valutare una CI minima
   per typecheck, build e test su Node 24. La decisione sull’approvazione
   dei singoli piani della coda è registrata nel checkpoint del 22 novembre.
4. **Misurare il risultato su un progetto reale autorizzato.** Su una copia
   isolata confrontare modalità generale e governata con lo stesso modello
   su un bug, una modifica su più file e una funzionalità. Registrare prove,
   interventi umani e cause dei blocchi. Usare i risultati per decidere se
   introdurre modifiche mirate al posto dei file interi, strumenti di sola
   lettura per l'esplorazione o un revisore con un modello diverso.
5. **Generazione di immagini con Sunburst.** Milestone approvata il 16
   novembre 2026 e implementata nel desktop locale. Il collaudo con
   provider simulato è passato. Rimane la prova sull’account personale.
   Il disegno approvato prende come riferimento il
   [tool nativo di OpenCode](https://github.com/anomalyco/opencode/blob/d4e48f54da346bc9f6e530c7111d9cbebc641513/packages/core/src/tool/plugin/image-generate.ts)
   per la chat e il Designer di Agent-Lab. Un tool dedicato invia prompt e
   riferimenti autorizzati, segue il lavoro in background e restituisce
   anteprima e file nel perimetro del progetto. Il modello grafico è
   `gpt-image-2.6-sunburst` tramite la
   [Images API ufficiale di OpenAI](https://developers.openai.com/api/docs/guides/image-generation),
   configurabile separatamente dal modello di coding. Prima del collaudo
   reale, verificare l'attivazione e il saldo dei
   [crediti API inclusi in ChatGPT Pro](https://developers.openai.com/api/docs/guides/chatgpt-api-credits).
   Mostrare la stima e registrare il consumo effettivo. Ogni eventuale spesa
   oltre i crediti inclusi richiede una decisione separata. La prima prova
   completa genera un fondale 2D retro dalla chat, lo modifica usando il
   primo risultato come riferimento e verifica il file dentro una scena
   giocabile alla risoluzione finale.

   **Regola del Designer approvata il 17 novembre 2026.** Per un mockup di
   interfaccia, preparare un prototipo navigabile in codice con dati fittizi
   e componenti già approvati, da validare prima dell'implementazione. Per
   una richiesta di immagini, consegnare gli asset nei formati richiesti.
   Per una landing completa, definire nel brief posizione, formato e
   funzione degli asset, integrarli nel codice e verificare la pagina su
   desktop e mobile.

   Riutilizzare gli asset già approvati e generare solo quelli mancanti
   previsti dal brief. Partire da una proposta per asset. Generare una
   variante quando serve una correzione concreta o l'utente chiede di
   confrontare due direzioni.

Agent-Lab Remote con app nativa e relay Cloudflare Free resta una milestone
successiva.

Riepilogo proposto per un eventuale commit autorizzato in seguito.
`Rafforza i confini di sicurezza di Agent-Lab`. La descrizione dovrebbe
citare l'autenticazione dei trasporti, il consenso sui tool del progetto,
l'isolamento desktop e le prove effettivamente superate sulla revisione.

## Evoluzioni future da discutere

Queste proposte saranno discusse ed esplicitate nei rispettivi blueprint
prima di passare all'implementazione.

### Agent-Lab online con connettore portatile USB

Mantenere online l'orchestratore con profili, memoria e skill. Un connettore
avviato da USB sul PC ospite mette a disposizione gli strumenti e le
dipendenze portatili pertinenti al lavoro. Il proprietario autorizza una
sessione temporanea e sceglie la cartella o il servizio su cui l'agente può
operare. Le operazioni vengono eseguite sul PC associato e i risultati
tornano all'orchestratore per diagnosi, correzione e verifica. Il perimetro
vale anche per terminale e subagenti. Alla chiusura del connettore termina
l'accesso. Le credenziali dei provider restano sul sistema che ospita
Agent-Lab. La prima prova proposta usa un secondo PC Windows e gli strumenti
Git e Node.js portatili.

Prima dell'esposizione online, prevedere una review indipendente dei confini
di accesso e del controllo delle sessioni, seguita da un penetration test
autorizzato in ambiente di collaudo.

### Selettore dell'ambiente di lavoro

Scegliere un ambiente come Gestionale, Programmazione web o Videogame per
predisporre un insieme di strumenti, skill e server MCP. Il blueprint del
progetto determina lo stack effettivo. L'agente può attivare altre skill
quando servono e creare una skill di progetto se manca una procedura
riutilizzabile. In Videogame, la scelta di Godot, Unity o Unreal determina
quali strumenti caricare, per esempio GDScript o C# per Godot, C# per Unity
e C++ o Blueprints per Unreal. Blender entra quando servono asset 3D. La
scelta dell'ambiente si combina con quella della macchina di esecuzione.

## Revisione Designer in Agent ordinario — r108

In Agent ordinario, la r104 poteva arrivare a `READY_FOR_REVIEW`
dopo una modifica JSX senza chiamare il Designer. La r108 acquisisce
una baseline dei sorgenti e richiede la revisione sul candidato
effettivo prima di chiudere il turno o completare il goal. La
ricevuta registra impronta del candidato, modello ed esito. Se il
candidato o le regole cambiano mentre il Designer lavora, il motore
riesamina lo stato corrente. I rilievi ritornano all'agente nello
stesso turno, con la possibilità di correggere e ripetere i controlli.

Il Designer riceve la richiesta, il piano disponibile, le regole
effettive del task, il sorgente modificato e quello dei suoi importatori
riconosciuti. L'analisi copre anche JSX con identificatori non alfabetici,
React `createElement` e SVG. La ripresa legacy usa i percorsi attribuiti
agli strumenti registrati, inclusa la risoluzione delle maiuscole
Windows. Se la cronologia non permette di attribuire le modifiche, il
candidato resta da riesaminare. Una risposta illeggibile del Designer
viene ritentata e un esito ancora pendente mantiene il task incompleto.

La prova Electron r106 con risposte deterministiche ha osservato un
rilievo persistito, una correzione nativa nello stesso turno e una nuova
ricevuta legata al file corretto. La r108 aggiunge le regressioni per SVG,
React senza JSX e identificatori JSX validi. Review indipendente e 71
test mirati superati. L'ASAR r108 ha SHA-256
`2D605A10B92962B8902ADCBFD8BC1BE1CA6CCA215BB2521B6C823E2606CC41EB`.
La suite Node ha 1.910 test superati e due opzioni di integrazione
escluse. Typecheck Node e Web, lint e Semgrep completati.

## Revisione Designer nelle modifiche ad hoc — r104

Nel workflow ad hoc una modifica JSX o una modifica a una
dipendenza della vista poteva essere pubblicata dopo un piano
con `surface: none`, senza revisione del Designer. La r104
riconosce il candidato effettivo e le dipendenze relative
visibili nello snapshot. Su Windows considera anche import
con maiuscole diverse. Richiede la revisione UI/UX prima della
consegna, anche se il Planner ha indicato sola logica.

La ripresa di un commit UI preparato e non pubblicato verifica
lo stesso candidato. Se il Designer lo approva, viene pubblicato
lo stesso commit. Se fornisce rilievi e la base è ancora la
stessa, il Correttore riprende il piano approvato con quei
rilievi. Il controllo dopo entrambi i verdetti conserva la
ricevuta se `dev` è avanzato durante la review. Se il commit
è già integrato, la ripresa ne riconcilia la ricevuta storica.

Su ASAR r104 SHA-256
`D645AE001B4BB8728CC2935EABA8EFB1A27F223261D3F5D055B25B46B2CFDC7A`,
la prova Electron con Git reale e modello deterministico
modifica `labels.ts`, importata da `view.tsx` attraverso `shared.ts`.
La richiesta è ad hoc, il piano resta `surface: none` e `dev`
non avanza durante la revisione UI. Dopo il verdetto, una sola
modifica viene integrata. `main` resta pulito ed Electron esce
con codice 0.

11 test mirati e 1.900 Node superati, due esclusi per
configurazione opzionale. Typecheck Node e Web, lint,
Semgrep e review indipendente completati. L'obbligo provato
riguarda il workflow. La verifica della stessa garanzia in
Agent ordinario resta aperta.

## Fallimenti con codice di uscita zero — r102

Due prove Electron su r101 hanno completato il goal con un
risultato insufficiente. Jest ha restituito codice 0 con un
test superato e uno fallito, usando `testFailureExitCode: 0`.
Unittest ha restituito codice 0 con il solo fallimento atteso.

La r102 rifiuta i fallimenti dichiarati nel riepilogo Jest.
Con unittest, se skip e fallimenti attesi esauriscono il
totale, il motore cerca un esito positivo nel report. La
diagnostica separata dalla riga compatta non vale come esito.
Il controllo viene applicato anche alle ricevute riprese.

Su ASAR r102 SHA-256
`50773EB1F4C9D664BECC9B5991593DFF0165B3A4B8944236DDA97E374B342C72`,
Electron con Jest e Python reali ha rifiutato le due ricevute.
Il caso unittest con un successo reale accanto al fallimento
atteso ha completato il goal con la ricevuta originale. Ciascuna
istanza Electron ha restituito codice 0. Il modello di queste
prove era deterministico su loopback.

152 test mirati e 1.894 Node superati, due esclusi per
configurazione opzionale. Typecheck Node e Web, lint,
Semgrep e review indipendente passati.

## Ricevute Jest e ripresa della verifica — r101

In r100, `jest --listTests --runInBand` e una suite con
tutti i test saltati restituivano codice 0 e producevano
entrambi una ricevuta, anche se il test non era stato eseguito.
La r101 riconosce l'ispezione, il report senza test superati
e l'output di aiuto di unittest. Se più fasi npm emettono
output e il riepilogo esiste solo su stderr, il motore chiede
una prova attribuibile allo script richiesto. Un riepilogo
positivo attribuito conserva la sua validità.

Il recupero ricontrolla il risultato nativo nel checkpoint.
Una ricevuta con un esito di sola ispezione o con un report
senza risultati utili non può essere riutilizzata. Restano
visibili la chiamata e il risultato storico.

Su ASAR r101 SHA-256
`B717FEF7B33DA219BBAF156E8A088E3F3CDB8E972EA7B17551240A2FE5AE3168`,
le prove Electron con Jest reale hanno rifiutato l'elenco, gli
skip e il successo del solo pretest npm. Un test realmente
superato ha prodotto la ricevuta e concluso l'obiettivo. In
una quinta prova, r100 ha salvato la ricevuta erronea prima
dell'arresto del processo. R101 ha riaperto lo stesso turno,
conservato il risultato nativo, rifiutato la ricevuta e lasciato
attivo l'obiettivo. La suite è stata caricata una volta.

147 test mirati, 1.889 Node superati e due esclusi per
configurazione opzionale. Typecheck Node e Web, lint,
Semgrep e review indipendente passati.

## Superficie UI nel piano di lavoro versionato — r100

Un percorso autorizzato ripetuto nel piano del modello faceva
interrompere la pianificazione con una richiesta di ripresentare
lo stesso lavoro. La r100 conserva la prima occorrenza e verifica
il perimetro prima di salvare il piano.

Se il task versionato dichiara `designSurface`, il motore usa
quella superficie per Designer e review. La superficie fa parte
dell'identità della definizione. Un piano privo del design richiesto
non può essere approvato. I task senza il campo continuano a usare
la superficie del piano generato e conservano le chiavi esistenti.

Su ASAR r100 SHA-256
`08844E19550F36FB8E7E458C0FD158A71E11B8969E28F075B46BB95A8D6160C2`,
la fixture Electron con Git reale dichiara `ui`. Il Planner
simulato indica `none` e ripete il percorso. Il Designer e il
revisore UI lavorano sul piano `ui` con il percorso unico. Prima
del verdetto del Designer il ramo `dev` è immutato e manca la
ricevuta di integrazione. Dopo il verdetto e la verifica, un
solo commit aggiorna il file previsto in `dev`. `main` resta
pulito ed Electron esce con codice 0.

Quattro test mirati e 1.873 Node superati, due esclusi per
configurazione. Typecheck Node e Web, lint, Semgrep e review
indipendente passati.

## Ricevute Node e limite del singolo turno — r99

Su r98 il comando reale `node --test --help` ha restituito
codice 0 senza eseguire la fixture. L'obiettivo senza un
comando di verifica dichiarato ha accettato l'ID nativo e
si è concluso. In una seconda prova, `maxIterations=1` ha
bloccato l'obiettivo dopo il primo controllo fallito.

La r99 riconosce l'aiuto e la versione di Node come output
senza prova. I riepiloghi nativi riconosciuti conservano
l'esito dei test. Il limite delle iterazioni chiude il turno
dell'obiettivo attivo e lascia proseguire il lavoro.

Su ASAR r99 SHA-256
`D7B07DA70B0136AE05196F4E02D5A09B2B436191612A3E1268C8359EDBF2E092`,
tre prove Electron con provider deterministico e Node reale
verificano gli esiti. L'aiuto lascia l'obiettivo attivo e
la richiesta di completamento viene respinta. Un test
positivo ammette l'ID nativo e chiude l'obiettivo. Il limite
di un'iterazione avvia un secondo turno che riceve il primo
fallimento senza lanciare di nuovo il comando e senza nuovi
messaggi utente. La fixture arresta l'osservazione dopo la
transizione. Tutte le istanze Electron restituiscono codice 0.

241 test mirati, 1.870 Node superati e due esclusi per
configurazione. Typecheck Node e Web, lint, Semgrep e review
indipendente passati.

## Conservazione della cronologia durante la compattazione — r98

Nella r97 quattro risposte HTTP 200 senza riepilogo lasciavano la
cronologia su disco e aggiungevano un messaggio utente artificiale
alla richiesta successiva. La r98 conserva l'input originale e
il risultato nativo se manca un riepilogo utilizzabile. Dopo un
rifiuto per limite di contesto, espone l'errore di compattazione
e conserva la cronologia. Il Codex di riferimento verifica la
presenza del testo del riepilogo prima della sostituzione nel
percorso post-turno. [Sorgente del riferimento](https://github.com/openai/codex/blob/7194b2177643f3c639cfc5b29f6398c545b0e7e2/codex-rs/core/src/compact.rs#L369)

La r98 rifiuta risposte vuote e risposte con la sola intestazione
prevista dal prompt. Lo Stop durante la generazione o durante la
pulizia asincrona impedisce l'applicazione. La conversazione resta
disponibile fino alla sostituzione. Un errore nella proiezione
ripristina la cronologia e l'Annulla in memoria. La ripubblicazione
della cronologia nel renderer dopo tale errore resta fuori dalla
prova.

Su ASAR r98 SHA-256
`228A056B715970619F7BE38489AB18E5C66CA809CA25523CE6C89ED62B215CBE`,
due prove Electron con provider loopback hanno conservato una sola
copia dell'input e il risultato nativo originale nella richiesta
successiva, senza riepilogo artificiale. Ciascun verificatore è
partito una volta, con exit 0. Il turno è rimasto lo stesso ed
Electron si è chiuso con codice 0. La prova positiva sullo stesso
ASAR ha salvato il riepilogo valido una volta e lo ha inviato
all'inferenza successiva con l'estratto della richiesta originale.
Anche in quel caso il codice nativo 0 risulta da un solo avvio e
il turno termina con Electron 0. 236 test mirati, 1.863 Node
superati e due esclusi per configurazione.
Typecheck Node e Web, lint, Semgrep e review indipendente passati.

## Regole Git dalla radice alla directory attiva — r97

La r96, aperta normalmente in una sottocartella di un Git
reale, inviava solo il suo `AGENTS.override.md`. La regola
della radice mancava dal prompt. La lettura Power operava
effettivamente nella sottocartella selezionata.

La r97 risale dalla directory fisica del task fino al primo
marcatore Git e presenta i file dalla radice alla directory
attiva, con precedenza per `AGENTS.override.md` a ogni livello.
Il prompt indica la provenienza relativa delle regole antenate.
Lab e cartelle senza marcatore restano limitati alla directory
del task per le istruzioni versionate.

La raccolta e la lettura del prompt riusano le directory
fisiche già risolte. Tre prove con junction hanno verificato
la scelta del repository fisico e la coerenza dello snapshot
se cambia la destinazione durante la lettura, anche quando
le regole condivise appartengono al progetto di un worktree
distinto. 147 test mirati e suite Node con 1.853 passati e
due esclusi. Typecheck Node e Web, lint, Semgrep e review
indipendente passati.

Su ASAR r97 SHA-256
`22BC9BA904D3231982F144DDAFD47527459CA4E787AAAF089B99E21C82A63480`,
entrambe le richieste al provider di prova contengono
`../AGENTS.md` seguito da `AGENTS.override.md`, una volta
ciascuno. Il fallback e la cartella sorella restano fuori.
Power legge dalla sottocartella del task; Git resta pulito
ed Electron esce con codice 0.

Il caso semantico Anagrafiche ha una seconda fixture in cui
l'override della sottocartella richiede una variante locale.
Codex e Agent-Lab r97 con GPT-6.1 Sol modificano soltanto
la pagina Anagrafiche, usando l'opzione di etichetta del
componente condiviso. L'oracolo indipendente vede «Apri
scheda» in Anagrafiche, il default «Visualizza scheda» in
Rubrica, «Dettaglio storico» in Archivio e «Salva preferenze»
in Impostazioni. Il test nativo esegue due prove. I test
della fixture sono in sola lettura; l'oracolo separato
verifica l'esito specifico richiesto. Electron esce con
codice 0 e l'autorizzazione temporanea viene rimossa.

## Regole della directory operativa — r96

Su r94, un task associato a un worktree Git reale ha letto
la sorgente del worktree con Power e ha inviato al modello
il file `AGENTS.md` del checkout principale. I due file
contenevano regole differenti, verificate separatamente.

La r96 sceglie il file di istruzioni nella directory operativa
del task. Se esiste un file regolare `AGENTS.override.md`,
ha precedenza su `AGENTS.md`. Un worktree senza entrambi
i file non eredita un `AGENTS.md` dall'altro checkout. Le
regole condivise configurate per progetto e profilo restano
disponibili. La priorità rispecchia la scelta nell'upstream
fissato. [Priorità in Codex](https://github.com/openai/codex/blob/7194b2177643f3c639cfc5b29f6398c545b0e7e2/codex-rs/core/src/agents_md.rs#L263)

Con ASAR r96 SHA-256
`C1841A5E9AD874B1C0ABE36F13C697D42916573A188A3580E6274C26C02513F8`,
due prove Electron con Git reale hanno verificato presenza e
assenza della regola nel worktree. Le letture Power hanno usato
la cartella effettiva del task. I riferimenti sono rimasti
puliti e le istanze Electron hanno restituito codice 0.
138 test mirati, 1.847 test Node superati e due esclusi per
configurazione. Lint, typecheck e review indipendente passati.

La prova semantica Anagrafiche usa una richiesta breve e le
regole persistenti della fixture. Codex e l'Agent-Lab r96 con
GPT-6.1 Sol hanno modificato soltanto il valore predefinito
nel componente comune. L'oracolo indipendente conferma
«Apri scheda» sia in Anagrafiche sia in Rubrica, «Dettaglio
storico» in Archivio e «Salva preferenze» in Impostazioni.
Agent-Lab ha eseguito i due test nativi, ha indicato entrambi
gli utilizzi e la variante preservata ed è uscito con codice
0. Il primo banco di prova bloccava le ricerche iniziali. La
prova valida usa la ricerca confinata al repository sintetico.

## Attesa dei worker concorrenti — r95

Nel Codex di riferimento `7194b21`, l'attesa di più agenti
ritorna i risultati terminali già disponibili oppure il primo
risultato terminale che arriva. La sessione Codex desktop ha
osservato il completamento del worker rapido mentre il lento
era ancora attivo. [Sorgente del riferimento](https://github.com/openai/codex/blob/7194b2177643f3c639cfc5b29f6398c545b0e7e2/codex-rs/core/src/tools/handlers/multi_agents/wait.rs#L115)

Nel pacchetto r94 entrambi i worker erano in esecuzione, ma
il relativo strumento richiedeva un unico `workerId`. La r95
accetta anche `workerIds` e restituisce gli esiti terminali
disponibili al primo completamento. Il formato della chiamata
singola rimane compatibile. L'attesa multipla scade senza
raccogliere i worker in corso. L'annullamento della singola
attesa rimuove il timer e le sottoscrizioni.

Il gruppo conserva gli esiti dei worker sani se il salvataggio
finale di un altro fallisce. La lettura dello storico ricontrolla
lo stato attivo prima di presentare l'esito e la raccolta riconosce
lo slot esatto. 148 test mirati, lint, typecheck Node, 12 regole
Semgrep locali e review indipendente superati.

L'ASAR r95 SHA-256
`63B1356C9A59D1CBDC499876C05DC4D0C69D2E6377B3F33D5D3775A04537028F`
ha restituito il risultato del worker rapido in 886 ms con
un limite di 14 secondi e il worker lento ancora in corso.
Due processi nativi si sono sovrapposti per 311 ms. Il worker
lento è stato raccolto con l'attesa singola. Electron è uscito
con codice 0. Suite Node, 1.844 passati e due esclusi per
configurazione. La prova usa un provider di test su loopback.

## Riconnessione durante il turno — r94

Il Codex di riferimento `7194b21` abilita per impostazione
predefinita la riconnessione del campionamento dopo un errore
di connessione. Le attese partono da 5 secondi, raddoppiano e
si fermano a 60 secondi. Il sorgente esclude i turni interni
e Bedrock. [Retry](https://github.com/openai/codex/blob/7194b2177643f3c639cfc5b29f6398c545b0e7e2/codex-rs/core/src/responses_retry.rs#L82)
· [Flag predefinito](https://github.com/openai/codex/blob/7194b2177643f3c639cfc5b29f6398c545b0e7e2/codex-rs/features/src/lib.rs#L1575)

Su r93 il provider loopback non era in ascolto all'inizio
dell'inferenza. Quattro connessioni sono state rifiutate.
Il task ha registrato l'interruzione e l'apertura successiva
dell'endpoint non ha prodotto richieste HTTP o tool.

La r94 mantiene attivo lo stesso turno principale mentre
attende una connessione iniziale. La classificazione richiede
una causa di connessione e, negli aggregati, conferma ogni
causa. Un errore HTTP o dopo l'inizio delle operazioni resta
soggetto ai limiti esistenti. L'attesa usa il segnale di Stop.
Un rifiuto confermato prima della richiesta non consuma token
e viene contabilizzato separatamente dai casi di uso ignoto.
140 test mirati, lint, typecheck e review indipendente passati.

L'ASAR r94 SHA-256
`AE790740EE30B414921D43EBE56E87FB8309B01A44119F484D11C4E9485330E1`
ha ripreso il turno dopo il ripristino dell'endpoint.
Un solo prompt, un solo verificatore nativo con exit 0 e lo
stesso ID di turno. Nella prova separata Stop ha annullato
la riconnessione. L'apertura dell'endpoint dopo Stop non ha
prodotto richieste né tool. Entrambe le esecuzioni Electron
sono uscite con codice 0. La suite Node completa conta
1.838 superati, zero falliti e due esclusi per configurazione.

## Validazione Windows della r93 — fixture portabili

I cinque file di test hanno riprodotto i 41 fallimenti della
suite nel checkout Windows. Le fixture usano ora percorsi
nativi e valori di piattaforma espliciti. Il test del watcher
conserva l'input prima della normalizzazione. Le rinomine Git
usano nomi ammessi dal filesystem e verificano con Git reale
il ripristino con conversioni LF e CRLF, oltre ai byte binari.

La suite Node completa ha superato 1.831 test, con due prove
escluse perché dipendono dalla configurazione opzionale di
ricerca e Docker. La suite Web ha superato 516 test. La review
indipendente ha verificato che il delta riguarda le fixture.
Il binario selezionato dal desktop rimane la r93.

## Windows r93 — attribuzione delle ricevute npm

Nella r92, `npm test --silent` ha eseguito un test saltato
nello script richiesto e un test riuscito in `posttest`. Il
comando è uscito con 0 senza intestazioni npm. Il goal è stato
chiuso usando un risultato che non identificava lo script.

La r93 mantiene codice di uscita e output del comando. Per
ammettere la verifica richiede di identificare lo script dal
report nativo prima che venga abbreviato. Un'intestazione
stampata da un comando annidato non qualifica un'invocazione
npm esplicitamente silenziosa. Le ricevute attribuite salvano
il riscontro nel journal. Alla ripresa, le ricevute precedenti
prive del riscontro sono rivalutate con il loro output storico.
La correzione lascia i risultati delle esecuzioni in cronologia.

169 test mirati, lint, typecheck Node, scansione locale e review
indipendente superati. Le prove distinguono anche le opzioni
npm dagli argomenti del runner dopo `--`.

La suite Node Windows conta 1.789 test superati, 41 falliti
e due esclusi. I nomi dei fallimenti coincidono con la r87.
La review ha ricondotto i casi a fixture e asserzioni di
portabilità per shell, skill, costanti, watcher e rinomine Git.

Nel pacchetto r93 con ASAR SHA-256
`B6F43CA1A8054F2989FD9014E3801EB0C267582AD1ACCC49235FFFC587784200`,
la prova con `npm test --silent` ha mantenuto exit 0 e
l'obiettivo attivo senza una ricevuta ammessa. `npm test`
con intestazioni e un test positivo nello script richiesto
ha registrato la ricevuta e completato l'obiettivo. Entrambe
le prove usano npm e Electron reali con provider controllato
su loopback e uscita Electron 0.

## Windows r92 — chiusura durante il caricamento della finestra

Il collaudo del pacchetto r91 ha chiuso l'app mentre
`initWindow` attendeva `loadURL`. Electron è uscito con codice
0, ma il registro ha riportato `Object has been destroyed` su
`setZoomFactor` dopo la distruzione della finestra. Il sorgente
di avvio era identico fra r87 e r91.

La r92 verifica `BrowserWindow` e `webContents` prima di
applicare le impostazioni dopo l'attesa. L'applicazione di zoom
e font segue il percorso precedente quando entrambi sono
attivi. Sono passati 11 test mirati per finestra, retry e
riavvio, lint, Semgrep locale e review indipendente.

La prova controllata ha atteso l'evento di distruzione di
finestra e `webContents` prima della ripresa di `loadURL`.
La sequenza genera ancora l'errore sull'ASAR r91 e termina
con exit 0 e log errori vuoto sulla r92, ASAR SHA-256
`C41E17401CFBFF07F9936097979363B27D17C0DE4D9593028DFB52502BB0CF46`.
Le sorgenti delle ricevute sono identiche fra r91 e r92.

## Collaudo Windows r91 — verifiche pytest e Vitest

Su r87 un progetto Python sintetico ha eseguito pytest 9.0.3
con uno skip e un fallimento atteso. Un progetto TypeScript
sintetico ha eseguito Vitest 4.1.12 tramite `npm test` con
un solo test saltato. Entrambi i runner hanno restituito 0.
Electron ha ammesso le ricevute e salvato i due goal completi.

La r91 legge il riepilogo terminale dei due runner prima del
troncamento. Skip, todo o fallimenti attesi senza test riusciti
non qualificano la ricevuta nei formati riconosciuti. Vitest
funziona anche dentro lo script npm richiesto. Il riepilogo
del relativo `posttest` resta fuori dalla ricevuta. L'inferenza
del verificatore distingue inoltre i comandi di raccolta o
ispezione riprodotti dalle esecuzioni che svolgono davvero
i test. Per esempio Vitest 4.1.12 esegue i test con `run --version`.

I due difetti diagnostici sono stati riprodotti anche in unit
test. Sono passati 159 test mirati, lint, Node typecheck, le
12 regole Semgrep locali e la review indipendente. Le prove
del pacchetto esatto sono annotate nella matrice operativa.

## Windows r87 — verifica Python unittest

Python 3.14.3 con `python -m unittest discover` ha restituito
exit 0 in una fixture con il solo test saltato. La r86 su
Electron ha ammesso la ricevuta e salvato il goal completo.
Due test hanno riprodotto il difetto nella generazione del
risultato nativo e nella lettura del report senza i metadati
del risultato originale.

La r87 riconosce il report compatto di unittest prima del
troncamento della console, nel canale stderr o nell'output
unificato del terminale. Un rapporto con soli skip riconoscibili
non qualifica il goal. La presenza di una verifica riuscita
accanto a subtest saltati mantiene la ricevuta ammissibile.
I formati non riconosciuti rimangono fuori da questa prova.

Sulla ASAR `50CFDE386FD3AD61FF5F5010D84EDF53B96FE0C3FCECEBD0E95087037FECBC43`,
Python 3.14.3 ed Electron reali hanno verificato entrambi i casi.
Il test saltato è uscito con 0 e la richiesta di completamento
è stata respinta. Lo stesso progetto con un test eseguito e
riuscito ha registrato il goal completo con la ricevuta nativa.
Provider deterministico su loopback e uscita Electron 0 in
entrambi i casi.

181 test mirati, Node e Web typecheck, lint, 12 regole Semgrep
locali e review indipendente superati. La suite Node completa
su Windows ha 1.780 passati, 41 fallimenti e due esclusi.
I 41 fallimenti sono già presenti nella r77. Il caso precedente
del ricaricamento profili è passato nella r87.

## Windows r86 — regole locali del profilo condiviso

La r80 su Windows usava il profilo globale in due progetti,
ma ometteva le regole del profilo presenti soltanto nelle
directory dei progetti. Il controllo dipendeva da un percorso
con slash. Il ramo precedente, dove si applicava, accodava le
regole alla copia globale in memoria.

La r86 risolve le regole aggiuntive al momento della lettura,
nel progetto attivo e con il nome di directory registrato.
Il profilo globale rimane intatto. Un profilo locale con
`config.json` conserva le proprie regole. I percorsi reali
dell'overlay devono rimanere nel progetto. Il prompt gestisce
anche il prefisso home con separatore Windows. Quando il registro
viene ricaricato, resta disponibile mentre si legge la nuova
versione. Un errore temporaneo di lettura conserva il registro
precedente. Una configurazione JSON malformata viene saltata al
momento dell'aggiornamento e i profili validi vengono pubblicati.

I 139 test mirati r86 e la review indipendente sono passati.
Sulla ASAR `E8D973C57B3A48B1DBC3EA3E50677EECBAFBCC4E59E887FCF42A13E77362A103`,
due task ordinari Electron hanno ricevuto la regola globale e
soltanto la regola locale del rispettivo progetto, con provider
simulato su loopback e uscita Electron 0. La r84 ha verificato
anche la rimozione della regola locale nella stessa sessione.

## OpenRouter Messages reale — ripresa sulla r80

Dopo HTTP 401 dalla credenziale preesistente, l'utente ha
autorizzato OAuth separatamente nel browser. L'ASAR r80 ha
inviato richieste Anthropic Messages a OpenRouter con il modello
gratuito `cohere/north-mini-code:free`, tramite un relay che
inoltrava il corpo senza traduzioni. Nella fixture, due turni
hanno eseguito il comando iniziale con exit 1 e `node --test`
con exit 0 e un test superato. La fixture stabiliva il confine
del primo turno. La cronologia non contiene nuovi messaggi
utente fra i turni.

Il relay locale ha respinto metadati Messages validi in due
tentativi prima di inoltrare la richiesta seguente. Dopo la
correzione e la nuova autorizzazione, Electron riaperto ha
ripreso il turno salvato con `/goal resume`. Una risposta HTTP
200 ha portato a `update_goal` sullo stesso turno, citando la
ricevuta nativa preesistente. Stato `complete` e journal
`success` persistiti. Ciascun comando risulta avviato una sola
volta. Il relay è stato chiuso dopo cinque richieste upstream
complessive, quattro HTTP 200 e un HTTP 401. Autorizzazioni e
configurazioni della prova erano isolate dal profilo in uso.
Il reporter di ripresa ha fallito in scrittura dopo il test.
Stato, cronologia e trace sono stati verificati direttamente.
Il codice di uscita del secondo Electron non è stato raccolto.

## Build Windows r80 — processo Bash ancora disponibile

Su r77, il provider Anthropic-compatible simulato interrompeva
la connessione dopo `message_stop` mentre la shell aveva già
restituito un processId. Il figlio era ancora attivo e avviato
una sola volta. Il task rimaneva interrotto e il provider aveva
ricevuto una sola richiesta.

La r80 riusa il risultato interlocutorio e indirizza il modello
al poll dello stesso processId quando la sessione può ancora
servirlo. Il controllo usa l'handle prodotto da Power e il poll
nativo originale. Il wrapper verifica anche l'identità della
funzione di poll catturata prima delle estensioni. Un processo
scaduto, consumato o appartenente a un altro ambito non entra
nel recupero automatico. 161 test, Node typecheck e review
indipendente passati. Sulla ASAR
`D481676AAB56B0DECF20A3226674FB81FE589E784A4C5F6C044F8BE9D1C9470E`,
il provider ha ricevuto lo stesso processId dopo il distacco.
Il poll nativo ha restituito exit 0 e il risultato è arrivato
alla richiesta successiva. Stesso turno completo, un avvio
e un prompt originale. Electron, Bash e Node reali, provider
simulato su loopback. Uscita Electron 0.

- ZIP Windows x64 con 466 file verificati. SHA-256 `F97BD4623B6E2C68EBEB1FA4DD15FD93BD2A5D08CDF3A78116FC9C02384FB29C`.
- Il desktop seleziona r80. Sette configurazioni con gli stessi hash, ripristino r77 e prova di avvio su profili isolati.

## Build Windows r77 — prosecuzione dopo un distacco tardivo

Nella prova r75 una risposta Anthropic-compatible perdeva la
connessione dopo il terminale di protocollo e dopo l'exit 0
del comando nativo. Il risultato restava nel journal. Con
Electron ancora aperto, il turno si fermava senza una nuova
richiesta al provider. Il confronto osserva una singola
esecuzione del comando e un solo prompt originale.

La r76 ha conservato le chiamate concluse e i relativi esiti
prima di ricostruire la richiesta dello stesso turno. La r77
separa conservazione e addebito dall'ammissibilità della
richiesta seguente. Al limite resta il risultato e viene
contabilizzato l'uso già comunicato. Se il provider ammette
il tentativo e il turno ha margine, riprende con gli stessi ID
degli strumenti già eseguiti. Le chiamate incomplete o con
processo ancora in corso seguono il recupero esistente.
159 test mirati, typecheck Node, lint e review passati.
La suite Node Windows conta 1.766 passati, 42 fallimenti e due
esclusi. I 42 fallimenti nominativi coincidono con la r71.
La ASAR `DB0B7C5348445C9BB57C56A880C92927001878188E5591784F79A19570A540D8`
ha superato la prova del distacco dopo il comando nativo. La
richiesta successiva ha riusato l'ID originale e lo stesso
turno è terminato con un solo avvio e senza nuova istruzione.
Al limite di un'iterazione, il risultato è presente sia nella
cronologia sia nel journal e il provider ha ricevuto una sola
richiesta. Entrambe le prove usano Electron e Node reali e
provider simulato su loopback. Uscita Electron 0.

Il controllo prima del terminale di protocollo ha verificato
zero avvii dello strumento incompleto. Il tentativo automatico
ha eseguito una sola volta il comando valido e ha completato
lo stesso turno. Il primo ID non è arrivato alla nuova richiesta.

Un controllo indipendente con Plan sulla r75 ha completato
una lettura di file mentre la domanda di prodotto restava in
attesa. Dopo la scelta nell'interfaccia, ha salvato il piano
usando gli esiti dei due strumenti dallo stesso batch. Una
risposta modello deterministica e l'IPC Electron effettivo.

- ZIP Windows x64 con 466 file verificati. SHA-256 `77E4741F195ECAE92BE7B86CA09FB2ADA2EEE2CB07F5EF9FA1612685A21C869D`.
- Il desktop seleziona r77. Sette configurazioni con gli stessi hash, ripristino r75, smoke di avvio con profili isolati.

## Build Windows r75 — recupero della ricevuta nativa

Su r73, dopo l'arresto forzato di Electron il medesimo turno
recuperava l'esito di Node, ma `get_goal` perdeva la ricevuta
prima ammessa. Il completamento con l'ID originale era
respinto. Il comando era partito una sola volta.

La r75 salva l'ammissione con la ricevuta nativa nel journal
esistente. Il modello la vede dopo che il journal l'ha
salvata. La ripresa ricontrolla obiettivo, checkout canonico,
digest e ID della chiamata nativa. Input nuovi, operazioni
irrisolte e scritture superate sospendono il riuso. Un
fallimento successivo dello stesso comando revoca le prove
precedenti di quel comando e conserva i risultati storici.
155 test mirati, lint, typecheck Node e web, Semgrep e review
indipendente passati. La ASAR
`981253F6551BC7B98FF6A79DF8D84D78466AA9E2F580D4C55C7FA10F58727D9E`
ha superato due arresti forzati su fixture separate. A checkout
invariato l'ID originale ha completato lo stesso obiettivo.
Con un file tracciato cambiato durante la chiusura, l'esito
storico è rimasto nel contesto e la vecchia ricevuta è stata
respinta. Un avvio nativo a scenario e uscita Electron 0 dopo
la ripresa. Node, Git ed Electron reali. Provider simulato.

- ZIP Windows x64 con 466 file verificati. SHA-256 `347304D378152549ED9A26E6C6F0FD7EB6DA8EADF3A85B11F277DD7AC6CDB450`.
- Il desktop seleziona r75. Sette configurazioni con gli stessi hash e collegamento r73 per il ripristino. Verifica di avvio su profilo isolato.

### Interruzione della connessione dopo uno strumento

Una prova r73 su Anthropic-compatible simulato ha interrotto
la connessione fisica dopo `message_stop` e dopo exit 0 del
comando nativo, nella stessa risposta. «Riprendi» ha riusato
il risultato nello stesso turno con un solo avvio del comando.
La prova r73 dimostra il recupero con «Riprendi». La prova
r77 verifica anche la prosecuzione automatica a provider
nuovamente disponibile e app ancora aperta. Prima di
`message_stop` l'SDK effettivo non ha
eseguito il comando nella fixture e il provider simulato ha
restituito un errore di trasporto.

## Build Windows r73 — ricerca mirata dopo i fallimenti

La r71 ripeteva l'interazione dopo due verifiche fallite ma non
apriva la ricerca, pur avendo l'estensione già autorizzata.
La r72 ha riprodotto con Electron, Node e l'estensione SearXNG
in modalità URL la differenza: una sola richiesta mirata a
Node dopo due exit 1, con la fonte di prova consegnata al
modello prima della correzione. Node e il typecheck sono poi
passati nello stesso turno. Provider e risposta di ricerca
controllati su loopback.

La r73 usa il tipo di verifica osservato da Power. Il risultato
nativo diretto o raccolto con `bash_poll` conserva una query
pubblica predefinita. Percorsi, sorgenti e log non formano la
query. Due verifiche fallite dello stesso tipo chiedono una
nuova diagnosi. La ricerca usa la stessa autorizzazione già
configurata, richiede un campionamento successivo disponibile
e usa al massimo tre query distinte nel turno. I report Node
validamente riconosciuti con zero test superati contano come
fallimenti. 143 test, lint, typecheck Node e review passati.
La ASAR
`01D9350C436A80B68C96203A13FEDF2E3F77D13CF562D746FEDE1BB525222190`
ha superato le due prove Electron. Una usa comandi diretti.
L'altra prova conserva gli ID dei processi in background e
attiva la ricerca solo dopo il secondo poll terminale in
errore. In entrambi i casi una sola query, fonte ricevuta
prima della correzione, due verifiche native positive e
uscita Electron 0. Provider e risposta di ricerca simulati
su loopback. L'estensione SearXNG è quella effettiva in modalità
URL. Semgrep e typecheck web passati.

- ZIP Windows x64 con 466 file verificati. SHA-256 `0D818BA7FC1E8D4B4C823F4BEA340E09BDE15189BC74CCF21EE028B49EE1EB14`.
- Il collegamento desktop punta a r73. Sette configurazioni del profilo con gli stessi hash. Ripristino r71 e smoke Electron su profilo isolato.

Il confronto r73 con Codex desktop ha usato GPT-6.1 Sol,
lo stesso prompt, gli stessi byte iniziali e il medesimo
componente condiviso. Entrambi hanno osservato gli esiti
`1 → 0 → 1 → 0 → 0` per filtro, formattazione e verifica
complessiva. Solo `shared.cjs` è cambiato. I cinque file
finali coincidono byte per byte e Node conferma 2 test su 2.
La prima fixture contava un intento Bash respinto prima
dell'avvio. L'esito originale è conservato e le cinque
ricevute native sono state ricontrollate senza contattare
nuovamente il modello. Il riavvio separato sul profilo
isolato è uscito con codice 0. Credenziale temporanea rimossa.

## Build Windows r71 — esclusioni e ricevute npm

Con Git reale, la r68 integrava il task dipendente dopo una
modifica a un modulo CommonJS escluso. L'analisi ora raccoglie
direttamente dall'AST le chiamate letterali che lo scanner
TypeScript può saltare. Alias e chiavi calcolate su `module`
sospendono il riuso delle esclusioni della prova interessata.
I test verificano cinque forme CommonJS e dimostrano che
un'esclusione indipendente rimane valida nei casi letterali.
La prova impacchettata r69 blocca T-2, registra l'indagine sul
modulo e conserva entrambi i riferimenti Git e la ricevuta T-1.

Con `npm test` e uno script che esegue direttamente `node --test`,
la r68 completava il goal anche con tutti i test saltati. La
r69 rileva il riepilogo Node a zero, ma usa quello sbagliato se
`posttest` esegue altri test. La r71 lega il riepilogo allo
script npm riconoscibile e chiude il suo output solo al
`post<nome-script>` dello stesso pacchetto. La diagnostica
su stdout non modifica questo confine.

43 test del workflow passati e due esclusi. 96 test mirati,
typecheck, lint, review separata e Semgrep passati. La suite
Node completa su Windows conta 1.745 passati, 42 fallimenti e
due esclusi. Rispetto alla r67 è passato il test di rinomina
corretto nella r68 e non risultano nuovi fallimenti nominali.

La ASAR `187FCA19662E34464D7DC9EE7EA291BF6462F779417F3D1D54B21BC3061EFCB5`
ha superato tre prove Electron con npm e Node reali e un
provider deterministico su loopback. La r71 respinge zero
test superati quando lo script principale è tutto saltato,
anche con `posttest` positivo o diagnostica iniziale. Accetta
il controllo con un test effettivamente superato e registra
il completamento. Lo smoke Windows e i 466 file dello ZIP
sono stati verificati. SHA-256 ZIP
`584F095DE4D4B0CFE37EF4BEBCC5685D4911C8AE452270CF660D6D988E361D30`.
Il collegamento desktop seleziona r71 e conserva i sette file
di configurazione. Il collegamento r68 resta per il ripristino.
Lo smoke ha usato un profilo isolato.

## Build Windows r68 — confronto Git dopo una rinomina

Su Windows il contenuto precedente risultava vuoto dopo una
rinomina inclusa in un commit. La vista ricavava il genitore
passando il suffisso `^` a una shell. La r68 passa gli argomenti a
Git direttamente e legge il percorso precedente dal genitore.
Lo stesso test Git reale fallisce prima e passa dopo. Una prova
Windows con `core.autocrlf=false` limitato al processo ha superato
i sette scenari con nomi supportati dal filesystem. Sono passati
anche 47 test Git collegati, typecheck Node, lint e review.

La prova Electron sulla ASAR r68 `7DB1C680331ED5DB91FA07EBD4270424F65C3A20A1AA1DC40C0FF6BA197018A0`
ha restituito cinque righe precedenti e sei nuove, entrambe
identiche a `git show`. La r67 sullo stesso commit restituiva
vuoto il contenuto precedente. Commit, indice, riferimenti e
working tree sono rimasti identici. Entrambe le app sono uscite
con codice 0, con profilo isolato e Git 2.53.0.windows.2.

- ZIP Windows x64, 466 file verificati. SHA-256 `D33A2C817BFE8293AFEFB12F0C3F68AF544169EB09A8DB5D4CE222D035079B42`.
- Il collegamento desktop punta alla r68. Sette configurazioni del profilo hanno conservato gli hash ed è disponibile il ripristino r67. Lo smoke ha avviato Electron su profilo isolato.

## Adattatore Anthropic e GLM reale — prova mediata

L'adattatore Anthropic compatibile della r67 ha completato
un obiettivo usando GLM-4.5-Flash Standard reale attraverso un
gateway locale Messages JSON verso Chat Completions. Tre
richieste senza streaming hanno restituito HTTP 200. Dopo exit 1
il turno automatico ha ottenuto pass 1 ed exit 0 da Node. Il
modello ha citato l'ID nativo e il completamento è persistito.
6.168 token osservati fuori cache e 2.623 letti dalla cache.
Electron è uscito con codice 0. La fixture limita il menu dei
comandi e stabilizza la fine del primo turno.

La r68 ha superato anche lo streaming sul percorso mediato.
Tre richieste Standard GLM-4.5-Flash HTTP 200, evento SSE
Messages per i delta degli argomenti e ID delle chiamate
conservati. Il modello ha registrato il completamento dopo
un test riuscito nel turno automatico. Electron exit 0. I
3.495 token fuori cache coincidono con il consumo salvato,
oltre a 5.205 letti dalla cache. Ogni argomento di quella prova
ha avuto un solo delta non vuoto. Una seconda prova r68 ha
diviso ciascuno dei tre argomenti di GLM reale in due delta
Messages non vuoti. Ha preservato gli hash, il testo Unicode,
il completamento e l'uscita Electron 0. La frammentazione è
stata applicata dal gateway. L'endpoint Messages nativo resta
da collaudare.

Sulla medesima r68, GPT-6.1 Sol reale ha proseguito dopo exit 1
e usato il subagente Audit. Dopo arresto forzato durante un
comando, ha ripreso lo stesso turno e goal, con quattro comandi
avviati una volta ciascuno. Ricevuta nativa e stato completo
persistiti. Chiusura della seconda Electron con codice 0.
Il controllo ha confermato l'arresto dei processi della fixture
anche se `taskkill` ha restituito 128.

## Launcher locale — verifica Ollama 0.40.16

Il pin della 0.40.15 respingeva l'eseguibile installato dopo
l'aggiornamento. Il membro `ollama.exe` dell'archivio Windows x64
pubblicato da Ollama 0.40.16 coincide con il file installato e
ha firma Authenticode valida di Ollama Inc. Il launcher accetta
ora quell'esatto SHA-256. Conserva il controllo prima di avviare
il processo, senza cambi a modello, porta o profilo.

Il manifest Devstral in `manifests-v2` coincide con quello del
registry ufficiale. La variante locale condivide i pesi, usa
il parser `ministral` e conserva `num_ctx=32768`. Tutti i sei
blob dei due manifest hanno superato il confronto SHA-256.
Il manifest legacy è l'ancora di compatibilità. Ollama 0.40.16
risolve prima `manifests-v2`. Otto test di configurazione e
fallback e review indipendente sono passati. La revisione
automatica ha respinto il precedente avvio dedicato. La prova
attuale non ha avviato Ollama e la qualifica di inferenza resta
aperta. L'Ollama standard su 11434 risponde, con catalogo vuoto.

## Build Windows r67 — ricevute dei verificatori nativi

Una verifica nominata dall'utente richiede una revisione del checkout
disponibile. Il test r63 accettava exit 0 anche quando mancava
l'impronta della revisione. La r64 conserva checkout e directory
canonici, ricontrolla entrambi dopo l'approvazione e usa quella
directory per l'avvio. Le ricevute conservano checkout e revisione
anche attraverso i poll e fino alla pubblicazione del completamento.
Il controllo riguarda la directory iniziale del processo.

Electron ha confermato sulla r64 che un test reale e una revisione
identificabile consentono il completamento e che un checkout privo
di input utilizzabili resta senza ricevuta. Un checkout con un
sorgente tracciato e senza test produceva invece un falso esito
positivo. La r65 lo ha respinto, ma accettava ancora un output
troncato da un'esecuzione con 1.200 test saltati e zero superati.

La r67 ricava l'esito dai riepiloghi TAP e spec riconosciuti di
`node --test` prima del troncamento per l'interfaccia e conserva
il controllo anche per un processo letto via poll. Un riepilogo
nativo positivo resta valido se la parte visibile mostra solo un
riepilogo diagnostico precedente a zero. La prova sulla ASAR
`0D87AD719531A902EBDD735AB6067BC0664CDB655C81B0D44D737745954A36BD`
ha confermato entrambi i casi con Electron, Node e Git reali e un
provider simulato su loopback. L'uscita di Electron è stata 0.

151 test mirati, lint, typecheck, Semgrep mirato e review
indipendente del delta passati. Suite Node Windows, 1.736 passati,
due esclusi e gli stessi 43 fallimenti nominali della r63.

GLM-4.5-Flash Standard reale ha eseguito un comando con exit 1.
Nel turno automatico seguente ha eseguito `node --test verify.cjs`
con un test superato e ha registrato `complete` con l'ID della
ricevuta nativa. Quattro risposte HTTP 200 e uscita Electron 0.
La fixture limita i comandi e stabilizza la fine del primo turno.
L'endpoint loopback del Devstral configurato non rispondeva al
controllo in sola lettura. La sua qualifica reale rimane aperta.

- ZIP Windows x64, 466 file verificati. SHA-256 `3664706B8DF943D2298B7937C0AD59167CC20E0E4D4C33203DE32FAE9D9C55CC`.
- Collegamento desktop r67, ripristino r63 e sette configurazioni del profilo con hash verificati. Avvio Electron verificato su profilo isolato.

## Build Windows r63 — recupero di una modifica senza effetto

La r61 ha ripetuto modifiche senza effetto con Qwen e l'adattatore
Anthropic compatibile. La risposta `Already updated` era fuorviante:
la ricerca e la sostituzione erano identiche e il file non era stato
letto. La r63 dichiara il mancato intervento. Quando la lettura è
disponibile e consentita, offre il lettore per un campione, con
la stessa approvazione esistente. Poi riapre gli strumenti ordinari
e usa il contenuto della lettura per guidare una modifica mirata.

La prima implementazione r62 forzava lo strumento. Il test con
l'AI SDK ha riprodotto l'interruzione di un provider che risponde
in testo senza una chiamata. La r63 usa la scelta automatica e
gestisce anche percorsi relativi e assoluti dello stesso file.
131 test mirati, typecheck e lint passati. La suite Node completa
conta 1.724 passati, due esclusi e gli stessi 43 fallimenti della
baseline Windows.

La revisione automatica ha rifiutato il riavvio dell'istanza locale
llama.cpp in questo turno. L'errore è `blocked by policy` e la
porta del collaudo rimane chiusa. Il collaudo r63 usa un provider
Anthropic Messages simulato su loopback. Dopo una modifica senza
effetto, la prova esegue la lettura, la correzione e il verificatore
nativo, exit 1 prima della correzione ed exit 0 dopo, nello stesso
turno. Le prove Qwen reali della r61 conservano il proprio perimetro.

Il collaudo sulla stessa ASAR con GLM-4.5-Flash reale ha ottenuto
sei risposte HTTP 200. La prova richiedeva esplicitamente il tentativo
iniziale senza effetto. Il modello ha riletto il file nel campione
successivo, ha corretto solo `filter.js` e ha ripetuto lo stesso
verificatore nativo, da exit 1 a exit 0 nello stesso turno.

- ASAR SHA-256 `2A4C1F22637BF81EBF85CCF8F44101CE3FED818FCA9B089161B9BD4A16887682`.
- ZIP Windows x64, 466 file verificati. SHA-256 `FD2B951D42D6AA2C3F5519BA6CBC1C034D32A5E19440464F93FC683D78DBBACC`.
- Collegamento desktop r63, ripristino r61 e sette configurazioni del profilo con hash verificati.

## Build Windows r61 — dipendenze delle prove

La fixture Git sulla base r60 ha integrato un task dipendente
dopo che il suo predecessore aveva iniziato a importare un file
che prima risultava escluso. Il controllo originario del filtro
continuava a passare. La r61 legge il grafo dei moduli relativi
JavaScript e TypeScript dal commit di sviluppo e riesamina le
esclusioni quando cambiano i file o gli input rilevanti. Se il
riferimento è indiretto, ambiguo o calcolato, il task dipendente
rimane in attesa senza modificare `dev` o ricreare la ricevuta
già integrata. Le esclusioni dimostrate estranee restano attive.

I test coprono import diretti e indiretti, import calcolati,
`import.meta`, risoluzione senza estensione, commit separati e
un piano storico mancante. Sono passati 52 test della suite
governata e un ulteriore test mirato sul piano storico. Due
prove che richiedono servizi esterni restano escluse da questa
esecuzione. Typecheck, lint mirato e Semgrep locale sui due file
applicativi sono passati.

La prova comparativa su Electron e Git reale nel repository
sintetico ha confermato la regressione r60 e il blocco r61.
Il salvataggio della diagnosi lascia invariati i due riferimenti
Git e la ricevuta precedente. Provider simulato su loopback.

- ASAR SHA-256 `07E03E3CA4E468930673EA49DDD5FCF691A0A86D9A5360A1A08447894C092CF1`.
- ZIP Windows x64, 466 file verificati. SHA-256 `FF079F9302D7D3C173712233E76FB957CF4956693FAB3BFAF03933807E605643`.
- Collegamento desktop r61, ripristino r60 e sette configurazioni con hash verificati.

Sul pacchetto r61, Qwen3-4B locale ha riprodotto un difetto.
Ha corretto solo `filter.js` e ha ottenuto exit 0 dopo exit 1
usando lo stesso `verify.cjs`. Node ha confermato gli esiti in
modo indipendente. Il primo tentativo aveva esaurito l'output
prima degli strumenti. Il profilo isolato della prova riuscita
disattiva il ragionamento e usa temperatura zero. Il test usa
llama.cpp Vulkan su loopback con pesi Qwen ufficiali verificati.
La qualifica del Devstral configurato resta aperta.

Le due prove Qwen con l'adattatore Anthropic compatibile hanno
usato `/v1/messages` e il modello reale. La prima ha corretto
il file senza ripetere il verificatore nativo. La seconda ha
raggiunto il limite delle iterazioni con il file immutato.
Il ciclo Anthropic resta da qualificare. Il processo di
inferenza portabile della fixture è terminato e la sua porta
loopback è chiusa.

## Build Windows r60 — 15 novembre 2026

La r60 allinea catalogo e inferenza di Gemini e Anthropic
compatibile. Gemini aggiunge il prefisso predefinito a un host
senza percorso e conserva il prefisso API o proxy esplicitamente
configurato. I test attraversano gli SDK installati, anche SSE
Gemini. Il conto del goal esclude i token letti dalla cache e
include le scritture in cache.

Su Electron, l'adattatore Ollama ha eseguito un verificatore
nativo con un endpoint simulato su loopback. Contatori omessi:
una richiesta e stato `usage_limited`. Zero esplicito: due
richieste dello stesso turno, una sola esecuzione del verificatore,
64 token nel secondo campione e stato `budget_limited`.
Nessun goal è risultato completato.

Sul medesimo pacchetto, GLM-4.5-Flash reale ha restituito due
risposte HTTP 200. La fixture limita il primo campione al
verificatore sintetico. Il comando è partito una volta con exit 1.
È seguito nello stesso turno un riepilogo senza strumenti. Il goal
rimane `budget_limited` e registra 3.067 token dopo la deduzione
delle letture dalla cache, in accordo con i due report HTTP.

La suite completa ha osservato un errore EPERM sulla pubblicazione
di una ricevuta di revisione prima della correzione. Il test
mirato riproduce l'errore e conferma la pubblicazione della stessa
ricevuta riusando il retry limitato della rinomina Windows.

- Node completo, 1.712 passati, due esclusi e gli stessi 43 fallimenti nominativi della baseline Windows.
- ASAR SHA-256 `70198B212503555A7436A1727C2507270F0DB5222E0BB66FA864670C437EBB13`. Smoke Windows passato.
- ZIP Windows x64, 466 file verificati. SHA-256 `B9FB2AF74898BF3CB2BE0C98308594813487E43DD8B4725C4564A0C05F81A9FF`.
- Collegamento desktop r60, ripristino r59 e sette configurazioni del profilo con hash verificati.

La prova verifica il protocollo Ollama. Il modello Devstral reale
resta da qualificare. L'Ollama standard risponde su loopback ma
non registra modelli. La precedente revisione automatica ha
rifiutato l'avvio dell'istanza dedicata.

## Build Windows r59 — 15 novembre 2026

Il desktop avvia la r59. Il collaudo Electron con provider
deterministico su loopback ha eseguito una volta il verificatore
con exit 1. Dopo 64 token sullo strumento e 16 sul riepilogo, il
goal è rimasto `budget_limited` e privo di evidenza di completamento.
Il riepilogo è arrivato nello stesso turno senza strumenti.
La r58 riproduceva l'assenza del riepilogo con la stessa fixture.

La r58 ha anche verificato il limite raggiunto durante una
compattazione, senza un altro campione, e lo stato `usage_limited`
dopo un singolo HTTP 429 di quota. La cronologia rimane disponibile
se il modello non restituisce un riepilogo. I subagenti ricontrollano
il budget prima di chiamare il provider e prima di eseguire lo
strumento.

- ASAR SHA-256 `4C0002620D1F2BE3F4216C24F5CC3D0F3A4096CEB7EFC0DACEB5F1AAFB0C45B6`.
- ZIP Windows x64, 466 file verificati. SHA-256 `89F5360C5B2E9F23F4AA5FEFE8368DC1B4EE384F17418DD49176E7EE9A375658`.
- Smoke Windows passato con profilo isolato. Sette configurazioni del profilo con hash verificati, ripristino r57.

## Build Windows r57 — 15 novembre 2026

Il collegamento desktop avvia la r57. I sette file di configurazione
del profilo conservano gli hash e il collegamento r56 è disponibile
per il ripristino. Le due build differiscono nei cataloghi inglese e
italiano. Sono passati i 516 test renderer, il controllo dei cinque
cataloghi e lo smoke Windows con profilo isolato.

- ASAR SHA-256 `7AA6CDA0D45CEB75B5B6C1CC6141C3E33912F7318AF55C40F6F939AB5535DB3B`.
- ZIP Windows x64, 466 file verificati. SHA-256 `DE358518E1E48917DC81CEDC311D71DF378D509C344C9B6E9F2146E7C2AD93B2`.

Il candidato successivo conserva lo stato di limite del goal se una
compattazione esaurisce il budget prima di una nuova richiesta. Il
controllo è condiviso con i subagenti. La cronologia resta disponibile
se la compattazione non produce un riepilogo. Il test sulla r57
riproduceva una richiesta e un addebito ulteriori. Restano la prova
Electron del candidato e il confronto con il riepilogo di chiusura
previsto da Codex.

## Build Windows r56 — ripresa a freddo

Una richiesta Riprendi ricevuta durante l'avvio attende modelli,
estensioni, profili e caricamento dei task prima di cercare il task.
La r55 ha superato la prova Electron dopo una chiusura regolare con
una sola richiesta IPC ricevuta prima della lettura del profilo.
La r56 estende la riconciliazione allo stato `InProgress` lasciato
da un arresto improvviso prima del caricamento del task. Il test
di regressione r55 perdeva contesto e ID del turno nel percorso
generico. La prova Electron r56 ha terminato l'albero del processo
isolato, lasciando sul disco lo stato `InProgress`. Una richiesta IPC
inviata prima della disponibilità del profilo ha recuperato lo stesso
turno. Due input già confermati sono arrivati una volta ciascuno e il
processo nativo non è ripartito. Provider deterministico su loopback.

- 190 test Node mirati, 44 test del progetto e 20 del renderer.
- Suite Node completa su Windows, 1.691 passati, 43 falliti e due esclusi. I 43 nomi dei test falliti coincidono con il confronto precedente dei test upstream locali.
- Typecheck Node e web, lint mirato e Semgrep locale su 43 file, 12 regole e zero rilievi.
- ASAR SHA-256 `1A54489C54603765632BFD1FE7CBEA147DEF3AD9CCEBC44B8BAF1F4574702E8C`. Smoke Windows passato.
- ZIP Windows x64, 466 file verificati. SHA-256 `A2F94F7EB70BD75536BEBE10C8E4173F13175ED5C832945910300D4DC4F8167C`.
- Collegamento desktop r56, ripristino r54, sette configurazioni del profilo con hash verificati.
- Il checkout include anche la correzione del catalogo dei menu e dell'aiuto `/goal` emersa nella suite renderer. Il pacchetto desktop r56 precede questa sola modifica ai testi dell'interfaccia.
- Suite renderer completa sul checkout, 516 test passati dopo la correzione dei cataloghi.
- Candidato r57 compilato per i soli cataloghi inglese e italiano. ASAR SHA-256 `7AA6CDA0D45CEB75B5B6C1CC6141C3E33912F7318AF55C40F6F939AB5535DB3B`. Prima di pubblicare lo ZIP r57 o cambiare collegamento verificare l'esito dello smoke isolato e il pacchetto. Il collegamento punta alla r56.
- Proseguire con modello locale, prove multiprovider e pilota Edilas su copia isolata.

## Build Windows r54 e checkpoint di lavoro — 14 novembre 2026

Il ciclo Agent applica ora la stessa classificazione dei guasti del
provider con o senza streaming. Rispetta il veto dell'adattatore,
il ritardo comunicato con `Retry-After` e il limite dei tentativi.
Un errore successivo all'avvio di uno strumento non ripete il campione.
Due test hanno riprodotto l'interruzione al primo errore nella r53 e
passano con la correzione. Sono passate anche le prove per quota
esplicita, veto, ritardo del server e strumento già avviato. Su Electron
sono passati quattro casi con provider deterministico su loopback. La
disconnessione dopo un campione con esito nativo ha conservato la
ricevuta e ha ripreso lo stesso turno senza rieseguire il comando.

- 105 test Node mirati, typecheck e smoke Windows.
- ASAR SHA-256 `D7126C7E6548996485DC469CD2194499896466CE86FDD4B30ED22D0F517DB221`.
- ZIP Windows x64, 466 file verificati, SHA-256 `49671B62E60CFC9797784B54F2539284AABFB354403E84630897F2AEEE7728D8`.
- Collegamento desktop r54, ripristino r53, sette configurazioni del profilo con hash verificati.

GLM-4.5-Flash reale ha completato il goal sulla medesima ASAR. Cinque
risposte HTTP 200, primo esito 1, nuovo turno automatico, verificatore
con esito 0 ed evidenza nativa nel completamento. La fixture impone
il primo confine di turno e limita il menu dei comandi per fase.
Nessun nuovo messaggio utente e uscita Electron con codice 0.

Il candidato successivo conserva una richiesta di ripresa ricevuta
all'avvio mentre progetti e profili sono ancora in caricamento. Il test
riproduce la perdita della richiesta sulla sorgente r54. Il candidato
supera nove test mirati e typecheck Node. La prova sul pacchetto resta
in corso.

Per il modello locale è stata verificata una copia isolata del modello
Devstral, con quattro componenti su digest atteso e runtime Ollama
0.40.16 con firma valida. La revisione automatica ha rifiutato l'avvio
dell'istanza dedicata. Il listener esistente non ha esposto modelli al
controllo eseguito. La prova con un modello locale rimane da svolgere.

Il prossimo collaudo resta nel perimetro Agent-Lab e usa un progetto
sintetico. Qualificare retry, contabilità degli obiettivi e ripresa
con provider reali. Collegare ogni evidenza alla build verificata.
La qualifica del pilota Edilas richiede una copia isolata.

Come precondizione del pilota, 51 prove mirate su repository sintetici
hanno confermato dependency tracking, ripresa di integrazioni, regole
e gestione della coda. Separatamente la verifica Docker reale è
passata con l'immagine Node locale fissata per digest. La ricerca reale
già collaudata nelle build precedenti non è stata ripetuta qui.

## Build Windows r53 — 14 novembre 2026

Il desktop avvia la r53 attraverso il launcher esistente. Con un
provider deterministico su loopback, il collaudo Electron ha inviato
due correzioni al turno attivo, separato un prompt in coda e interrotto
un comando nativo con Stop. La ripresa ha conservato lo stesso ID di
turno, ricevuto ogni correzione una sola volta e mantenuto un solo avvio
del comando. Il collaudo ha rimosso il prompt separato dopo averne
verificato la persistenza, per isolare la ripresa. Dopo la riapertura
la cronologia coincide con il checkpoint. La r52 riproduceva gli ID
duplicati nel checkpoint con la stessa procedura.

- 100 test Node mirati, quattro del renderer, typecheck e smoke Electron Windows.
- ZIP Windows x64, 466 file verificati, SHA-256 `6A7B912FC1F69F3FB022C1AF5AD040954F8AC1631AD08DA40422AA5FCA613DDC`.
- ASAR SHA-256 `46E32E44AB031BF347F5DB06B9A13289DC072B6B30F7F383AC8A3F94638A7E50`.
- Collegamento desktop r53, ripristino r48, sette configurazioni del profilo con hash verificati.

Il confronto multiprovider con modelli reali, il collaudo del modello
locale e il pilota su copia isolata di Edilas restano aperti. Le prove
di Git e Docker sono state eseguite su un progetto di test. La r53
non conclude la qualifica di parità con Codex.

## Build Windows r48 — 14 novembre 2026

Un verificatore nativo ancora in esecuzione può consegnare l'esito a un
turno successivo della stessa sessione. Il processo resta associato al
goal, al profilo e alla revisione verificata. L'esito viene consumato una
sola volta. La pausa interrompe il verificatore anche dopo la fine del
turno che lo ha avviato.

Con un provider locale deterministico e la stessa fixture pulita, la
r47 non registrava il poll con exit 0 dopo il cambio di turno. La r48 ha
registrato solo l'ID di quel poll e ha completato il goal con un lancio
del comando e zero messaggi utente aggiuntivi. La prova di pausa ha
confermato l'uscita del PID e lo stato `paused` privo di prove. Una terza
prova ha respinto l'esito quando l'impronta del checkout era indisponibile.

- 89 test mirati, typecheck Node, lint e smoke Electron Windows.
- ZIP Windows x64, 466 file verificati, SHA-256 `CA9D95D01AF5CE5C7939B2C0863C9BF8D15F10238BE29620A9279F0AC40AF89B`.
- ASAR SHA-256 `C2B57F990B7B550182364617A986A15565B662B72F7CA536D8EF900A35C45B9C`.
- Collegamento desktop r48, ripristino r47, sette impronte delle configurazioni del profilo corrispondenti.

## Build Windows r47 — 14 novembre 2026

Il motore risolve la directory di lavoro reale prima di attribuire la
prova a un checkout. Un esito 0 in una directory che la junction porta
fuori dal checkout non produce una ricevuta valida per quel goal.
La prova Windows r46 ha riprodotto il falso completamento. Sulla r47,
con gli stessi comandi nativi e il provider locale deterministico, il
verificatore interno ha completato il goal e quello esterno è stato
respinto come prova. Entrambi i comandi sono effettivamente terminati
con exit 0.

La r46 ha verificato con GPT-6.1 Sol la sequenza di avvio del verificatore
con exit `null`, lettura del goal senza prove, `bash_poll` con exit 0 e
completamento con il solo ID del poll. Un lancio per comando e stesso
turno dopo riavvio. La r47 include questo comportamento.

- ZIP Windows x64, 466 file verificati, SHA-256 `DE0A4CBACB77D6116FAF15EA6658568D4FAA09C90301440719EF3C496532751B`.
- ASAR SHA-256 `DA891CD6EC088B0F5AE8B41F713CACA033BC6EFA8D3DC24A2F3DE286F874FC27`.
- Collegamento r47 con copia r45 per ripristino. Sette file di configurazione verificati.

## Build Windows r45 — 14 novembre 2026

Quando due letture consecutive restituiscono lo stesso goal attivo e le
stesse ricevute native, la richiesta successiva propone gli strumenti
autorizzati senza `get_goal`. Il modello può continuare il lavoro o invocare
`update_goal` se le prove coprono l'obiettivo. La lettura torna disponibile
alla richiesta seguente. Una lettura fallita, sostituita o priva di ricevute
non consuma il tentativo.

GPT-6.1 Sol ha ripreso lo stesso turno dopo riavvio, con esito IPC
corrispondente, quattro comandi eseguiti una volta e completamento nativo.
GLM-4.5-Flash ha avviato il secondo turno senza nuovo input, eseguito il
verificatore nativo e citato la ricevuta in `update_goal`. Quattro risposte
HTTP 200 e uscita Electron 0. La fixture Z.AI controlla il confine fra i
turni e limita i comandi per fase. Rimuove anche l'istruzione ridondante
di rileggere il goal presente nel collaudo r43. Il ramo di recupero della
lettura ripetuta è collaudato con provider deterministico.

- ZIP Windows x64, 466 file verificati, SHA-256 `309F4A8CFB44245F15A22D55877BD79D54DBA2A416C2D1B507A2D707C3CE4A2A`.
- ASAR SHA-256 `299F45531A722BCD7AD822983B54ADCD07CA13C5EB521E3ECAD6C13D90303771`.
- 82 test mirati, typecheck Node e renderer, lint e smoke Windows.

## Build Windows r43 — 14 novembre 2026

La preparazione del contesto conserva i risultati di `get_goal` anche
quando la chiamata si ripete. La regressione riproduceva il risultato
aggiornato sostituito da un errore di duplicazione. Dopo una verifica
nativa, il contesto comunica gli ID disponibili. Per completare il goal
il modello deve invocare `update_goal` e citare una prova valida.

GPT-6.1 Sol ha completato il ciclo sulla r43 dopo riavvio, con lo stesso
ID, una sola esecuzione per comando ed entrambi i processi Electron usciti
con exit 0. GLM-4.5-Flash ha eseguito exit 1 e poi exit 0 in due turni
distinti. Ha ricevuto l'ID del verificatore direttamente e ha conservato
quattro risposte di `get_goal`. Al termine del collaudo limitato non ha
invocato `update_goal` e il goal è rimasto attivo.

- ZIP Windows x64, 466 file, SHA-256 `145DE518E0ED181B19AC74EC0F698B01D4E61228DF5DD8A70C33E0541188018F`.
- ASAR SHA-256 `7D008EFFDF8F102FA4CF40C439F9D639D84EFF2B1C1065418F3BF3976A94BF52`.
- 88 test mirati, typecheck Node e Web, lint e smoke Windows.

## Build Windows r42 — 14 novembre 2026

Nella ripresa il modello riceve le identità delle operazioni registrate
dal checkpoint come interrotte, con esito `unknown`. Il messaggio contiene
nome del tool e ID della chiamata. Gli argomenti e le impronte interne non
vengono reinviati. Il controllo di replay riusa il checkpoint.

Il riavvio gestito r42 ha ripreso lo stesso turno. Il provider locale
deterministico ha ricevuto il riferimento esatto e un solo comando di
verifica è stato eseguito. L'uscita finale di Electron ha restituito 0.
I goal in pausa e quelli mai aperti hanno conservato il proprio stato.

- ZIP Windows x64, 466 file verificati, SHA-256 `2153786D022AFD787F14BE00BBC2246753EE9F3CDF94B0FE9DBACEA2A6FDDD85`.
- ASAR SHA-256 `2A3471F9E936BB9CDA7101633410EF0D05EA2DDC2D9919CE017C0F165CA67340`.
- Launcher del checkout SHA-256 `94FC05D8F11B7227B269BBEA3598634CFC652D8B70B9C9F23AC8D4E1EE3E3C32`.
- 94 test mirati, typecheck Node e web, lint e smoke Windows eseguiti.

## Build Windows r41 — 14 novembre 2026

Il menu File offre **Riavvia Agent-Lab** nel launcher Windows portabile.
Il launcher conserva il backend e la propria identità, sostituisce il
processo Electron e trasferisce una ricevuta temporanea associata al riavvio.
Il successore riprende i goal attivi già caricati in scrittura nei progetti
aperti. La chiusura ordinaria non avvia questo percorso.

Il collaudo isolato con provider locale deterministico ha azionato il menu
effettivo. Il successore ha riusato lo stesso turno, eseguito il verificatore
una volta e concluso il goal prima di una richiesta di caricamento dal
renderer. Un goal in pausa e un goal mai aperto hanno conservato i digest.

- ZIP Windows x64, 466 file, SHA-256 `E8D59BFCF13FB401A548D87CE2CF522A8DF9E350BD0C35F8A6EBB7251888E099`.
- ASAR SHA-256 `B6E32E92D8491183B5169872C9CDA67FBF663C87E9D60540E1CBD0114BD04757`.
- Il collegamento usa r41 e il launcher verificato. I sette file di configurazione hanno conservato gli hash.
- 93 test mirati, typecheck, lint, smoke Windows e avvio simulato del backend sotto supervisione.

## Build Windows r40 — 14 novembre 2026

`update_goal` usa uno schema JSON semplice con stato enumerato. Il backend
richiede ancora una ricevuta nativa per registrare `complete`. La prova
GPT-6.1 Sol sulla r40 ha verificato due turni, riavvio, recupero con lo stesso
ID anche via IPC e completamento verificato. I quattro strumenti sono partiti
una volta ciascuno e i processi Electron hanno restituito exit 0.

GLM-4.5-Flash ha eseguito il verificatore con exit 0 dopo il passaggio al
secondo turno. Il relay del collaudo è terminato per timeout dello stream.
Il goal è rimasto attivo e il completamento Z.AI resta da qualificare.

- ZIP Windows x64, 466 file verificati, SHA-256 `46834A839C3CAD724D54CC9225E4D03762F7DEC197BF43D6AFAA0EDF190CB678`.
- ASAR SHA-256 `928E97115D158A1D0E758FDE4ACE595A192BDB36D006D998EC9360FB85312F40`.
- 108 test mirati, typecheck Node e web, lint e smoke Windows superati.

## Build Windows r39 — 14 novembre 2026

La provenienza del prompt viene mantenuta dalla chat fino alla coda. Un
prompt di un altro task non può approvare un piano, gestire direttamente
un goal o rispondere a una domanda Plan. Le domande strutturate seguono
l'ordine di richiesta. Se la domanda cambia durante un hook, una risposta
tardiva non consuma la domanda successiva. Pausa e cancellazione del goal
interrompono anche il controller appena creato nella mutazione serializzata.

Con GPT-6.1 Sol la r37 ha creato un goal da una richiesta naturale nel
turno originale. Ha aperto un turno successivo e lo ha ripreso dopo un
riavvio con lo stesso ID e un solo avvio per comando. La r39 ha collaudato
la scelta Plan dalla finestra e l'uscita pulita di Electron. Il primo avvio
sulla stessa ASAR ha raggiunto il timeout di osservazione della chiusura.

La prova controllata Z.AI GLM-4.5-Flash r39 ha prodotto una verifica con
exit 0 in un nuovo turno e ha reso la ricevuta nativa visibile al modello.
L'obiettivo è rimasto attivo perché il modello ha consultato `get_goal`
senza chiamare `update_goal`. La prova multiprovider resta parziale.

- ZIP Windows x64, 466 file verificati, SHA-256 `F4617A5DAE048E4655A4813CCD51D81038D2B694029BD4EE7C8EFD0915258618`.
- ASAR SHA-256 `433CD76F6C9C696C9D8D518A6E65609AE640D42ACA8F84A6AAA9E161E1DC569F`.
- Collegamento desktop r39. Conservati i digest dei sette file di configurazione.
- 106 test Node mirati, typecheck Node e web, lint e smoke isolato completati.

## Build Windows r35 — 14 novembre 2026

Dopo un arresto forzato, il task verifica l'identità del checkpoint prima
di riclassificare il turno rimasto `IN_PROGRESS`. La ripresa riusa lo stesso
turno e conserva gli esiti precedenti. GPT-6.1 Sol ha riprodotto il difetto
sulla r34 con un nuovo ID e un doppio lancio del comando interrotto. Sulla
r35, stesso ID e un solo lancio per ciascuno dei quattro comandi. Il sistema
ha registrato l'esito della verifica nativa, zero nuovi messaggi utente e
nessuna esecuzione del comando rimasto senza esito. Il listener IPC installato
dopo la riapertura non ha osservato l'evento del turno. Le ricevute su disco
confermano il risultato.

L'implementazione Plan salva anche il testo approvato nel checkpoint del
turno. Il budget Goal esclude l'input dalla cache e contabilizza step dei
worker e chiamate ausiliarie della compattazione. Questi due delta hanno
verifiche mirate. Restano da qualificare i corrispondenti scenari reali.

- ZIP Windows x64, verificati 466 file, SHA-256 `62EFF0B5657610986850DC9909E4B2BC3128CCE44D43703AA292E12DD8563AF3`.
- ASAR SHA-256 `BE438D270127DFA510B8652A21202848590469F915AA8E738241B6C3630997C7`.
- Stesso renderer della r34. Smoke Windows, typecheck e 66 test mirati superati. Il primo aggancio Playwright alla build ha raggiunto il timeout. La ripetizione sulla stessa ASAR è passata.

## Build Windows r34 — 14 novembre 2026

Plan Codex usa strumenti di esplorazione, mostra il Markdown come proposta
strutturata e conserva il piano dopo riavvio. Un ID obsoleto e una richiesta
Agent senza decisione sono stati rifiutati prima di chiamare il modello.
GPT-6.1 Sol ha implementato e verificato due fixture dopo approvazione.
Una ha riusato la chat e l'altra ha ricevuto una copia esatta del piano in
una nuova chat. Ciascun verificatore è partito una volta con exit 0.

Il renderer r32 riproduceva una cronologia alta zero a 884 × 631. La barra
delle azioni andava a capo carattere per carattere. La r34 ha reso visibile
il piano dopo il riavvio alla stessa risoluzione, con virtualizzazione
attiva e pulsante di approvazione raggiungibile. Il modo Plan con `plan.md`
è ancora disponibile come estensione opzionale.

La correzione Windows per la scrittura atomica ritenta il rename dopo una
violazione di condivisione. Una prova con handle reale ha prodotto `EPERM`,
poi ha pubblicato la ricevuta `success` sullo stesso ID dopo il rilascio.
Il main compilato r33 e r34 è identico. Nella r33 GPT-6.1 Sol ha ripreso
`/goal` con il medesimo turno dopo riapertura, una sola esecuzione già nota
per comando e una verifica reale prima del completamento.

- ZIP Windows x64, SHA-256 `D0DFCF5DB9BC25D7453454EA0C6E601955EFC836F324CD8391DE82B381E1A909`. Confrontati 466 file dopo estrazione.
- ASAR SHA-256 `43827630741BD328AFB08BA85F585D27E8CE6C719D1264E800D7DEDF37C0EA28`.
- Renderer r33 → r34, 204 byte JS e 90 byte CSS aggiunti. 518 chunk JS.
- Verificati il flusso Docker con digest e la ricerca Internet. La prova del toolset resta riferita ai provider e alle configurazioni testate.

## Build Windows r30 — 14 novembre 2026

La chat Agent ordinaria conserva un obiettivo esplicito creato con `/goal`.
Un obiettivo attivo apre turni nuovi senza nuovi messaggi utente. Quando
Electron si chiude durante un turno del goal, riaprire la chat riprende
automaticamente il turno registrato con lo stesso ID. La coda governata
continua a usare il proprio stato.

GPT-6.1 Sol ha superato la prova isolata con due turni, controllo nativo
fallito, subagente Audit, chiusura completa, riapertura e verifica nativa
riuscita. I quattro comandi sono partiti una volta ciascuno. Il goal è
diventato `complete` dopo il controllo esplicito, con l'ID della ricevuta
salvato e zero messaggi utente aggiunti. L'IPC testato non ha emesso un
successivo messaggio testuale alla chiusura tramite tool. Il checkpoint e
la ricevuta provano l'ID della ripresa.

- ZIP Windows x64, SHA-256 `56D18ECD9C32AC5FE016F0011195ABF221831ADED9797DF060174FD3CB4F3BEC`. Verificati 466 file.
- ASAR SHA-256 `C90F327C742093BF05B414DD742C3EB47416582947D1AFD21A439B5FF69408CF`.
- 69 test mirati, typecheck, lint e cinque lingue verificati. Smoke superato al secondo avvio sulla stessa ASAR. Il primo controllo ha raggiunto il limite di osservazione durante la chiusura.
- Renderer da 29.692.450 a 29.693.194 byte nel file d'ingresso. Numero di chunk JavaScript stabile a 518.

La verifica reale ha usato un verificatore esplicito e uno specifico
provider. La pertinenza e la freschezza delle prove senza verificatore,
la contabilizzazione completa dei subagenti e le sceneggiature Plan
richiedono ulteriori prove.

## Consegna Windows r29 — 14 novembre 2026

La r29 aggiunge il bind esplicito a `127.0.0.1` per le fixture Electron
che collaudano l'Agent ordinario fuori da General e dal pilot. Il launcher
desktop usa già General e il servizio di associazione del telefono conserva
il proprio listener. I log Windows avevano registrato due eventi `2097`, TCP
e UDP, al primo avvio diretto della r28 da un percorso nuovo. Sulla r29, una
nuova estrazione in modalità ordinaria con il flag attivo ha aperto due
listener TCP su `127.0.0.1`, zero listener UDP e zero nuove regole o richieste
per l'eseguibile. Il firewall è rimasto attivo.

La r28 ha verificato con GPT-6.1 Sol che il turno interrotto conserva il
livello effettivo Alto dopo il riavvio, anche quando il selettore viene
impostato su Basso. ID del turno invariato, un solo messaggio utente,
risultato precedente recuperato e nessun comando rieseguito. La r29 include
questa correzione. Il collaudo con modello reale è stato condotto sulla r28.

- ZIP Windows x64 portabile, SHA-256 `2DA3DEB377773F759CFB39F7958DDB38E8FA1AEB000552F848C2E5186F096471`. Tutti i 466 file estratti corrispondono.
- ASAR SHA-256 `FA5F9C16D2FD6A1910FD850EFFFC3003BEB708CF695C41A9D26B7D125F43BFBB`.
- Il collegamento Agent-Lab punta alla r29. I sette file di configurazione hanno conservato gli hash originari. Prova di avvio su profilo isolato.

## Consegna Windows r26 — 14 novembre 2026

La ripresa del turno principale conserva anche la modalità Plan registrata,
se l’estensione Plan è abilitata. Le istruzioni di pianificazione sono
applicate nel prompt di sistema a ogni ripresa. Il turno mantiene il suo ID
e il messaggio originale. Il pacchetto include la sorgente dell’estensione
compatibile in `resources/agentlab-extensions/plan-mode.ts`. L’attivazione
continua a dipendere dal profilo.

Con GPT-6.1 Sol, la r26 ha ripreso Plan dopo chiusura completa e riapertura,
pur con il selettore impostato su Agent. Ha creato il piano della fixture,
chiesto approvazione e conservato l’ID negli eventi IPC e nella cronologia.
Il comando di ispezione è partito una sola volta. I sorgenti protetti della
fixture sono rimasti intatti. Smoke Windows e 466 file estratti verificati.

- ZIP Windows x64 portabile, SHA-256 `8D9E1FBC6D56F80A73D0764B7A0CFEA93AC29A13BB7F729D7C8EFF88C889532B`.
- ASAR SHA-256 `2BC1C9DA5E77E031F99665238994F1D7BE66CE1686EF5A596012DDFE01008086`.

Il contratto dell’estensione Agent-Lab continua a produrre `plan.md`. La
modalità Plan del riferimento Codex usa istruzioni non mutanti e un piano
strutturato con passaggio del piano approvato. Questi contratti restano
distinti dal recupero della modalità e dall’identità del turno.

## Consegna Windows r25 — 14 novembre 2026

Il turno principale in modalità Agent ha ora un checkpoint scritto prima
dell’avvio del modello. **Riprendi** riusa l’ID originale e l’input salvato
quando profilo, modello, modalità e checkout corrispondono al checkpoint.
Conserva gli esiti noti, segnala le operazioni senza esito e rifiuta il replay
identico dei comandi shell registrati. Se l’esito finale è già sul disco,
recupera lo stato della chat senza chiamare nuovamente il modello.

Con GPT-6.1 Sol, la r21 ha riprodotto il cambio di ID e la doppia esecuzione
del comando lungo. Sulla r25 il task avviato via IPC ha conservato lo stesso
ID su disco e negli eventi IPC dopo la chiusura completa e il riavvio. Un solo
messaggio utente, risultato precedente conservato, un solo avvio per ciascun
comando e nessun esito attribuito al comando interrotto. La suite estesa ha
superato 229 test con Docker e SearXNG reali su fixture isolate.

Nella r21, `resume_task` ha già verificato lo stesso contratto per subagenti,
inclusa la conservazione del risultato di un tool quando un tool parallelo
dello stesso passo era ancora attivo alla chiusura. Il riferimento rimane
Codex Core `7194b21`. Il recupero dell’Agent principale è ora verificato in
modalità Agent. La ripresa di Plan con le impostazioni del turno originario
rimane una differenza da implementare e collaudare.

## Consegna Windows r19 — 14 novembre 2026

Il task registra l’identità di un subagente in background prima di avviarlo.
Conserva gli esiti dei passaggi completati e le operazioni prive di esito. Dopo
la chiusura, `list_workers` distingue lo stato interrotto e `followup_task`
riprende lo stesso ID nel task e nel checkout proprietari. La ripresa informa
il modello degli effetti incerti prima di ulteriori modifiche. La cancellazione
esplicita del contesto revoca i precedenti ID. La compattazione conserva gli ID.

Un comando Power con `yieldMs` mantiene lo stesso ID fra turni del task e
del profilo che lo hanno avviato. La chiusura termina i processi gestiti e
invalida gli ID, mentre la chat conserva gli output completati. Il percorso
di recupero è stato confrontato con il sorgente Codex fissato a `7194b21`.
[Recupero dei turni Codex](https://github.com/openai/codex/blob/7194b2177643f3c639cfc5b29f6398c545b0e7e2/codex-rs/core/src/codex_thread.rs#L609) · [Durata dei processi Codex](https://github.com/openai/codex/blob/7194b2177643f3c639cfc5b29f6398c545b0e7e2/codex-rs/core/src/unified_exec/process_manager.rs#L1235)

GPT-6.1 Sol ha superato su r19 le prove di riapertura con worker interrotto
e di input fra turni sullo stesso processo. La ripresa ha conservato il
risultato del primo comando e lasciato l’operazione interrotta da riconciliare.
Entrambi i conteggi di avvio sono rimasti a uno. La prova shell ha rifiutato
l’ID dalla chat estranea e dopo la chiusura.

- ZIP Windows x64 portabile, SHA-256 `D83DDFDD87E39B0889642FA0605B798BD254BDF0F73989180C9ABF4A6AA5B588`. Verificati tutti i 465 file estratti.
- ASAR SHA-256 `9349CDFD271C3FB0DE87E0F003D6C96A54F6E722624609492C55B08936E6CB44`.
- Avvio da profilo isolato, splash e PTY verificati. Il profilo reale è rimasto chiuso per evitare di riaprire progetti fuori perimetro.

La qualifica vale per gli scenari, il riferimento e i provider indicati nelle
prove. La sospensione di Codex si confronta con la ripresa esplicita dello
stesso ID in Agent-Lab. La ripresa Agent-Lab usa una richiesta di follow-up.

## Consegna Windows r15 — 14 novembre 2026

La r15 portabile Windows x64 è stata collaudata da una cartella esterna al
repository. Sono stati confrontati tutti i 465 file dopo l’estrazione. Il
collegamento Agent-Lab sul desktop punta alla r15. Il collaudo di avvio ha
usato un profilo isolato e l’hash della configurazione del profilo esistente
è rimasto identico durante l’aggiornamento del collegamento.

- ZIP `Agent-Lab-Windows-x64.zip`, SHA-256 `41D54B64B366B4A5E1A6F6263100D18111DC8FAC9F2FC209C5F57E59F4F4C1B4`.
- ASAR SHA-256 `FC03C594F703BFD5ED36E509E0EBBB4276B81C104DA927C56AFC6C1CF712212E`.
- 218 test mirati in 19 file sul sorgente della r15 con Docker e SearXNG reali. Typecheck Node e renderer, lint, review indipendente, scansione del diff e smoke Windows completati.
- GPT-6.1 Sol ha usato fonti Internet dopo un candidato fallito. Il controllo negativo con errore di ricerca ha lasciato `dev` fermo. Il confronto sullo stesso difetto con Codex desktop ha usato un verificatore immutato e ha restituito exit 1 prima e 0 dopo su entrambi i percorsi.
- Z.AI GLM-4.5-Flash ha recuperato autonomamente da HTTP 400/1261 nativo. La prova OpenAI ha iniettato il rifiuto nell’adattatore e ha eseguito il recupero con GPT-6.1 Sol reale.
- Le prove con modello reale coprono PTY, input e risultato sullo stesso ID, worker concorrenti, messaggio a un worker attivo, interruzione selettiva, follow-up dopo compattazione e riapertura. In r15 la chiusura durante il lavoro ha terminato i tre processi di prova. Alla riapertura lo stesso task risultava interrotto, senza rilanciare i comandi.

Il confronto qualifica gli scenari descritti. La parità integrale, il recupero
automatico di un worker interrotto dalla chiusura e il collaudo su copia di
Edilas restano da dimostrare. La CLI Codex annidata ha ricevuto un rifiuto dal
runner. I 43 fallimenti Node e il fallimento renderer della suite integrale
precedente sono stati riprodotti sulla baseline Windows. Lo ZIP, le tracce
grezze e i profili sono conservati localmente.

## Recupero tecnico nel motore

Il flusso governato registra gli esiti falliti, conserva l’ultima proposta e
riprende dal Correttore sulla stessa base. Distingue i candidati smentiti da
controlli deterministici dagli errori temporanei del modello o del runner.
Se un verificatore si interrompe, riprende la verifica del candidato salvato
prima di chiedere una nuova proposta. La review resta necessaria per consegnare.
La coda avvia una nuova valutazione su `dev` dopo un avanzamento concorrente.
Se mancano input per qualificare una prova, avvia e conserva la diagnosi sulla
revisione osservata. Le attività dipendenti attendono prove utilizzabili.

Con la ricerca globale SearXNG autorizzata, il motore può cambiare strategia
dopo la soglia configurata, conservare i riferimenti e continuare nella
stessa esecuzione. La prova d’integrazione usa un endpoint SearXNG reale e
risposte del modello controllate.

L’Agent ordinario propaga gli errori di iterazione dei subagenti al chiamante.
Un arresto per limiti di iterazione o output mantiene il task incompleto e una
cancellazione durante l’iterazione viene riportata come tale.
Se il modello si ferma dopo un tool, il motore gli restituisce il risultato
con un’indicazione di ripresa. Il limite dei retry resta effettivo.

L’Agent ordinario stima il contesto anche prima che il provider comunichi
l’uso dei token. Se il provider segnala un limite di contesto prima di
restituire un esito, il motore sintetizza la cronologia in blocchi e ritenta
il passo. L’esito del turno viene salvato prima di pubblicare il completamento.

Gli strumenti Power possono restituire un ID di processo e raccoglierne
l’esito in una chiamata successiva. Con `bash_input` impostato su **Sempre**
nel profilo, il modello può inviare dati ed EOF ai comandi avviati in modalità
interattiva. L’interruzione termina l’albero del comando. Dopo riapertura
restano consultabili gli esiti salvati nel task.

I subagenti in background restituiscono un ID prima di terminare. Il padre
può attendere o interrompere il singolo worker. Dopo la raccolta di un esito
positivo, la conversazione del worker viene salvata nella cartella del task e
può essere usata in un follow-up sullo stesso ID.

La coda torna ai task in attesa dopo un’integrazione che può cambiare i loro
prerequisiti. Un batch di correzione può avviarne un altro quando emergono
nuovi esiti deterministici. La riapertura di un task governato attivo verifica
la stessa approvazione oppure piano, fonti e configurazione autorizzati.
L’audit della coda verifica le prove correnti prima di completare l’obiettivo.

La coda include i `requiredChecks` del progetto anche quando il singolo task
non li elenca. Al riavvio dell’app riprende gli obiettivi governati attivi e
ricontrolla l’autorizzazione. Per quelli in attesa osserva la revisione di `dev`,
le attestazioni e la scadenza dei tentativi per i guasti temporanei riconosciuti.
Lo Stop esplicito mette in pausa l’obiettivo. La preparazione dei servizi legge
i documenti dalla revisione verificata e condivide l’avvio tra chat concorrenti
quando i documenti coincidono.

Quando la coda riattiva un task dopo un’attestazione, il pianificatore riceve
l’ID, il commit e l’esito già verificato per quel prerequisito. Un piano
incompleto può essere riesaminato quando cambia quel contesto. La coda conserva
le ricevute dei task già integrati.

Nel pilota isolato con GPT-6.1 Sol, Docker ed Edge, Electron è stato chiuso
dopo T-12 e riaperto con lo stesso profilo. La coda ha poi integrato T-13 e
T-14 e ha verificato gli esiti, senza duplicare T-12. [Evidenza locale](../work/turni-live-J1J7L2/evidence.json)

Il requisito permanente è nel [blueprint generale](AIDERDESK-GENERAL-BLUEPRINT.md#responsabilità-tecnica-e-continuità).
Un secondo pilota, con Z.AI GLM-4.5-Flash, ha completato due task con Docker
e ripresa automatica dopo un’attestazione registrata da una seconda chat.
[Evidenza locale](../work/turni-wake-UEaS0m/evidence.json)
Restano il confronto completo con Codex e la prova su una copia di Edilas.
Le dipendenze esterne al perimetro rimangono coperte dalle prove di
sospensione prudente.

## Coda di lavoro e ripresa delle validazioni

«Avvia il lavoro» e «Riprendi il lavoro» leggono il piano versionato sul ramo di sviluppo e portano avanti i task eseguibili. Se un task richiede Docker, AiderDesk prepara il motore prima dell’esecuzione. «Riprendi le validazioni» recupera dal registro del progetto la prova, la versione e il prossimo passaggio. I comandi funzionano nella chat desktop e nell’invio remoto. [Configurazione e comandi](WORKFLOW-ENVIRONMENT.md#avvio-del-piano-e-ripresa-delle-prove)

Verificati 25 test mirati, con avvio a freddo simulato, container reali e ripresa del task dopo indisponibilità del motore. Il pilota senza controlli Docker ha completato la coda senza verificare il motore. Sono passati typecheck, lint, build del launcher completo e collaudo Electron/Edge. La review indipendente ha verificato che il polling prosegua anche dopo un errore del comando di avvio.

Nel collaudo a freddo sul PC, «Avvia il lavoro» ha riavviato Docker Desktop in 8,2 secondi dal comando. Docker ha ripristinato i due container remoti Agent-Lab e i sette container Edilas già attivi prima dello spegnimento. La coda Turni con modello simulato ha eseguito il controllo Docker sulla base e sul candidato e ha integrato T-12, T-13 e T-14 nella copia isolata con `dev` e `main`. Il launcher completo è rimasto aperto, il relay Agent-Lab ha restituito 200 per la Home e 401 per l’API senza sessione, e il controllo di salute Edilas ha restituito 200.

I launcher associano ora il checkout Edilas allo script di avvio del suo stack. Nella prova Electron entrambi i comandi hanno atteso i servizi Edilas reali prima di inviare la richiesta al modello simulato. I servizi erano già attivi durante questa prova. I test mirati hanno verificato anche che il comando di un altro checkout non selezioni Edilas e che due chat concorrenti condividano l’avvio.

Il profilo generale di Agent-Lab usa GPT-6.1 Sol con ragionamento Alto come valore predefinito. «Avvia il lavoro» e «Riprendi il lavoro» attendono Docker Desktop e avviano i container privati di Agent-Lab. Poi leggono i documenti di ripresa e preparano i servizi del checkout attivo. Edilas usa lo script dedicato, QuantoMiSPESA il PostgreSQL già registrato e ViaSalus il database locale conservato con verifica di proprietà. Per gli altri progetti si usano il documento dei servizi e le etichette Docker del checkout. Il collaudo a freddo è riservato all’utente.

Nel primo pilota Turni, un modello simulato ha eseguito T-12, T-13 e T-14 in Electron, con tre commit su `dev` e due soli rami. AiderDesk è stato chiuso dopo il primo passaggio di V-03 e riaperto in una nuova chat. Edge con viewport mobile ha confermato la persistenza del filtro e il registro ha salvato l’esito sulla versione provata.

V-03 è passata anche sul telefono fisico tramite il pilota isolato. AiderDesk ha recuperato il primo passaggio confermato e ha mostrato il secondo. L’utente ha confermato che il filtro «Solo attivi» è rimasto selezionato dopo la riapertura. Il registro del pilota ha salvato due passaggi confermati e l’esito positivo sul commit `7c82d7a`.

Il pilota successivo con GPT-6.1 Sol, tramite il profilo OpenAI Codex di AiderDesk, ha integrato T-12 (`cb46334`), T-13 (`a153733`) e T-14 (`3d98d67`) su `dev` in un solo «Avvia il lavoro». Il repository isolato conteneva soltanto `dev` e `main`. Il filtro ha superato il controllo comportamentale in Docker e la vista mobile la prova in Edge. V-03 è stata registrata in attesa sul commit di T-13 mentre la coda completava T-14. [Evidenza locale](../work/turni-live-Y7vnAS/evidence.json)

I tentativi preliminari hanno evidenziato la necessità di mostrare al revisore il risultato sulla base e le definizioni dei controlli, chiarire le fonti del pilota e verificare la vista candidata in Edge prima della revisione. Sono passati 20 test mirati, incluso il controllo Docker, oltre a typecheck, lint e build.

## Ruoli e skill del flusso di sviluppo

Il profilo generale e il profilo dell'ambiente governato dispongono delle 20 skill recuperate da OpenCode, comprese guide, riferimenti e script. Il confronto SHA-256 ha verificato 392 file nelle cartelle delle skill. La cartella `node_modules` di TrueLine contiene dipendenze generate e resta fuori dalla copia.

I launcher preparano i profili nativi **Designer UI/UX**, **Programmatore**, **Revisore del codice** e **Correttore** con gli strumenti Skills attivi. Alla creazione prendono il modello dal profilo principale di quell'ambiente. I profili sono richiamabili su richiesta nella chat Agent. Designer e Revisore hanno lettura e ricerca nel repository, con scrittura e shell disabilitate. Il Designer può consultare shadcn MCP e React Bits. Le istruzioni dei ruoli sono condivise con il flusso governato per repository.

Il flusso per repository seleziona le skill pertinenti nel piano e ne verifica il contenuto prima di eseguire il lavoro. Il Designer progetta le superfici richieste e revisiona il candidato dopo i controlli e la review del codice. Per il mobile la proposta riusa logica e dati del progetto e definisce una composizione e interazioni adatte al telefono. Il Correttore riceve la proposta e i rilievi. Il motore ripete controlli e review prima di preparare la patch. Vedi [ambiente governato](WORKFLOW-ENVIRONMENT.md).

Verificati build locali, typecheck, lint, Gitleaks e 45 test mirati. In Electron, un repository sintetico e un modello simulato hanno completato progettazione mobile, consultazione reale di shadcn MCP, applicazione della skill TypeScript, correzione e doppio riesame fino alla patch. Electron ed Edge hanno verificato anche il client remoto. Il test Docker opzionale e la valutazione visiva su un prodotto reale restano da eseguire.

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
