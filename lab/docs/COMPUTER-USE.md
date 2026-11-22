# Computer Use per Agent-Lab

L'obiettivo concordato il 22 novembre 2026 è operare sulle applicazioni e sul browser del PC dalla chat. L'agente sceglie la finestra, osserva controlli e immagini, esegue un gesto e controlla l'effetto sulla finestra. Il primo ambiente è il desktop Windows x64 di Agent-Lab.

## Integrazione

Nella chat desktop in modalità Agent descrivi il lavoro e l'applicazione. Per esempio, «Nella finestra del mio modulo inserisci Prova nel campo Messaggio, premi Salva e verifica il valore registrato». Nella finestra di scelta controlla il titolo, l'app e il modello che riceverà il contenuto. Puoi consentire il lavoro in background oppure anche il primo piano per quella finestra. Se l'applicazione è chiusa, puoi scegliere l'eseguibile dal selettore Windows.

Per navigare senza usare il tuo profilo abituale, chiedi «Apri il browser temporaneo, vai alla pagina di prova e verifica il modulo». Questo browser ha schede, navigazione e comandi per i controlli della pagina. Stop chiude il processo aperto dal driver. La condivisione di una finestra personale già aperta termina la sessione e lascia all'utente la propria applicazione.

Usare Cua Driver 0.52.0, la versione inclusa nel lock di Hermes esaminato. Il processo Electron principale apre MCP sullo standard input/output per il turno corrente. Il driver opera in una finestra condivisa dall'utente. La scelta e l'eventuale richiesta di primo piano avvengono nel desktop. Lo stop della chat o la fine del turno chiudono il collegamento. Le azioni successive usano una nuova osservazione della finestra.

Il testo accessibile permette anche l'uso di un modello testuale. Quando serve osservare i pixel, il modello deve accettare immagini. I contenuti condivisi entrano nella conversazione con il provider scelto. In una finestra browser si possono usare schede, barra degli indirizzi e controlli della pagina. I risultati vanno verificati nell'applicazione, comprese le schermate disegnate senza controlli standard.

La base tecnica viene dal driver MIT usato da Hermes. Agent-Lab mantiene il proprio ciclo dell'agente e i propri provider. Il pacchetto Windows viene verificato prima dell'uso. [Lock Hermes](https://github.com/NousResearch/hermes-agent/blob/fc4e14ac18bf1ecb8f7025487edb6a8b0ecd18a3/pm/lock.json) · [Licenze Cua](https://github.com/trycua/cua/blob/cua-driver-rs-v0.52.0/legal/LICENSING.md) · [Licenza Hermes](https://github.com/NousResearch/hermes-agent/blob/fc4e14ac18bf1ecb8f7025487edb6a8b0ecd18a3/LICENSE).

Il primo utilizzo scarica circa 32 MB da GitHub e conserva la versione verificata nella cartella binaria del profilo. La telemetria del driver è disattivata. La chat conserva i contenuti condivisi e le estensioni abilitate possono leggere la conversazione. Le finestre elevate, i canvas e le applicazioni che richiedono il primo piano dipendono dal supporto effettivo del sistema operativo e dell'app.

## Criteri di collaudo

1. Individuare una finestra Windows, leggere i controlli e scrivere un valore verificato dall'applicazione.
2. Usare una finestra browser con un profilo di prova e verificare il cambiamento della pagina.
3. Dopo un rifiuto, una revoca o la chiusura del turno, verificare che non vengano inviati ulteriori comandi.
4. Controllare immagini, coordinate, gesto da tastiera e aggiornamento dello stato. Distinguere la consegna di un evento dalla modifica realmente osservata.

Le prove reali Windows usano un modulo WinForms, Edge con un profilo di prova e un Chromium temporaneo. Nel modulo e in Edge l'asserzione legge il valore effettivamente salvato. Nel browser privato un server su loopback riceve il valore del modulo e il test controlla che il PID del browser termini su Stop. Nei test automatici l'assenso del dialogo è simulato soltanto per le finestre di prova. [Test Windows](../../src/main/agent/tools/__tests__/computer-use-live.test.ts) · [Test di accesso e revoca](../../src/main/agent/tools/__tests__/computer-use.test.ts).

Il collaudo dalla chat parte da `window.api.runPrompt` nel renderer Electron. Un modello simulato su loopback usa gli strumenti registrati dall'app, legge i riferimenti della pagina, scrive e invia il modulo e osserva la conferma. L'asserzione verifica anche che il valore inserito non sia duplicato nel log di debug. Dopo `npm run build` il comando Windows è `node lab/scripts/verify-computer-use-turn.mjs`. [Prova dal desktop](../scripts/verify-computer-use-turn.mjs).
