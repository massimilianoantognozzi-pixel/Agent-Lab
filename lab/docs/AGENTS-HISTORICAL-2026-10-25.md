# Agent Lab — regole operative attive

Fonte di perimetro piu recente: docs/AIDERDESK-GENERAL-BLUEPRINT.md, su
correzione esplicita dell'utente. L'agente serve allo sviluppo generale su
AiderDesk; template e demo web sono un banco, non il limite del prodotto.
Cloud gratuito prioritario, locale di fallback; nessuna attivazione pagata.

Aggiornamento approvato nella sessione del 25 ottobre 2026: l'utente ha
autorizzato modello locale, agente completo per piccoli lavori web, KB
compilata dal modello e chiusura autonoma. Fonte attiva del nuovo perimetro:
`docs/FREELANCE-AGENT-BLUEPRINT.md`. Le regole storiche sotto sono conservate
come provenienza; le restrizioni del primo checkpoint senza inferenza sono
state superate dall'autorizzazione esplicita e dalle prove successive.

- Solo modello locale verificato e workspace del laboratorio. Nessuna API
  a pagamento, credenziale importata o modifica di altri progetti.
- Solo sorgenti senza metadata Git importati; elenchi e diff della GUI usano
  il filesystem consentito e lo storico con backup/hash del laboratorio.
- Il modello modifica solo file web tramite strumenti tipizzati. Nessuna
  shell host o estensione di progetto. Node generato e browser dei controlli
  eseguono solo in container dedicati senza rete o credenziali.
- Installazione dipendenze in fase separata su manifest minimo pubblico,
  versioni approvate, lock verificato e lifecycle script disabilitati.
- PASS legato a sorgenti, output e criteri. KB generata dal modello su prove
  reali, dichiarata interpretazione; nessun cambio di regole o blueprint.
- Riferire i fallimenti e l'assistenza umana nelle prove. Nessuna promessa di
  qualita commerciale, sicurezza universale o autonomia totale del modello.
- Rischio 4: test negativi e review indipendente. Nessun push/commit automatico
  delle modifiche a questo laboratorio nella presente fase.

## Provenienza del checkpoint iniziale

Mandato approvato dall'utente il 25 ottobre 2026: laboratorio indipendente di
AiderDesk 0.88.0, riuso di AGENTS/skill/Serena, build e verifiche del telaio.

- Scrivere solo nel nuovo laboratorio e nei deliverable della chat.
- Le configurazioni OpenCode/Serena originali e gli altri progetti sono sorgenti
  di sola lettura. Non importare database, log, credenziali o sessioni.
- Modelli di coding esclusivamente cloud: in questo checkpoint nessun modello
  locale, embedding locale o inferenza verso provider reali.
- Nessuna modifica a PATH persistente, certificati di Windows, servizi di sistema
  o account. Tutte le variabili dell'app sono limitate al processo del laboratorio.
- Il laboratorio non e una sandbox del sistema operativo e non implementa ancora
  tutte le garanzie PatchFox. Usare soltanto progetti sintetici autorizzati.
- Verificare l'installazione delle dipendenze e gli script prima di eseguirli.
- Usare test e controlli deterministici; richiedere review indipendente.
- Gli artefatti locali e le credenziali eventuali devono restare ignorati da Git.
- Il repo upstream richiede la skill Writing Tests presente in
  `.aider-desk/skills/writing-tests/SKILL.md`: leggerla prima di scrivere test e
  riusare i pattern Vitest e le fixture upstream esistenti.

Eccezione successiva autorizzata dall'utente il 25 ottobre 2026: prova locale
Devstral/Ollama separata, con cloud disattivato. Vedi docs/LOCAL-TRIAL.md.
Il profilo GUI iniziale resta senza inferenza fino al checkpoint di integrazione.
