# Gate dell'agente freelance

- Sorgenti TS: lint, typecheck tramite build, test unitari mirati e suite Node.
- UI invariata: riuso dei test renderer precedenti, smoke reale Electron.
- Modello: contesto dichiarato 32768, input <=24576 e output <=4096;
  conteggio locale sul template, cloud spento; cancellazione reale.
- Progetti: sintassi/build/test in job dedicati; template e controlli congelati;
  errori JS, risorse, viewport e accessibilita nel browser temporaneo.
- File: denial e prove di backup/ripristino incluse collisioni e modifiche
  sopraggiunte; codice dei controlli non scrivibile dal modello.
- KB: generator locale, verifica prova/hash/scope prima dell'ammissione;
  interpretazioni conservate come tali, nessuna auto-certificazione.
- Segreti/dipendenze: gitleaks e audit disponibili; copertura dichiarata.
- Chiusura: nessun job/processo temporaneo residuo; app finale lasciata aperta;
  report, istruzioni e stato riprendibile. Nessun push automatico.
