# Ripresa del riallineamento generale

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
