# Blueprint del flusso di lavoro AiderDesk

**Bozza da rivedere prima dell’implementazione**

AiderDesk accompagna un progetto dalla discussione iniziale alla consegna. Una volta concordato il piano, l’utente può dire **«Avvia il lavoro»** e lasciare che AiderDesk riprenda il lavoro documentato, esegua i task disponibili e registri le prove manuali da affrontare al suo ritorno. Il flusso si applica a progetti nuovi e a repository esistenti, secondo le fonti e le autorizzazioni di ciascun progetto.

## 1. Brainstorming

L’utente e l’agente discutono chi userà il prodotto, quali obiettivi deve raggiungere e come devono funzionare contenuti, schermate, flussi e regole di business. Con il metodo di Superpowers, l’agente espone le alternative quando incidono sul risultato, mette in evidenza i conflitti e chiarisce le decisioni necessarie. Le decisioni concordate alimentano il blueprint. Le domande aperte restano collegate alle parti del progetto che dipendono dalla risposta.

## 2. Blueprint funzionali

Il blueprint descrive cosa deve fare il prodotto, quali utenti possono fare cosa, quali dati e interazioni sono coinvolti e quali casi vanno gestiti. Spec Kit e OpenSpec aiutano a tradurre le decisioni in requisiti, scenari osservabili e criteri di accettazione, anche quando un comportamento esistente cambia. Per ogni scenario rilevante deve essere possibile riconoscere la condizione iniziale, l’azione e il risultato atteso.

L’utente conferma le decisioni di prodotto e il perimetro del lavoro prima dell’avvio. Le parti già definite possono entrare nel piano mentre le questioni aperte rimangono visibili sui task interessati.

## 3. Repository e documenti di progetto

Alla creazione di un repository, AiderDesk prepara le fonti necessarie a eseguire e riprendere il lavoro. In un repository esistente, il progetto indica dove si trovano le fonti in uso. I ruoli dei documenti valgono anche quando più informazioni sono raccolte nello stesso file.

| Fonte | Informazioni da usare |
| --- | --- |
| Regole del repository | Istruzioni di lavoro, limiti di accesso e modifica, convenzioni e controlli applicabili. |
| Blueprint e decisioni di prodotto | Comportamento atteso, perimetro, scelte confermate e criteri di accettazione. |
| Piano di lavoro | Milestone attiva, ordine dei task, dipendenze, perimetro operativo e verifiche previste. |
| Stato corrente e handoff | Task in corso, risultati ottenuti, versione di riferimento, prove disponibili e attività sospese. |
| Registro delle validazioni manuali | Prove da fare, versione, istruzioni, esito e attività che dipendono da quella prova. |
| Piano di ripresa | Ultimo passaggio confermato e prossima azione, con riferimenti al task o alla prova già registrati. |

Il codice, la revisione Git, le patch e i risultati dei controlli forniscono evidenza di ciò che è avvenuto. AiderDesk confronta queste evidenze con lo stato corrente. Quando una discrepanza cambia il prossimo passo, indica i documenti o le prove in conflitto e sospende le attività coinvolte.

## 4. Avvio e scelta dei task

Con **«Avvia il lavoro»**, AiderDesk legge le fonti del progetto, verifica il punto di partenza sul ramo di sviluppo e riprende il task in corso dall’ultimo passaggio comprovato. Se il task ha già una patch verificata, controlla se il ramo contiene già la modifica. Se l’integrazione è ancora da fare, la completa prima di avviare i task che ne dipendono. Prende il prossimo task eseguibile secondo l’ordine e le dipendenze del piano.

**«Riprendi il lavoro»** usa lo stesso percorso. Entrambi i comandi preparano Docker Desktop e i due container privati di Agent-Lab. AiderDesk legge i documenti di ripresa del checkout aperto, identifica i servizi associati e li avvia prima di eseguire il lavoro. I servizi restano attivi al termine della richiesta.

L’avvio autorizza il lavoro già previsto entro il perimetro concordato, anche su più task. AiderDesk decide dal contenuto se sta correggendo un bug, modificando un comportamento o aggiungendo una funzionalità. La scelta orienta le verifiche. Un bug parte dalla riproduzione del comportamento errato quando è riproducibile. Una modifica o una funzionalità parte dai criteri di accettazione e dai comportamenti esistenti che devono continuare a funzionare.

Durante la giornata, AiderDesk prosegue sulle attività autorizzate e disponibili. Si ferma quando raggiunge un limite del piano, quando l’utente lo interrompe o quando la coda eseguibile è esaurita. Una decisione di prodotto aperta, una dipendenza mancante o un problema tecnico irrisolto sospendono le attività interessate. AiderDesk registra il motivo e cerca il prossimo lavoro indipendente previsto dal piano. Il comportamento del flusso e il perimetro valgono sia da desktop sia da remoto.

