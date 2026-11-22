# Seconda prova isolata sulla memoria in italiano

## Domanda e criterio

Vogliamo verificare se riconoscere lo scopo di una richiesta riduce i suggerimenti fuori tema senza perdere le correzioni utili. Il confronto principale usa gli stessi casi, gli stessi test superati, lo stesso recupero ibrido e gli stessi riscontri del primo studio del 22 novembre. Misuriamo una sola variazione dopo la selezione di una lezione già verificata.

Per considerare raggiunto l’obiettivo sul nuovo campione servono meno falsi allarmi rispetto al metodo precedente e tutte le sue risposte corrette conservate sugli stessi casi. Un caso positivo senza prova deve continuare a dare astensione. Riporteremo anche i cambiamenti di risposta per ID, i falsi allarmi residui, le astensioni complessive e la copertura dei positivi dimostrabili. L’esito vale per questo campione sintetico.

## Regola fissata

Il metodo di confronto suggerisce una lezione se tra le prime tre ibride ce n’è una sola sostenuta sia dai dati osservati sia dal test pertinente. Il nuovo filtro riceve la lettera candidata e il testo della richiesta. Può confermare la candidata oppure astenersi. Se il confronto si è già astenuto, anche il nuovo metodo si astiene.

1. Per i testi in più frasi, individuare l’ultima clausola che esprime esplicitamente una domanda o un’azione richiesta. Se manca, usare l’intero testo. La separazione considera punteggiatura e gli avversativi «ma», «però», «invece». La funzione esatta è in `intento.mjs`.
2. Astenersi quando la clausola chiede esplicitamente un altro risultato, come traduzione, impaginazione, metadati, esportazione, documentazione o misure di prestazione. I segnali e le combinazioni esatte sono fissati nel codice.
3. Usare lo stesso encoder multilingue locale del banco precedente per confrontare la clausola prescelta con esempi scritti prima del nuovo campione. Per ciascuna candidata si prendono il massimo coseno rispetto agli esempi di indagine o correzione di quel sintomo e il massimo coseno rispetto agli scopi collaterali condivisi o specifici della candidata. Astenersi anche se il secondo supera il primo di **almeno 0,10**. La differenza è una scelta prudenziale per questo esperimento, senza stima di calibrazione statistica. In tutti gli altri casi conservare la risposta precedente. Si tratta di un filtro di esclusione di intenti alternativi, con conferma per difetto nei casi incerti.

Le tre famiglie di errori del banco precedente sono note agli autori della regola. Questi esempi costituiscono materiale di sviluppo. Un tester distinto prepara il nuovo campione con sei famiglie di incidenti, casi insufficientemente osservati e incidenti collaterali. Prima dell’esecuzione verranno fissati separatamente SHA-256 del codice, del presente protocollo e del nuovo file di dati. Nessun ritocco dopo aver visto il suo esito. Le etichette sono riservate alla valutazione. Il motore di recupero riceve ID e testi, il primo verificatore riceve le osservazioni, il filtro di intento riceve soltanto ID, testo e candidata già verificata.

Le osservazioni sono sintetiche. Ciascuna lezione riguarda un solo checkout e un’operazione. La prova non raccoglie telemetria dal desktop. La prova del 22 novembre precedente documenta i significati delle osservazioni e le limitazioni delle sei regressioni. La verifica ripete il recupero e la selezione due volte e confronta i risultati per caso. Il rendiconto separato riconta i risultati dai dati grezzi e controlla che il nuovo filtro non possa introdurre una nuova lezione.
