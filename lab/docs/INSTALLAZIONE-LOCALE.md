# Agent-Lab sul tuo PC

Agent-Lab è basato su AiderDesk 0.88.0. La consegna locale riguarda Windows x64.

## Per continuare il lavoro che hai già sul PC

Usa il tuo collegamento abituale o [Apri-Agent-Lab.cmd](../../Apri-Agent-Lab.cmd) nel checkout. I launcher del progetto conservano le impostazioni esplicite con cui sono stati preparati i tuoi ambienti.

## Per installare l'app come programma Windows

1. Dalla cartella di consegna apri [Agent-Lab-0.88.0-setup.exe con la funzione documenti](../artifacts/Agent-Lab-locale-documenti/Agent-Lab-0.88.0-setup.exe).
2. Avvia **Agent-Lab Desktop** dal menu Start. La configurazione iniziale è in italiano. Scegli il tuo provider e la cartella del progetto su cui vuoi lavorare.
3. In **Impostazioni → Informazioni** trovi la versione e il credito ad AiderDesk. Per rimuovere l'app usa la sua voce nelle **App installate** di Windows.

La firma digitale identifica l'editore di un file Windows. Questa copia per uso locale è priva di firma e Windows può indicare «Autore sconosciuto». L'impronta SHA-256 riportata nella consegna permette di confrontare il file con la copia collaudata.

Per la funzione immagini, seleziona un profilo OpenAI API in **Impostazioni → Generali → Generazione immagini**. La prima prova sul conto personale richiede la verifica dei crediti nel portale OpenAI. [Istruzioni e collaudo locale](quality/immagini-locali-2026-11-22.md)

## Dove trovi i dati

Per creare e verificare documenti, usa Docker Desktop in modalità container Linux. Il motore viene preparato alla prima richiesta. [Uso di Word, PDF ed Excel dalla chat](DOCUMENTI-LOCALI.md).

| Avvio diretto dell'app installata | Percorso o indirizzo predefinito |
|---|---|
| Impostazioni e database del desktop | `%APPDATA%\Agent-Lab` |
| Profilo agenti, comandi ed estensioni | `%USERPROFILE%\.agent-lab` |
| Stato di lavoro nel progetto aperto | `.agent-lab` dentro il progetto |
| Servizio locale | `http://127.0.0.1:24364` |

Il primo avvio prepara un profilo dedicato. Per ritrovare le conversazioni di un precedente ambiente avviale dal suo launcher. Un'applicazione esterna che deve comunicare con questa copia usa la porta indicata sopra. L'applicazione viene aggiornata con una nuova consegna locale.
