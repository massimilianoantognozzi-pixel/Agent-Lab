# Qualifica del workflow governato su Linux e Node 24

Il 22 novembre 2026 la copia isolata di Agent-Lab ha eseguito il workflow con sorgenti, configurazioni e dati sintetici. La base Git è `430b6eb0`. Alla copia sono state applicate le modifiche di questo blocco per il workflow, lo scanner, l’esempio Turni e il formato dei quattro file server coinvolti dal lint. Il confronto riguarda questo perimetro.

## Controlli e copertura

| Verifica | Esito osservato |
|---|---|
| Installazione Linux x64 con `npm ci` e lifecycle completi | PASS su Ubuntu 24.04 con Node 24.22.1, npm 11.19.1, compilatore C++ e make. Il runner CPU usa `ONNXRUNTIME_NODE_INSTALL_CUDA=skip`. I tentativi iniziali hanno rilevato il download CUDA indisponibile e l’assenza di make nell’immagine minima. |
| `npm run build` | PASS. Il comando include typecheck main e renderer e compilazione Electron. |
| `npm run lint:check` | PASS con un warning nel componente preesistente SidebarGroupTree. Il controllo indipendente degli alberi sintattici TypeScript dei quattro file server conferma che le correzioni di formato conservano il codice. |
| Vitest Node e renderer su Linux | Node 2.014 superati, 5 esclusi. Renderer 517 superati. I cinque esclusi riguardano tre casi specifici Windows, la ricerca su SearXNG reale e il test che richiede l’immagine Docker nel processo del runner. |
| Workflow con Docker Desktop e worker Linux | La verifica integrata sul filtro riproduce il guasto, osserva il candidato errato nel correttore, restituisce solo la diagnostica strutturata e consegna il candidato successivo verificato. L’immagine è fissata per digest. |
| Esempio generato `node lab/scripts/verify-workflow-example.mjs` | Il filtro iniziale fallisce. Un’implementazione equivalente con sintassi diversa passa. Un filtro che inverte l’ordine degli elementi fallisce. Tutte le esecuzioni confermano filesystem di sola lettura e rete isolata. Il generatore preserva sia l’esempio sia la configurazione d’uso già presenti. |
| Persistenza dei criteri | Il nuovo piano conserva il tipo del controllo al momento della proposta. Il test rilegge il piano con una definizione diversa e un piano precedente privo del campo. La ricevuta storica di una policy modificata conserva l’ID e il PASS. |
| Definizione della CI | Parsing YAML e controllo sintattico Bash di ciascuno step superati. La configurazione per le pull request usa un token con sola lettura, Node 24, lockfile, scanner e immagine di test fissati, lint, build, suite e prova Turni. Il primo esito del runner GitHub resta da osservare alla pubblicazione autorizzata. |

## Directory private e Docker

Su un volume Linux reale, montare direttamente una directory creata da `mkdtemp` con permessi 0700 impediva al verificatore con UID 65534 di leggere il file. Il controllo POSIX ora monta soltanto una copia dei file approvati dentro il job privato. I file della copia hanno modalità 0644 e le sue directory 0755, anche con umask 077. Il padre conserva 0700. Il checkout originale mantiene i propri permessi.

La prova ha eseguito le funzioni di staging e sandbox dal sorgente candidato in Node Linux. Un adattatore del banco ha inoltrato al daemon locale la serie fissa di chiamate Docker e ha tradotto il percorso del volume di prova. Il container effettivo ha letto il file consentito con UID 65534 e il mount di sola lettura. Il file affiancato nel padre era fuori dal mount. Al successo, all’uscita 7 e dopo Stop su un container già partito, la copia e il container sono stati rimossi. Il padre e il suo contenuto sono stati ricontrollati dopo ciascuna esecuzione.

## Scanner

Il tarball Linux x64 Gitleaks 8.30.1 ha SHA-256 `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`. L’impronta coincide col digest dell’asset e col manifesto della release. L’eseguibile estratto ha SHA-256 `88f91962aa2f93ac6ab281d553b9e125f5197bbbce38f9f2437f7299c32e5509` e risponde con versione 8.30.1. [Release Gitleaks 8.30.1](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1)

Le modalità stdin e directory hanno dato exit 0 sul contenuto neutro e 1 sul campione sintetico riconoscibile. Nel codice del prodotto sono passate otto asserzioni sulle entrate memoria, consegna file e scansione progetto. Tutte e tre accettano il campione pulito e respingono quello segnalabile. Memoria e scansione progetto respingono anche un eseguibile con digest diverso. La costante del profilo desktop è stata collegata alla cartella temporanea del banco. Lo scanner usato era il binario Linux reale.

I risultati dettagliati sono in `lab/work/qualifica-workflow-2026-11-22/`. La prova locale copre Ubuntu x64, i controlli Windows già eseguiti e i container Linux del Docker Desktop. Rimangono fuori copertura macOS, Linux ARM, una ricerca live SearXNG e l’esecuzione ospitata della nuova CI. Le scelte di approvazione della coda restano una decisione di prodotto.
