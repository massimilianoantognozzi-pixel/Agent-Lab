# Agente personale per piccoli lavori freelance

SUPERATO COME PERIMETRO PRODOTTO: l'utente ha ribadito che i piccoli lavori
erano soltanto esempi. Fonte attiva: AIDERDESK-GENERAL-BLUEPRINT.md. Questo
documento descrive il banco web gia costruito e verificato.

## Mandato approvato

25 ottobre 2026: l'utente vuole un agente completo per siti, landing page e
piccoli progetti utili al lavoro freelance. Preferisce completezza e qualita;
ha delegato le scelte tecniche e richiesto di arrivare alla chiusura. Modello
locale autorizzato, nessuna quota commerciale dell'agente o costo API.

Non e una modifica al prodotto Code Studio o PatchFox: quei progetti restano
in sola lettura. Il nuovo agente riusa AiderDesk e i controlli pertinenti.

## Flusso necessario per la consegna

1. Progetto selezionato dall'utente nel workspace del laboratorio; lettura e
   creazione/modifica dei file, scaffold HTML/CSS/JS, React/Vite e Astro.
2. Scritture atomiche con storico prima/dopo, diff e recupero; nessuna modifica
   a blueprint, regole, segreti o controlli congelati attraverso il modello.
3. Comandi di check/test/build nel solo progetto, con output ed esito reali.
   Il codice Node del progetto gira in container dedicati su copie preparate,
   senza montare home, credenziali, altri progetti o socket Docker.
4. Anteprima locale, verifica desktop/mobile, errori JS e risorse mancanti,
   accessibilita automatica e controlli di accettazione quando previsti.
5. Correzioni guidate dai controlli, archivio di consegna pulito e istruzioni.
6. Knowledge Base creata dal modello dopo controlli riusciti, con prove/hash,
   ambito e versioni. Fatti osservati separati dalle interpretazioni del modello;
   nessuna voce modifica regole o blueprint, nessuna promozione basata soltanto
   su auto-valutazione del modello. Ricerca selettiva senza nuovi embedding.

L'obiettivo e un ciclo completo, non una sola chat o un progetto dimostrativo
fisso. La prima prova completa usa una landing sintetica e una modifica successiva.

## Confini e strumenti

- Solo cartelle sotto lab/workspaces. Dati di controllo, backup e KB fuori dalle
  cartelle montate nei job, sotto lab/profile/coding-control.
- File e comandi generati dal modello sono dati non fidati. Shell host non
  concessa al modello. Operazioni disponibili tramite strumenti tipizzati.
- Esecuzioni Docker con nome/label unici, limiti di risorse, filesystem di base
  in sola lettura, privilegi rimossi e rete assente nei job di test/build.
- Installazione dipendenze separata, senza lifecycle script, senza credenziali,
  per manifest/versioni autorizzati; nessuna ricarica o servizio a pagamento.
- Anteprima su copia pubblica senza file nascosti/segreti; CSP e richieste
  controllate. Browser di verifica temporaneo, non profilo personale.
- Deployment pubblico, messaggi a clienti, acquisti, dati reali regolati e
  modifica agli altri progetti restano fuori dal mandato corrente.

## Dipendenze previste e provenienza

- Ollama/Devstral gia verificati e scaricati; solo backend locale.
- Docker gia installato: client dedicato senza credenziali, engine esistente,
  immagine ufficiale Node24-bookworm-slim fissata per digest dopo il pull.
  Nessuna modifica o pulizia dei container esistenti.
- Playwright e adm-zip gia dipendenze del progetto; Edge gia installato.
- Axe-core come solo bundle di verifica, versione/SRI verificati dal registry
  npm ufficiale e licenza conservata. Nessuno script di installazione eseguito.
- Versioni scaffold fissate e lock delle dipendenze; pacchetti nuovi non
  autorizzati devono risultare BLOCKED, non produrre un falso PASS.

## Metodo e chiusura

Rischio 4 per scritture/esecuzioni: parent implementa, reviewer indipendente in
sola lettura verifica; il modello non decide il verdetto dei controlli.
Classi MODULE/backend e BOOTSTRAP per scaffold. UI AiderDesk riusata, nessuna
riscrittura della shell, nessuna modifica arbitraria al bundler.

Gate: path/secret/command denial; scrittura+rollback; timeout/cancel/cleanup;
scaffold/build supportati; anteprima; progetto generato e modificato dal solo
modello; test di accettazione e KB verificabili; export; riapertura dall'icona.
Prima pre-gate economici, poi build/suite/stress su sorgenti stabili.

I PASS sono sempre limitati ai controlli eseguiti. I problemi upstream Windows
e delle dipendenze iniziali restano visibili; nessuna certificazione universale
di sicurezza, qualita commerciale, privacy o guadagno economico.

Fonti runtime: https://docs.docker.com/subscription-billing/desktop-license/
(uso personale e piccole aziende nelle condizioni pubblicate);
https://github.com/nodejs/docker-node;
https://github.com/dequelabs/axe-core.
