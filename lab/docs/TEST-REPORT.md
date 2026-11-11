# Esito del primo checkpoint Agent Lab

Data: 25 ottobre 2026. Base: AiderDesk v0.88.0, commit
4c69f65804ed20a1e3b11dea6a5254589f8b664a, licenza Apache 2.0 del repository.
Sorgente: https://github.com/hotovo/aider-desk/tree/v0.88.0

## Risultato

Base desktop compilata, avviata e chiusa sul PC. Profili e workspace separati,
regole e skill recuperate, Serena verificata sul codice sintetico. Nessun costo
di inferenza sostenuto e nessun provider reale collegato. Questo checkpoint
non dimostra ancora sviluppo autonomo, velocità o uso cloud senza quote.

## Verifiche

| Controllo | Esito | Evidenza |
|---|---|---|
| Provenienza del sorgente | PASS | Tag e commit fissati; remoto upstream |
| Build e typecheck Node/renderer | PASS | npm run build; work/lab-build.log |
| Lint file modificati | PASS | work/changed-lint.log |
| Nuovi test di confine/approvazioni/regole | PASS | 22/22; work/lab-focused-tests.log |
| Suite interfaccia | PASS | 509/509; work/full-web-tests.log |
| Suite motore completa | FAIL upstream | 1488 pass, 43 fail su 1531; sei file |
| Confronto 43 errori con sorgente originale | PASS confronto | Stesso elenco di 43; nessuna nuova failure |
| App Electron 44.9.3 | PASS | work/electron-smoke.json; nessun pageerror |
| Ripresa task e bozza senza esecuzione | PASS | Ripristino da dati salvati dopo riavvio |
| Regole globali nel prompt Windows | PASS | Percorsi ~/ portabili e marker nel test Task→PromptsManager |
| Skill | PASS | 20 copiate + 2 interne; attivazione/disattivazione reale |
| Serena MCP/LSP reale | PASS | Lettura overview e corpo di calculate_subtotal |
| Terminale Node ed Electron | PASS | Marker eseguito; processo del terminale chiuso |
| Tentativi IPC vietati | PASS | Sei casi: file read/write esterni, open esterno, MCP, clone, profilo |
| Connessioni in ascolto dell'app | PASS | Solo 127.0.0.1, incluse app e Git askpass |
| Chiusura dell'app | PASS | Exit 0; nessun processo Electron/Serena del laboratorio rimasto |
| Integrità conoscenza | PASS | 394 file, hash origine/copia corrispondenti |
| Preservazione configurazioni originali | PASS | Tre SHA-256 invariati: AGENTS, opencode.json, Serena YAML |
| Gitleaks modifiche e copie delle skill | PASS nel perimetro | Nessun segreto rilevato; output redatto |
| Semgrep | WARN | 12 regole, quattro finding ereditati su shell.ts, nessuno nuovo; zero errori scanner |
| npm audit | WARN | 0 critical, 3 high, 5 moderate, 5 low |
| Review separata | PASS nel perimetro | Finding introdotti corretti e riletti da reviewer indipendente |
| Knip | SKIPPED | Non presente; non installato globalmente |
| DB/Auth/RLS/Supabase | N/A | Nessun intervento su questi sistemi |
| Inferenza, modifica autonoma e annullamento live | SKIPPED | Nessun modello collegato nel checkpoint |

La suite motore fallisce anche sul sorgente upstream non modificato usando
gli stessi pacchetti e Windows. Cause osservate: separatori di percorso,
mock di filesystem/profili/watcher, ritorni a capo Git e nomi non ammessi da
Windows. Non sono stati rimossi test o indebolite asserzioni per ottenere verde.
Il confronto non costituisce prova con tutte le dipendenze originali upstream.

## Dipendenze e installazione

Installazione npm da lock con --ignore-scripts. Eseguiti solo l'installer
Electron verificato con i checksum del pacchetto, patch-package e build
estensioni; i cinque binari PTY Windows provengono dalla release Homebridge
v0.13.1. SHA-256 archivio:
048a58d753a094fd6e601b8ab2aa42c34be4e42e2162d60b1628e32d83f51383.
https://github.com/homebridge/node-pty-prebuilt-multiarch/releases/tag/v0.13.1

