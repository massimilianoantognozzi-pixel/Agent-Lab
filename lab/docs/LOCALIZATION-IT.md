# Localizzazione italiana AiderDesk

## Esito del28ottobre2026

-1924voci italiane integrate e selezionate nel profilo dedicato.
- Registrazione italiana insieme a EN/ZH/RU/KO, altre lingue conservate.
- Menu nativi Electron tradotti; seguono la lingua selezionata all'avvio.
  Dopo un cambio lingua richiedono riavvio, mentre l'interfaccia React cambia
  immediatamente. Nomi propri, codice, comandi e diagnostica esterna conservati.
- Corrette etichette hardcoded, contatori, avviso iterazioni e stati applicativi
  noti; i messaggi originali nello storico non vengono riscritti.
- Reviewer italian_locale_review: quattro finding risolti (fallback messaggi,
  lookup prototipo, contatori/dicitura, animazione al cambio testo). Revisione
  aggiuntiva di menu e procedura di distribuzione senza finding bloccanti.
- Gate: JSON5linguePASS; parità1924chiavi/variabili/HTML/URL/newlinePASS;
 13testmiratiPASS, Home9PASSisolato, suiteinterfaccia514PASSsu79file;
 typecheck/lint/buildPASS; smokeGUI6controlliPASS, nessunpageError, exit0.
- Il primo fullweb ha avuto il timeoutHome5s già noto sotto compilazione
 concorrente. Nessun limite test allargato: HomeisolatoPASS e fullsenza buildPASS.
- Bundle inizialeJS:29576762→29691722byte raw (+114960);6040406→6074610byte
 gzip (+34204). TotaleJS:63683085→63798163raw;15317530→15351590gzip.
 Delta entro220KiBraw/40KiBgzip fissati prima delle modifiche; nessuna nuova
 dipendenza, route o alterazione dei confini lazy. CSS/media non inclusi.
- Compilazione e prova prima in copia separata con profilo senza chiavi o
 progetti reali, nessuna inferenza. L'app utente non e stata interrotta mentre
 lavorava; aggiornamento solo dopo che l'utente ha dichiarato fermata l'attivita.
- Versione precedente conservata in
 lab/work/locale-it/out-before-italian-1793219739440. Nessuna cancellazione.
 Distribuzione verificata, poi lingua impostata su it e riapertura normale.
- Verifica finale sulla finestra reale: interfaccia italiana, GLM4.5Flash nel
 profilo generale e dati della connessione preservati. Nessun commit/push.

Evidenze: lab/work/locale-it/{targeted-tests.log,home-recheck.log,
full-web-tests.log,typecheck.log,lint.log,build.log,bundle-graph-before.json,
bundle-graph-after.json,gui-proof.json,deployment.json}.

Le verifiche di localizzazione non sono una certificazione generale del prodotto;
i precedenti43FAILNodeWindows e10segnalazioni dipendenze restano separati.

Richiesta esplicita dell'utente del28ottobre2026: traduzione italiana completa.
Modalita IMPLEMENT/BUILD; rischio2, interfaccia e risorse, nessun cambio Auth,
provider, credenziali, quote, strumenti o progetti originali.

## Contratto del blocco

- Classe frontend SHELL: registrazione lingua, catalogo e testi visibili.
- Conservare import statici delle altre lingue e confini lazy esistenti. Una
  risorsa JSON italiana nello stesso registro; nessuna nuova dipendenza/route.
- Baseline reale out/renderer:517assetJS,63683085byte raw,15317530byte gzip.
  Misura totale, non dichiararla peso di caricamento iniziale. Baseline perfile
  in lab/work/locale-it/bundle-before.json; grafo iniziale misurato a parte.
- Budget motivato del delta: massimo220KiB raw e40KiB gzip per il catalogo e
  i piccoli adattamenti. Non alzare soglie per nascondere nuovi import pesanti.
- Tre worker hanno file distinti part-1/2/3.json, nessun'altra scrittura;
  integrazione parent, successiva review indipendente del catalogo aggregato.
- Tutte le chiavi inglesi presenti, placeholder/URL/markup e plurali conservati;
  controlli con i18next reale, regressioni UI, typecheck, lint, build e verifica
  visiva. Limiti di copertura dichiarati nel rapporto finale.
- Messaggi generati dall'utente/modello, codice, comandi, nomi propri e dettagli
  diagnostici esterni non vanno riscritti. Stati noti dell'app localizzati solo
  quando mostrati: lo storico/protocollo originale resta conservato.
- Attivare italiano nel solo profilo dedicato e mantenere altre lingue disponibili.

## Glossario

Task=attività; Agent=agente; Prompt=richiesta; Model Library=libreria modelli;
Guided=guidata; Auto=autonoma; Ask=domanda; Architect=architetto; Code=codice.
Commit, worktree, provider e token mantengono il significato tecnico. Le lettere
Y/N/A/D delle scorciatoie Aider non cambiano con la traduzione.

Nessun commit/push automatico. Le evidenze precedenti del modello restano
distinte dalle verifiche di questa modifica dell'interfaccia.
