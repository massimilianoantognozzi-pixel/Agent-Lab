# Correzioni dopo la revisione GLM del 22 novembre

La revisione ha riguardato il commit `3a768d53`. Le correzioni intervengono sui comportamenti confermati con file, processi o container di prova. [Rapporto originale e ricevute GLM](../../artifacts/audit-glm-3a768d53/Rapporto.md)

| Area | Comportamento del desktop |
|---|---|
| Richieste immagini | Il registro SQLite privato della task conserva insieme richiesta e ricevuta. Un’interruzione prima del commit della transazione di invio permette una nuova conferma sullo stesso nome. Da quel commit una ripetizione legge la ricevuta: anche nel breve intervallo prima del traffico HTTP, il riavvio tratta l’invio come possibile. |
| Lettura di finestre | Il limite complessivo del testo è 24.000 unità UTF-16, incluso l’avviso di troncamento. L’avviso indica come richiedere un’osservazione mirata. Gli screenshot rimangono disponibili. |
| Cache del driver | I turni condividono la preparazione del driver. Un lock SQLite coordina anche i processi desktop indipendenti che usano la stessa cache locale. Dopo aver acquisito il lock, il processo verifica i file prima di avviare il download. Ogni turno mantiene il suo client e il proprio segnale Stop. |
| Workflow Docker | Il percorso della sorgente viene codificato come campo CSV dell’opzione `--mount`. I percorsi con virgola funzionano con gli stessi vincoli di sola lettura e isolamento di rete. |

Le vecchie ricevute in JSON restano leggibili. Una prenotazione creata da una versione precedente può appartenere a un altro processo o profilo. In assenza di una prova sulla sua origine, il desktop la conserva e indica all’utente di controllare la task di origine e il consumo del provider.

## Recupero di un PNG già pubblicato

Prima di pubblicare il file, Agent-Lab registra l’identità del temporaneo, l’impronta SHA-256 del PNG e i dati di consumo ricevuti. Se il processo termina subito dopo la pubblicazione, leggere la ricevuta o usare quel PNG come riferimento nella task originale verifica il contenuto e rimuove il collegamento temporaneo riconosciuto. Il file torna utilizzabile e la ricevuta conserva i conteggi del provider. Se la pubblicazione resta incerta, la ricevuta segnala lo stato e conserva i dati effettivamente disponibili.

Il banco ha terminato processi indipendenti prima e dopo la transazione di invio, durante la richiesta HTTP e dopo la pubblicazione. Ha verificato anche quattro letture concorrenti, il rifiuto di file sostituiti e un edit che usa direttamente il PNG appena recuperato. Con il servizio immagini simulato, ogni generazione autorizzata ha prodotto una sola richiesta. [Prove di interruzione e concorrenza](../../work/riparazioni-audit-glm/qa/ESITO.md)

## Verifiche sul candidato locale

La build Electron con typecheck è passata. Le suite hanno registrato 2.117 test Node e 526 test renderer superati. La suite Node ha escluso quattro test. Il lint ha restituito zero errori e l’avviso preesistente in `SidebarGroupTree.tsx`. Sono passati il test Docker reale e il collaudo immagini dalla chat e dal Designer dopo il riavvio del desktop. I due launcher condividono 611 file di build identici. [Ripetizione del banco sul candidato di consegna](../../work/riparazioni-audit-glm/qa/trial-publication-consegna-APfLQM/evidence.json) · [Ricevuta Electron](../../work/immagini-e2e/turno-DH2yYl/receipt.json)

Il [setup aggiornato per Windows x64](../../artifacts/Agent-Lab-locale-audit-GLM/Agent-Lab-0.88.0-setup.exe) ha SHA-256 `295422f18f1cbf1f096239f600dfd4f3d2c6c8cf4817e600f5359f3b4db9b3cb`. Il controllo ha confrontato il contenuto estratto dall’installer con la build locale. Dalla chat dell’app confezionata, il driver reale ha completato un modulo nel browser di prova su Windows. Lo stesso setup ha superato due cicli di installazione e disinstallazione in Wine isolato. [Contenuto del setup](../../work/riparazioni-audit-glm/installer-immagini.json) · [Computer Use nel pacchetto](../../work/computer-use-desktop/desktop-HaAnRF/receipt.json) · [Installazione e rimozione](../../work/installer-locale-20261122/isolated-install/install-b95f14ee7a/summary.json)