## 5. Implementazione e revisione del task

1. **L’orchestratore** collega il task alle fonti e ai criteri pertinenti, sceglie i ruoli necessari e registra il piano operativo entro il perimetro concordato.
2. **Il designer UI/UX** interviene quando il task riguarda interfaccia o interazioni. Usa la composizione e i componenti già approvati. Per una UI mobile dedicata, progetta navigazione, gerarchia e azioni adatte al telefono e riusa le logiche, i dati, la validazione e i salvataggi del prodotto. Può consultare shadcn MCP quando serve valutare componenti compatibili.
3. **Il programmatore** realizza il task, collega interfaccia e logiche quando previsto e usa le skill OpenCode pertinenti allo stack. Controlla i comportamenti attesi e le regressioni rilevanti.
4. **Il revisore del codice** esamina la modifica e le prove in un passaggio separato. Cerca errori, regressioni, casi limite e semplificazioni utili. Prima di proporre una rimozione di codice morto, verifica i chiamanti, le esportazioni e gli eventuali riferimenti indiretti. Per una modifica UI, il designer controlla sul candidato il rispetto della soluzione concordata.
5. **Il correttore** riceve i rilievi e la versione esaminata. AiderDesk riesegue le verifiche interessate e sottopone la versione corretta alla revisione. La consegna registra la versione, i controlli e gli esiti effettivi.

I passaggi si adattano al task. Una correzione di logica coinvolge programmazione, controlli e revisione del codice. Una vista mobile richiede anche il contributo del designer e le prove previste per quella vista.

## 6. Validazioni manuali durante il lavoro autonomo

Quando serve una prova da parte dell’utente, AiderDesk la aggiunge al registro con l’identificativo del task, la versione o build da provare, il dispositivo o ambiente, le condizioni iniziali, i passaggi e il risultato atteso. Indica quali attività dipendono dall’esito. La voce può essere aggiunta dal piano oppure emergere durante l’implementazione o la revisione.

Un task integrato sul ramo di sviluppo può avere una **validazione manuale in attesa**. AiderDesk continua con i task eseguibili. Una prova sul telefono reale, per esempio, lascia in attesa una schermata successiva solo se quella schermata dipende dall’esito della prova.

Al ritorno dell’utente, **«Riprendi le validazioni»** apre la prossima prova indicata dal piano di ripresa. Le prove vengono affrontate una alla volta. AiderDesk registra l’esito sulla versione provata e aggiorna le dipendenze. Quando una modifica incide su una prova già effettuata, conserva l’esito precedente come storico e indica quali passaggi verificare sulla nuova versione.

## 7. Piano di ripresa

AiderDesk salva il punto di ripresa quando conclude una fase verificabile o riceve dall’utente l’esito o un passaggio confermato di una prova manuale. La nota indica il task o la prova in corso, la versione, l’ultima azione confermata, il riferimento alle evidenze e il prossimo passo. Se un passaggio viene interrotto prima di avere un esito, il piano rimanda all’ultimo punto confermato.

Per esempio, la sera sono previste cinque prove. V-01 e V-02 sono concluse. Durante V-03, l’utente conferma di aver selezionato «Solo attivi» nella build 128, poi interrompe la sessione. Il piano di ripresa indica **V-03, build 128, filtro selezionato**. Il prossimo passo è riaprire la schermata e verificare che la selezione sia conservata. Le prove V-04 e V-05 restano nel registro. Al mattino, «Avvia il lavoro» usa il punto di ripresa tecnico e continua con le attività compatibili con V-03 ancora in attesa.

Per il lavoro tecnico vale la stessa regola. Dopo ogni integrazione AiderDesk registra il commit verificato sul ramo di sviluppo e il prossimo task eseguibile. Se ritrova lo stesso candidato e prove valide, riparte dalla fase successiva. Se la versione o le fonti rilevanti sono cambiate, ripete le verifiche interessate e aggiorna il punto di ripresa.

## 8. Aggiornamento dei blueprint dopo una revisione

Durante una prova manuale può emergere un difetto oppure una nuova decisione. Se il blueprint richiede di mostrare solo i turni attivi e compare un turno inattivo, AiderDesk apre una correzione rispetto al requisito esistente. Se l’utente decide di mostrare anche i turni sospesi su telefono, AiderDesk registra la decisione confermata e aggiorna il requisito mobile, gli scenari e i task dipendenti nello stesso lavoro.

