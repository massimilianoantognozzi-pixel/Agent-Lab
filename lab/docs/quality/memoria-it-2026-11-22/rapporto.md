# Quando richiamare una correzione già verificata

Prova locale del 22 novembre 2026 sul candidato Agent-Lab `430b6eb0`. Su 18 richieste pertinenti la ricerca ibrida con controllo del sintomo e del test collegato propone 12 lezioni corrette. La ricerca attuale si ferma a 9. Su 12 richieste per cui sarebbe opportuno astenersi, i suggerimenti fuori tema scendono da 10 a 3.

| Metodo | Corrette su 18 | Errate su 18 | Astensioni su 18 | Falsi allarmi su 12 | Scarti corretti su 12 |
|---|---:|---:|---:|---:|---:|
| Ricerca attuale, prima lezione | 9 | 7 | 2 | 10 | 2 |
| Ibrida, prima lezione | 10 | 8 | 0 | 12 | 0 |
| Ibrida con soglia del 19 novembre | 0 | 0 | 18 | 0 | 12 |
| Ricerca attuale, prime tre con verifica | 9 | 0 | 9 | 3 | 9 |
| Ibrida, prime tre con verifica | 12 | 0 | 6 | 3 | 9 |

Il recupero ibrido aggiunge tre suggerimenti giusti alla ricerca lessicale sottoposta allo stesso controllo. Riguardano un incarico eseguito due volte (N11), un file estraneo entrato nel commit (N15) e un checkpoint perso alla chiusura (N23). Nei sei casi pertinenti con osservazioni incomplete il metodo si astiene (N05, N09, N17, N21, N26, N29).

## I tre errori che contano per l’utente

| Richiesta | Che cosa ha rilevato il banco | Perché il suggerimento era fuori tema |
|---|---|---|
| N07. Cambiare il colore delle icone dei processi | Due esecutori lavorano sul medesimo incarico | L’utente chiede una modifica grafica. |
| N22. Tradurre la descrizione del commit | Nel commit è entrato un file estraneo | L’utente chiede una traduzione. |
| N28. Trovare la data di un controllo manuale | La prova appartiene a un comportamento precedente | La data resta consultabile anche per una prova storica. |

I dati distinguono il fatto osservabile dall’obiettivo della persona. Il banco individua tutti i 15 sintomi documentati, inclusi i tre collaterali. Un possibile passo successivo è verificare su richieste nuove se la lezione aiuta a compiere l’azione chiesta, usando queste tre categorie di errore come riferimento. La proposta per il desktop rimane in discussione.

## Copertura e replica

Un tester separato ha preparato 30 scenari in italiano, con 24 testi distinti e sei coppie a testo identico. Le sei schede precedenti, i pesi verificati del modello locale e il recupero del 19 novembre sono gli stessi. La verifica osserva fino a tre candidate e richiede una sola corrispondenza supportata sia dall’osservazione del caso sia dal test pertinente superato. Le etichette attese entrano soltanto nel conteggio. A entrambe le esecuzioni sono passati 45 test, inclusi i sei riferimenti delle schede. Togliendo i riscontri o le prove, il banco si astiene.

I dati sugli incidenti sono sintetici. Per esempio, la scheda A presuppone che l’identificativo rappresenti una singola assegnazione. In Agent-Lab una task padre può avere più worker legittimi. Prima di un pilota desktop va verificato come raccogliere l’identità della singola assegnazione. Il test nativo della scheda C esercita l’instradamento della chiusura con dipendenze simulate. Lo studio riguarda il suggerimento della lezione e non misura l’esito di una correzione sul campo.

Il [protocollo](protocollo.md), i [casi](casi.json), i [risultati per richiesta](risultati.json) e il [programma di replica](prova.py) accompagnano il rapporto. I pesi si preparano con le istruzioni dell’[archivio del 19 novembre](../memoria-it-2026-11-19/Dati-e-replica-memoria-IT.zip). Dalla radice del repository, con le dipendenze installate e i pesi locali disponibili, eseguire

```powershell
python lab/docs/quality/memoria-it-2026-11-22/prova.py --output lab/work/replica-memoria.json
```

L’opzione `--model` accetta un’altra cartella con i cinque file del manifest. Il dataset fissato prima della misura ha SHA-256 `a7c4a5c62a270151474c952e61a3aee1dee7a74d3956060acdfcac82045131be`. I risultati delle due esecuzioni indipendenti coincidono byte per byte, SHA-256 `b6a9fd5e59da6b3b1db7dfa8a29441c7e465729e3fce5cf689494f1909fbfb59`.
