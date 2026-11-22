# Immagini nella chat e nel Designer

Il desktop può chiedere a OpenAI la creazione di un PNG o la modifica di un asset a partire da riferimenti PNG, JPEG e WebP nel progetto aperto. Il lavoro prosegue in background. La chat riceve il percorso relativo del file e un’anteprima cliccabile. Il Designer operativo può usare gli stessi strumenti. La revisione formale e la modalità Piano restano percorsi di sola analisi.

## Impostazioni e costi

In **Impostazioni → Generali → Generazione immagini**, scegliere un profilo OpenAI API già configurato. Il preset iniziale usa Sunburst, qualità bassa e formato 1024 × 1024. Si può scegliere anche Flare, cambiare qualità e impostare un formato orizzontale o verticale. Queste scelte riguardano il motore grafico. La funzione si attiva con la scelta esplicita del profilo.

Prima dell’invio, la finestra di conferma elenca il prompt, i file di riferimento, la destinazione, il profilo e la stima per l’output. L’input può aumentare il costo. La ricevuta registra i token restituiti e, quando il dettaglio è sufficiente, il costo calcolato alle tariffe standard. La verifica del saldo e delle condizioni di addebito avviene nel portale dell’organizzazione OpenAI. [Guida alle immagini](https://developers.openai.com/api/docs/guides/image-generation#calculating-costs) · [Crediti inclusi e loro esaurimento](https://developers.openai.com/api/docs/guides/chatgpt-api-credits#when-your-free-credits-run-out)

## Prova locale

Il [banco Electron](../../scripts/verify-image-generation.mjs) usa un profilo temporaneo e risposte immagini sintetiche. Avvia dalla chat un fondale diurno e delega al Designer la variante serale, usando il primo PNG come riferimento. La scena di prova carica entrambi gli asset a 1536 × 1024 e verifica la risposta al movimento da tastiera. Il banco confronta gli hash dei file e il numero di richieste dopo la rilettura delle ricevute e dopo un annullamento.

I test del [provider](../../../src/main/agent/tools/__tests__/image-provider.test.ts) e del [ciclo completo del lavoro](../../../src/main/agent/tools/__tests__/project-images.test.ts) verificano anche il rifiuto dei collegamenti nel filesystem, la prenotazione di una destinazione condivisa e la conservazione del consumo comunicato dal provider quando il PNG ricevuto è inutilizzabile. Dopo il riavvio la ricevuta consente di verificare se il file coincide ancora con quello salvato.

Il collaudo del 22 novembre è passato su Windows x64. A desktop riavviato, la chat ha mostrato entrambe le miniature con il nome dei rispettivi PNG. Il clic ha aperto la vista ingrandita. La scena ha caricato il fondale diurno e la variante serale alla risoluzione prevista e ha risposto alla tastiera. Il banco ha contato due richieste simulate e zero chiamate all’API reale. Sono passati la build Electron con typecheck, 2.101 test Node e 526 renderer. Cinque test Node sono risultati esclusi. [Ricevuta della prova](../../work/immagini-e2e/turno-7fag83/receipt.json) · [Scena serale](../../work/immagini-e2e/turno-7fag83/scena-finale.png)

**Collaudo sul conto personale da eseguire al rientro.** Verificare attivazione, disponibilità e condizioni dei crediti dell’organizzazione. Collegare il profilo API, generare un singolo fondale, richiederne una modifica e confrontare il consumo del portale con le ricevute. Il collaudo locale usa dati sintetici e non misura la qualità artistica di Sunburst.

Anche il secondo launcher ha completato lo stesso ciclo dopo la sincronizzazione dei 611 file della build. [Ricevuta di Apri-Agent-Lab-Completo](../../work/immagini-e2e/turno-EqW96B/receipt.json)

## Installer per uso locale

Il [setup Windows con immagini](../../artifacts/Agent-Lab-locale-immagini/Agent-Lab-0.88.0-setup.exe) pesa 353.218.211 byte. SHA-256 `bfde522846d9bf269767c1a04295fa20a8f93f8e311d46064935aa7cada931ec`. Dall’installer sono stati estratti l’eseguibile, le licenze e l’ASAR. I loro hash coincidono con quelli del pacchetto collaudato. Gli entry point main, preload e renderer nell’ASAR corrispondono alla build dei launcher. L’app inclusa è partita su Windows con un profilo temporaneo e la porta di AiderDesk già occupata. In Wine 10, in un contenitore senza rete, lo stesso setup ha completato due cicli di installazione e disinstallazione, preservando i marcatori dell’installazione AiderDesk. [Impronta e contenuto](../../work/verifica-integrata-20261122/installer-immagini.json) · [Ricevuta dei cicli di installazione](../../work/installer-locale-20261122/isolated-install/install-d4d430a669/summary.json)
