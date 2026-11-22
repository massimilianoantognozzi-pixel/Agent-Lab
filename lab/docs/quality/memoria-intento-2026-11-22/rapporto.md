# Quando l’incidente è vero ma la richiesta riguarda altro

Il filtro sull’intento ha ridotto i suggerimenti fuori tema **da 9 a 2** tra 24 richieste negative. Tra 24 richieste pertinenti ha conservato **16 delle 17 correzioni** trovate dal metodo precedente. La prova richiedeva una riduzione dei falsi allarmi conservando ogni correzione utile. Il secondo criterio è fallito. **La raccomandazione è mantenere la configurazione quotidiana attuale.**

## Esiti sui 48 casi indipendenti

| Esito | Verifica del sintomo e del test | Stessa verifica con filtro sull’intento |
|---|---:|---:|
| Suggerimenti giusti su 24 richieste pertinenti | 17 | 16 |
| Suggerimenti sbagliati su 24 richieste pertinenti | 0 | 0 |
| Astensioni sulle 24 richieste pertinenti | 7 | 8 |
| Falsi allarmi su 24 richieste negative | 9 | 2 |
| Astensioni corrette su 24 richieste negative | 15 | 22 |
| Astensioni complessive su 48 richieste | 22 | 30 |

Ogni famiglia aveva tre richieste pertinenti con riscontro, una pertinente con dati incompleti e due richieste con un incidente collaterale. Le altre 12 richieste negative erano prive di incidente dimostrato. Nei sei casi con dati incompleti e nei 12 negativi senza incidente entrambi i metodi si sono astenuti. Sui 18 positivi sostenuti dalle osservazioni la copertura passa da 17 a 16. Tra i 12 incidenti collaterali il filtro elimina sette dei nove falsi allarmi del confronto.

| Famiglia | Correzioni recuperate sui 3 positivi con prova, prima → dopo | Falsi allarmi sui 2 incidenti collaterali, prima → dopo |
|---|---:|---:|
| Due esecutori per la stessa assegnazione | 3 → 3 | 2 → 0 |
| Ripresa del lavoro sbagliato | 3 → 2 | 1 → 1 |
| Punto di ripresa perduto alla chiusura | 3 → 3 | 1 → 0 |
| File estraneo incluso nel commit | 3 → 3 | 2 → 0 |
| Nuovo commit al secondo invio | 2 → 2 | 1 → 1 |
| Prova precedente applicata a un comportamento cambiato | 3 → 3 | 2 → 0 |

### Dove cambia il risultato

- **H12.** L’utente chiede di riprendere il lavoro di ieri dalla chat vuota e si ritrova su quello già consegnato. Le osservazioni confermano lo scambio. Il filtro semantico interpreta il testo come interesse a rivedere il lavoro precedente e sopprime la correzione pertinente.
- **H10 e H18.** Nel primo caso l’utente vuole rendere più visibile l’icona di ripubblicazione. Nel secondo vuole migliorare una frase della guida che descrive un pulsante. I riferimenti all’invio fallito e alla pratica sbagliata restano abbastanza simili alle lezioni da produrre i due suggerimenti fuori tema.
- **H44.** Nella richiesta sul secondo invio è già il recupero ibrido a escludere la lezione giusta dalle prime tre. Anche con la prova dell’incidente il filtro successivo si astiene.
- **H05, H06, H26, H29, H35, H37 e H38.** Sette richieste accessorie, tra cui ortografia, metadati, stampa, guida e traduzione, smettono di ricevere un suggerimento fuori tema.

Sul campione di sviluppo precedente, i tre errori conosciuti N07, N22 e N28 scompaiono, ma si perde anche il suggerimento giusto N30 sul nuovo invio di un commit. Le correzioni giuste passano da 12 a 11. Quel campione ha guidato la scelta delle categorie dell’esperimento e va tenuto separato dai 48 casi indipendenti.

## Riproducibilità e limiti

Due esecuzioni complete hanno prodotto risultati identici byte per byte, con 45 regressioni superate in ciascuna. Un controllo separato ha ricostruito la risposta del metodo precedente dalle prime tre candidate e dai riscontri attesi, verificato le otto variazioni di risposta e ricalcolato i conteggi per ogni gruppo.

Un secondo autore ha fissato i testi, le osservazioni e le etichette del nuovo campione. La regola, gli esempi di confronto e il programma sono stati fissati prima di aprire il campione. Il filtro riceve il testo e la candidata già sostenuta dalle prove. Le etichette entrano soltanto nel conteggio. Modello ONNX e pesi del precedente banco sono stati eseguiti localmente su CPU. Le sei lezioni appartengono a un singolo contesto sintetico. La disponibilità delle osservazioni nell’app e gli effetti sulle decisioni di un agente al lavoro restano da misurare.

Il banco usa il codice del precedente studio per il recupero e per la verifica di osservazioni e test. Il nuovo filtro può solo conservare o sopprimere un suggerimento già qualificato. La selezione di una clausola e il confronto con frasi di esempio sono sensibili alla formulazione italiana. I casi H12 e H18 illustrano questo limite. Correggere il risultato su questi esempi dopo averli visti richiederebbe un ulteriore campione indipendente per misurare l’effetto.

Il [protocollo](protocollo.md), le [impronte del metodo](metodo.json), i [48 casi](holdout.json) e i [risultati per richiesta](risultati.json) accompagnano la [verifica separata](verifica.py). Con dipendenze e pesi locali descritti nel [primo studio del 22 novembre](../memoria-it-2026-11-22/rapporto.md), dalla radice del repository eseguire

```powershell
python -B lab/docs/quality/memoria-intento-2026-11-22/prova.py --output lab/work/memoria-intento-2026-11-22/replica.json
python -B lab/docs/quality/memoria-intento-2026-11-22/verifica.py lab/work/memoria-intento-2026-11-22/replica.json
```

L’opzione `--sviluppo` del primo comando ricalcola separatamente il confronto sui 30 casi precedenti. L’impronta SHA-256 del campione indipendente è `14b93e215b427a8780ff0f6f2b7124ca4f2a554e2e5db51ab9ff8c8bec5568f5`. L’impronta del risultato principale è `c3fdd57941091e4b0bc0b52a6dfb4a7b333a0a5457e42f5a026a67ddbc458316`.

Con l'aggiornamento del runtime nativo da ONNX 1.21.0 a 1.31.1, due nuove esecuzioni complete hanno restituito lo stesso file, SHA-256 `dce0058eef12d071ae1258394cf4464d742d37e0f0814270722f276ae171756f`. In 12 casi cambia la terna ordinata delle candidate interne. I suggerimenti finali dei due metodi coincidono con i precedenti su tutti i 48 casi. Il verificatore riconosce entrambe le repliche misurate. Per ripetere l'esperimento fuori dall'app si può impostare `ORT_DISABLE_TELEMETRY=1` prima di avviare il processo.
