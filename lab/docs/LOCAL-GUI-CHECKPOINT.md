# Collegamento locale alla GUI

Autorizzato dall'utente: "ok procedi" dopo il test locale del 25 ottobre 2026.
Rischio 4; implementazione parent, review indipendente in sola lettura.

## Perimetro e accettazione

- Collegare il solo Devstral Small 2 Q4 verificato al profilo GUI del laboratorio.
- Backend, cache, HOME e lifecycle dedicati; cloud disattivato e porta loopback.
- Nessuna modifica a OpenCode, Serena originale o agli altri progetti.
- Nessuna chiave API, provider cloud o modello alternativo di fallback.
- Profilo in sola lettura: strumenti di scrittura, shell e rete restano bloccati.
- Mostrare solo strumenti consentiti, evitando schemi inutili nel prompt.
- Metadati coerenti: 32768 contesto, massimo 4096 output; soglia Smart 18000.
- Conteggio sul template effettivo con tokenizer ufficiale scaricato come soli
  dati alla revisione 55c5b41e98c2dbd21b0c8afffc540dcfc9eb5128. Nessun embedding.
- Rifiutare richieste oltre 24576 token di input prima della generazione;
  riservare 4096 output e 4096 margine, con truncate=false e shift=false.
- Contare anche l'uso precedente e i messaggi successivi nella compattazione.
- Verificare inferenza reale dalla GUI, lettura del campione, rifiuti pertinenti,
  annullamento, chiusura e riapertura dal collegamento desktop.

## File e verifica

Parent puo modificare solo moduli lab-mode/lab-local-model, ModelManager,
wrapper strumenti e compattazione Agent, script lab, test e documenti lab.
Nessuna modifica ai componenti renderer, alle dipendenze o al bundler prevista.
Classe MODULE/backend con selector GUI riusato; grafo renderer preservato.
Misura tutti i file generati prima/dopo senza equipararla al solo caricamento
iniziale. Nessun nuovo budget o modifica a chunk per ottenere PASS.

Pre-gate: test mirati, sintassi script, typecheck tramite build. Poi lint dei
file toccati, suite pertinente e smoke Electron locale. Riutilizzare risultati
precedenti solo sulle superfici immutate. Fallimenti upstream Windows noti
restano distinti, senza esclusioni nuove per ottenere verde.