Non eseguiti bootstrap Python/Aider, downloader Probe, downloader cloudflared
e setup ONNX per Linux. Nessuna installazione globale o modifica a certificati,
PATH persistente o funzionalità Windows. Serena usa il launcher già presente
con SERENA_HOME dedicata; nessun modello locale o embedding avviato.

Aggiornamenti compatibili a Electron, Vite, Vitest, Undici, DOMPurify, Zod 4 e
alcune dipendenze transitive. Tentare di imporre Zod 4 anche ai consumer Zod 3
rompe il lint; l'override globale è stato rimosso. Restano tre voci high nella
catena Zod 3 del plugin lint React Compiler e del pacchetto MCP standalone,
riferite all'advisory https://github.com/advisories/GHSA-mrhx-c7xc-m3w5.
Le voci moderate riguardano la catena Tailwind/PostCSS; le basse la resa
matematica/KaTeX. Nessuna dichiarazione di audit completamente superato.

Le quattro segnalazioni Semgrep riguardano execSync interpolati già presenti
in shell.ts: tre percorsi Unix non usati dalla prova Windows e initPath
disabilitato nel laboratorio. Sono rimaste segnalazioni aperte sul codice
ereditato, non cancellate tramite esclusioni. Ruleset TrueLine di 12 regole:
copertura statica limitata, non audit di tutto Electron o di tutte le dipendenze.
Scanner Docker locale 1.178.0, senza rete, sorgenti montati in sola lettura.

## Controlli introdotti

Inferenza, cataloghi remoti automatici, telemetria, aggiornamenti e memoria
embedding sono disabilitati nel modo laboratorio prima dei relativi avvii.
Il launcher esclude chiavi provider ereditate e configura separatamente dati,
home applicativa, temporanei, Serena e Git. Le approvazioni Never e Ask non
vengono aggirate scegliendo Auto o attraverso gli hook delle estensioni.

Gli strumenti consentiti sono letture circoscritte. Percorsi canonici, file
riservati e collegamenti esterni sono controllati; letture simboliche richiedono
un file esistente. Le ricerche globali di contenuto Serena e gli strumenti
mutativi sono bloccati. CRUD MCP/profili, scraping e clone sono disabilitati
nel checkpoint. Il server dell'app è vincolato a loopback.

Corretto un deadlock di chiusura ereditato, mantenendo i servizi disponibili
fino alla chiusura dei task; se questa fallisce il teardown successivo continua.
La chiusura normale è provata; non è stata iniettata una failure artificiale
durante il cleanup. Corretto anche il formato Windows dei percorsi delle
regole globali, che prima ne impediva il caricamento nel prompt.

## Limiti e prossima fase

Questo è isolamento applicativo su progetti sintetici, non contenimento OS.
Non sono state applicate tutte le garanzie PatchFox, né verificati tutti gli
ingressi dell'app contro un utente o un'estensione ostile. Anche la patch
upstream ai 7.0.127 disabilita la validazione ModelMessage[]: non equivale a
disabilitare la validazione degli argomenti tool, ma rimane un'eccezione nota.
Serena è fissata a sample-python; il passaggio tra progetti è futuro.

Il software locale non richiede crediti dell'agente. Le offerte dei modelli
restano soggette a condizioni e quote del rispettivo fornitore: questo lavoro
non crea accesso cloud gratuito illimitato. Nessun endpoint non documentato
o aggiramento di quote è stato implementato.

Prossimo blocco: scegliere e verificare il canale cloud gratuito, collegarlo
senza copiare credenziali degli altri ambienti, poi provare modifica→diff→test
e recupero sul solo progetto sintetico. I progetti reali restano esclusi.

Nessun commit/push automatico del sorgente. Riapertura tramite
Apri-Agent-Lab.cmd. Dati e prove grezze rimangono sotto lab/profile e lab/work,
ignorati da Git. Stato riprendibile in SESSION-STATE.md.
