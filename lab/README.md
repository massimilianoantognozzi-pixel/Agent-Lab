# AiderDesk personale - sviluppo generale

Interfaccia italiana integrata e attiva:1924voci, impostazioni, messaggi e menu
nativi. Lingua modificabile da Impostazioni → Generali → Aspetto → Lingua.
I menu di sistema adottano il cambio al riavvio. Dettagli: docs/LOCALIZATION-IT.md.

DECISIONE ATTIVA DELL'UTENTE: progetto completo per sviluppare qualsiasi cosa
scelga, con funzioni native e senza vincoli imposti di settore, dimensione,
linguaggio, file o template. Fonte: docs/AIDERDESK-GENERAL-BLUEPRINT.md.

Il launcher usa configure-general-gui.mjs: profilo AiderDesk - sviluppo
generale, strumenti nativi, terminale, Aider, skill, estensioni e Serena sulla
cartella attiva. Nessun tetto di60passaggi (maxIterations0). Il precedente
percorso ristretto del laboratorio non viene applicato alla versione generale.
KB automatica del modello su risultati nativi, privata e con controllo dei
dati sensibili; lezioni interpretative con ambito esplicito, non nuove regole.

Cloud primario collaudato: Z.AI Standard, glm-4.5-flash, gratuito nel listino
ufficiale verificato il28ottobre2026. Chiave inserita personalmente dall'utente.
Cinque test PASS sia nel flusso AgentAuto(23s) sia nella modifica Code(16s).
Profilo separato Devstral locale - riserva. Nessun abbonamento, ricarica o
passaggio automatico pagato. Quote giornaliere e saldo non verificati.
Per lavorare senza conferma del piano selezionare Auto; Guided e una scelta
nativa di supervisione. Il catalogo Z.AI comprende anche modelli a pagamento.

Stato operativo dettagliato: docs/GENERAL-IMPLEMENTATION-STATE.md. I risultati
web sotto restano solamente lo storico del primo banco di prova.

## Storico del banco web (perimetro prodotto superato)

Versione personale basata su AiderDesk v0.88.0 (Apache 2.0). Aprire l'icona
Agent-Lab sul Desktop oppure `Apri-Agent-Lab.cmd` nella radice. Il launcher
usa la build salvata, un solo processo app e un backend Ollama dedicato;
non reinstalla dipendenze. Node, Ollama, Docker e Gitleaks sono gia presenti.

Profilo: Agent-Lab - progetti web, modalita Agent. Modello Devstral Small 2
locale, nessuna API a pagamento o quota giornaliera dell'agente. I limiti
tecnici del singolo lavoro (contesto, output, passaggi, timeout e risorse)
restano espliciti: non equivalgono a una quota di messaggi.

Solo cartelle nuove o copie dei sorgenti dentro `lab/workspaces`, senza
metadati Git importati. Supportati HTML/CSS/JavaScript, React/Vite e Astro.
Il modello prepara il piano, scrive con storico, controlla su copie isolate,
compila una KB dopo PASS e crea anteprima/ZIP in `Consegne`. Le nuove prove
richiedono approvazione; il vecchio PASS diventa invalido quando cambiano
file o criteri. La UI mostra file e diff attraverso lo storico proprio.

La demo e `lab/workspaces/studio-lume-demo`. Le prove mostrano che Devstral
lavora con un brief preciso ma puo bloccarsi su modifiche inventate: non e
qualificato qui come sviluppatore indipendente per consegne senza revisione.
Vedi il rapporto finale per la distinzione tra prove autonome e assistite.
La KB contiene interpretazioni del modello con prove/versioni; non addestra
i pesi del modello e non sostituisce regole, blueprint o revisione umana.

Regole e 20 skill OpenCode sono riusate come copie verificate. Serena e stato
provato sul fixture Python in sola lettura; non viene esposto ai nuovi siti
con il vecchio percorso Python. Nessuna chiave o configurazione originale
OpenCode viene importata o modificata.

Fonti operative: `AGENTS.md`, `docs/BLUEPRINT.md`, `docs/SESSION-STATE.md` e
`docs/TEST-REPORT.md`. Dati e log locali sono esclusi da Git.

Comandi riproducibili dalla radice:

```powershell
npm.cmd run build
node lab/scripts/smoke-serena.mjs
node lab/scripts/smoke-electron.mjs
```

Non eseguire il postinstall completo upstream: il setup selettivo adottato e
le eccezioni sono elencati nel report. La suite completa mantiene errori
upstream Windows documentati; il laboratorio non è certificato per dati reali.
