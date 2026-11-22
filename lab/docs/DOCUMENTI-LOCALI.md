# Creare documenti dalla chat

Nella chat **Agent** del progetto puoi chiedere «Prepara il preventivo in Word modificabile, PDF da inviare ed Excel con quantità e prezzi. Usa il modello del progetto». Funziona con il provider di coding selezionato, compreso un profilo GLM con supporto agli strumenti. Agent-Lab esegue la generazione e i controlli sul PC tramite Docker in modalità container Linux. La prima preparazione scarica il motore Office. I container che elaborano i documenti lavorano senza rete. Le istruzioni e i dati che scrivi in chat seguono la configurazione del tuo provider.

Puoi chiedere anche un solo formato. Word permette di modificare testo e tabelle. Quando richiedi Word e PDF insieme, LibreOffice Writer produce il PDF dal Word appena creato. Per un PDF autonomo il motore usa ReportLab. Per una tabella condivisa con Excel, il modello indica il foglio sorgente e Agent-Lab riporta i valori ricalcolati nella versione stampata.

## Modello del progetto

Una volta concordato l’aspetto, puoi chiedere a GLM di conservarlo in `document-templates/default.json` nel progetto. Agent-Lab lo cerca a ogni consegna. Per usare più varianti, per esempio un preventivo e una relazione, salva un JSON per ciascun nome e indica il nome nella richiesta. Un modello esplicitamente richiesto deve esistere. In assenza di un modello predefinito Agent-Lab usa il proprio stile standard.

```json
{
  "name": "Officina Demo",
  "accent": "#28536B",
  "organization": "Officina Demo",
  "footer": "Documento di esempio",
  "logo": "logo.png"
}
```

Il logo è facoltativo e il percorso è relativo a `document-templates`. Nome e colore sono obbligatori. Questi modelli descrivono uno stile riutilizzabile. L’importazione di modelli Office preesistenti in formato DOTX o XLTX richiede un’integrazione distinta.

## Cosa trovi nella consegna

- I file richiesti in una nuova cartella del progetto. Le anteprime in chat si possono ingrandire. Tutte le immagini di verifica restano nella cartella.
- Una fonte modificabile, `source.json`. Per una correzione puoi dire «Riparti dalla consegna precedente, cambia la quantità e rigenera nella versione successiva».
- Una ricevuta, `receipt.json`, con il modello usato, i controlli superati, le impronte dei file e l’identità del motore locale.

Per i documenti impaginati il motore rilegge il contenuto e renderizza ogni pagina. Per Excel confronta i risultati calcolati con i valori attesi. Per i fogli con formule modifica un dato su una copia e verifica che cambino i risultati previsti. Un errore di conversione, di impaginazione o di calcolo torna alla chat per la correzione. La nuova consegna viene pubblicata dopo le verifiche.

Le formule supportate sono numeriche e interne al foglio. Il motore di verifica è LibreOffice. La prova di compatibilità con una specifica versione desktop di Microsoft Word o Excel richiede l’apertura con quella versione.