La registrazione collega la prova, la decisione e il requisito modificato. AiderDesk identifica le attività in corso e le verifiche influenzate, ripianifica quelle coinvolte e prosegue con il resto del lavoro disponibile. Compound Engineering aiuta a conservare le decisioni e le lezioni riutilizzabili con il riferimento alle prove.

## 9. Integrazione e consegna

Per ogni progetto sono ammessi **al massimo due rami Git**, il ramo principale e un unico ramo di sviluppo. AiderDesk riusa lo stesso ramo di sviluppo per tutti i task, le correzioni, le milestone e le riprese.

Dopo i controlli automatici e la revisione di un task, AiderDesk applica la modifica al **ramo di sviluppo**. Esegue i controlli pertinenti sul risultato integrato e, se passano, crea il commit. Registra l’esito e avvia automaticamente il prossimo task eseguibile. Un task dipendente parte dal commit del ramo che contiene già la modifica verificata.

Se un controllo fallisce durante l’integrazione, AiderDesk avvia la correzione e ripete le verifiche. Finché l’integrazione resta irrisolta, i task che dipendono dalla modifica attendono e le attività indipendenti possono proseguire dall’ultima versione verificata.

L’utente esegue le validazioni manuali richieste sulla versione del ramo di sviluppo. **Dopo le validazioni, decide quando integrare il lavoro nel ramo principale.**

Alla consegna AiderDesk confronta il risultato con i requisiti applicabili. Riporta le modifiche, la versione consegnata, i controlli automatici, la revisione e l’esito delle prove manuali richieste. Il piano identifica le validazioni necessarie per accettare la consegna e le eventuali attività ancora in attesa. Se l’utente riapre il progetto, ritrova il punto di ripresa e le prove su cui si basa.

## 10. Scenari per verificare il flusso

| Scenario | Risultato osservabile |
| --- | --- |
| Un progetto ha un task in corso, uno pronto e uno con una dipendenza aperta. | «Avvia il lavoro» riprende il primo e continua con quello eseguibile entro il piano. |
| Una prova su telefono resta in attesa durante la giornata. | Il registro contiene la prova e AiderDesk prosegue con il lavoro indipendente. |
| Una serata termina durante la terza di cinque prove manuali. | La ripresa apre la terza all’ultimo passaggio confermato sulla versione giusta. |
| Una prova fa emergere un bug oppure una nuova decisione. | Nel primo caso AiderDesk usa il requisito esistente. Nel secondo aggiorna il blueprint dopo la conferma e riallinea i task e le prove coinvolti. |
| Il revisore trova una regressione nella modifica candidata. | Il correttore riceve il rilievo. I controlli e la revisione riguardano la versione corretta. |
| Il task successivo dipende da una patch già verificata. | AiderDesk integra la modifica sul ramo di sviluppo, verifica il risultato e avvia il task dipendente da quel commit sullo stesso ramo. |
| Le validazioni richieste sul ramo di sviluppo sono concluse. | AiderDesk registra gli esiti. L’utente decide quando integrare nel ramo principale. |

## 11. Prova pilota sui turni

Il progetto pilota parte con il ramo principale e il ramo di sviluppo. Il blueprint richiede che il filtro mostri i turni attivi conservandone l’ordine. L’utente scrive **«Avvia il lavoro»** una sola volta.

1. **T-12, correzione del filtro.** AiderDesk riproduce il difetto, corregge il filtro e integra il task sul ramo di sviluppo dopo test e revisione.
2. **T-13, vista mobile dei turni.** Parte dal commit di T-12. Il designer progetta la vista per il telefono e il programmatore la collega al filtro corretto. AiderDesk integra il task e registra la prova manuale V-03 con la versione da provare.
3. **T-14, correzione di un testo nelle impostazioni.** AiderDesk completa e integra il task sullo stesso ramo mentre V-03 attende l’esito dell’utente.

L’utente avvia V-03 sul telefono, seleziona «Solo attivi», conferma il passaggio e interrompe la prova. Alla riapertura, **«Riprendi le validazioni»** recupera V-03, la versione e il passaggio confermato. L’utente riapre la schermata e controlla che il filtro resti selezionato. AiderDesk salva l’esito. Dopo le validazioni richieste, l’utente decide quando integrare nel ramo principale.

La prova misura quante modifiche sono utilizzabili al rientro, quanto tempo serve per validarle e quanto lavoro va riaperto. I commit devono mostrare la dipendenza di T-13 da T-12 e la prosecuzione di T-14 durante l’attesa. I due rami devono restare gli unici rami del progetto per tutta la prova.
