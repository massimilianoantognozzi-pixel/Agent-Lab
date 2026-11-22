# Collaudo locale dei documenti · 22 novembre 2026

Il banco apre la chat Agent nel desktop Windows x64 con un profilo e un progetto temporanei. Un provider di coding sintetico richiede la generazione tramite lo strumento esposto alla chat. Docker, LibreOffice, i file Office e le verifiche sono reali. La prova usa il modello di progetto «Officina Demo» e dati sintetici.

| Controllo | Esito osservato |
|---|---|
| Word modificabile e PDF da inviare | Il DOCX si riapre. Writer lo riesporta in due pagine. La verifica indipendente confronta il testo delle due pagine con il PDF consegnato, incluse le descrizioni multilinea. |
| Coerenza degli importi | I tre formati riportano imponibile 1.523,90 €, IVA 335,26 € e totale 1.859,16 €. La tabella stampata deriva dal foglio ricalcolato. |
| Excel modificabile | Il file conserva 15 formule. Portando la prima quantità da 2 a 5 su una copia, il nuovo totale calcolato è 2.528,02 €. |
| Nuova versione | Ripetendo la richiesta sulla stessa cartella, lo strumento indica che esiste già. Le impronte dei file originali coincidono. |
| Riapertura della scheda | La chat mostra due anteprime delle pagine e una del foglio. Le tre immagini hanno la stessa impronta anche dopo la chiusura e il riavvio del desktop. Il modello non esegue una nuova generazione. |
| Prove dei motori | 12 test Word/PDF/Excel nel container locale senza rete, compresi PDF diretto, DOCX senza PDF consegnato, logo, ricalcolo e rifiuto di dati incoerenti. Il test dell’anteprima Excel verifica i separatori italiani e confronta le impronte del foglio prima e dopo l’esportazione. |

La build desktop e i controlli TypeScript sono passati. Vitest ha eseguito con successo 2.170 test Node e 527 test del renderer. La suite Node ha mantenuto sei casi esclusi. Per il collaudo completo durante il confezionamento sono stati usati tre worker e un timeout di 15 secondi per test.

Il collaudo ha superato gli stessi controlli dal checkout e dal programma Windows confezionato. Il confronto dei file estratti dal setup ha confermato le impronte di eseguibile, archivio applicativo e quattro risorse Office. [Installer locale](../../artifacts/Agent-Lab-locale-documenti/Agent-Lab-0.88.0-setup.exe) · [Preventivo PDF](../../artifacts/Agent-Lab-locale-documenti/Esempio-preventivo/document.pdf) · [Word](../../artifacts/Agent-Lab-locale-documenti/Esempio-preventivo/document.docx) · [Excel](../../artifacts/Agent-Lab-locale-documenti/Esempio-preventivo/workbook.xlsx).

Per ripetere la prova dalla radice del checkout, compilare il desktop e avviare `node lab/scripts/verify-document-generation.mjs`. Per il programma Windows confezionato, passare `--exe` seguito dal percorso di `Agent-Lab.exe`. I risultati e le anteprime si trovano in `lab/work/documenti-e2e/`. L’ispezione visiva riguarda il preventivo campione. Il motore desktop Microsoft Office e una chiamata al servizio GLM personale restano fuori dalla copertura di questa prova.
