# Richiamo delle lezioni con un riscontro sul caso corrente

Protocollo del 22 novembre 2026, fissato prima di esaminare i nuovi casi. La domanda è se l’agente possa proporre una correzione pertinente quando una richiesta italiana richiama un problema già verificato. Il banco usa le sei schede, lo stesso modello locale, la taratura e il recupero del 19 novembre. Un tester distinto prepara richieste nuove, osservazioni sintetiche e risposte attese. Il recupero riceve solo il testo. Il controllo successivo riceve la classifica, le osservazioni e lo stato dei test. Le etichette servono solo al conteggio.

## Metodi fissati

Confrontare il primo risultato della ricerca attuale, il primo dell’ibrida (75% semantica, 25% lessico), l’ibrida con la soglia precedente, i primi tre della ricerca attuale con verifica e i primi tre dell’ibrida con la stessa verifica. Nel gruppo di tre, proporre una lezione soltanto quando esiste esattamente una candidata con il suo test di riferimento superato sul checkout in prova e con un riscontro sul caso corrente. In assenza di dati sufficienti a verificare il sintomo, astenersi. Un fatto collaterale può essere vero e irrilevante per la domanda. Includere questo caso nella misura dei falsi allarmi.

| Lezione | Riscontro nel contesto dell’operazione osservata |
|---|---|
| A. Worker duplicato | Due identità attive distinte per lo stesso incarico richiesto. |
| B. Ripresa errata | L’identità dell’incarico da riprendere differisce da quella selezionata. |
| C. Checkpoint perso | Il punto persistito prima della chiusura è stato cancellato o sostituito dalla chiusura. Un campo assente indica informazione sconosciuta. |
| D. Staging estraneo | Il commit ha incluso un file già preparato dall’utente e assente dall’elenco dei file della sessione. |
| E. Retry del push | Dopo un primo invio rifiutato, il nuovo tentativo dello stesso invio usa un commit diverso. |
| F. Prova obsoleta | Il comportamento coperto dalla prova ha cambiato impronta e il pannello mostra ancora la verifica come superata. |

## Lettura del risultato

Contare suggerimenti giusti, sbagliati e mancanti sui positivi, e falsi allarmi e astensioni corrette sui negativi. Distinguere l’intento complessivo dai casi in cui le osservazioni fornite sono sufficienti a dimostrarlo. Confrontare anche ricerca lessicale e ibrida sottoposte allo stesso controllo. Indicare i singoli errori. Controllare l’astensione togliendo le osservazioni e togliendo le prove di riferimento. Ripetere il banco e confrontare gli esiti per caso. Un aumento delle risposte giuste insieme a una diminuzione dei falsi allarmi entrambi rispetto alla ricerca attuale sosterrebbe un ulteriore pilota. L’attivazione quotidiana richiede una decisione separata.

Il banco usa osservazioni compilate su scenari sintetici e test di regressione esistenti. Misura la selezione fra sei lezioni. L’acquisizione automatica degli eventi, la copertura su incidenti reali e l’esecuzione di una correzione restano da misurare.
