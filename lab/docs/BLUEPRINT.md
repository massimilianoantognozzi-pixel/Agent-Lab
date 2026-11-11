# Primo checkpoint approvato — Agent Lab

## Obiettivo

Ottenere una base AiderDesk avviabile e verificabile sul PC, indipendente dagli
ambienti esistenti, per costruire successivamente il nostro agente cloud.

## Base e perimetro

- Sorgente ufficiale: https://github.com/hotovo/aider-desk
- Release: v0.88.0.
- Commit: 4c69f65804ed20a1e3b11dea6a5254589f8b664a.
- Nessun cambiamento alla destinazione dei progetti aider-max o Patchfox.
- Il modello cloud e la sua offerta commerciale rimangono una verifica separata.
- Nessuna inferenza reale, acquisto, iscrizione o copia di credenziali.

## Criteri di accettazione

1. Sorgente e dipendenze fissati, installazione e build registrate.
2. Dati, regole, cache, Serena e workspace di prova separati dagli originali.
3. AGENTS globale e 20 skill recuperati con provenienza e controlli di integrita.
4. Serena inizializzata e verificata su un repository sintetico.
5. Caricamento regole/skill, annullamento/ripresa e approvazioni verificati dove
   il runtime disponibile lo consente; distinguere prove simulate da inferenza.
6. Tentativi vietati pertinenti verificati, senza attribuire alla prova un
   contenimento di sistema operativo che non e stato realizzato.
7. Telemetria, aggiornamenti automatici e memoria con embedding locali disattivi
   nel profilo di prova; nessuna connessione a un provider reale.
8. Review indipendente, stato riprendibile e report con PASS/FAIL/SKIPPED.

## Rischio e ruoli

Rischio massimo 4 per esecuzione locale, MCP e controlli degli strumenti.
L'orchestratore implementa nel laboratorio; gli explorer/reviewer non scrivono.
Nessun file dei progetti esistenti e assegnato in scrittura.

## Architettura frontend

Classe BOOTSTRAP/ENTRYPOINT per il laboratorio; shell React/Electron upstream
preservata. Riutilizzare electron-vite e i comandi del repo. Misurare la build
upstream prima di introdurre modifiche al grafo di caricamento. Nessuna soglia
copiata da altri progetti; nessuna modifica ai chunk per ottenere un PASS.

## Esclusioni

Prodotto completo, pubblicazione, firma commerciale dell'installer, telemetria,
modelli locali, riuso dei database OpenCode, dati reali, DB/Auth dei progetti,
deploy e certificazione di sicurezza completa.
