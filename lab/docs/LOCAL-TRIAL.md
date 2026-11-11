# Prova locale Devstral

Il 25 ottobre 2026 l'utente ha riaperto esplicitamente la prova di un modello
locale, chiarendo il precedente errore Devstral/Ollama/OpenCode. Questa prova
e l'eccezione autorizzata al vincolo cloud del checkpoint iniziale; gli altri
progetti e le configurazioni originali restano esclusi da ogni modifica.

## Perimetro della prova

- Runtime Ollama esistente, firma Windows valida Ollama Inc.; nessun installer.
- Nuovo processo del laboratorio, porta 127.0.0.1:11435 e cartelle dedicate.
- Cloud disattivato con OLLAMA_NO_CLOUD=1; nessuna chiave/account/provider remoto.
- Solo download del modello pubblico della libreria Ollama Devstral Small 2
  24B Q4_K_M, circa 15 GB. Verifica digest gestita dal runtime Ollama.
- Inferenze dirette sul solo codice sintetico; nessuna modifica OpenCode.
- Contesto e output limitati per singola richiesta, senza tetti commerciali
  giornalieri. Una risposta troncata e un fallimento della prova, non un PASS.
- File generati dal modello solo nell'area di prova; revisione prima di eseguirli.
- Misurare avvio/risposta, token, completamento, tool calling e risultato dei test.

La prova non certifica l'integrazione completa nell'agente desktop. Il profilo
GUI iniziale resta senza inferenza. Collegarlo al locale e un passaggio successivo
al riscontro pratico di velocita, qualita e contesto.

## Diagnosi precedente verificata

Modello devstral-small-2:24b, provider ollama, errore output-limit. Le tre
risposte finali raggiungono tutte input+cache+output=32768 token, con soli
85/47/14 token di output. Non e una quota gratuita esaurita. Il budget effettivo
di contesto era saturo; la configurazione originale va distinta dal nuovo test.

Fonti: https://docs.ollama.com/faq e
https://ollama.com/library/devstral-small-2/tags;
https://huggingface.co/mistralai/Devstral-Small-2-24B-Instruct-2512.
