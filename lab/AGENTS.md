# AiderDesk - regole operative attive

Fonte di perimetro: docs/AIDERDESK-GENERAL-BLUEPRINT.md.
Decisione esplicita dell'utente: AiderDesk completo per qualsiasi sviluppo
che decida lui. Nessun limite imposto a linguaggi, tipi di file, dimensioni,
stack, template, shell, Git, strumenti o estensioni native.
Le demo web sono prove facoltative. Le precedenti regole ristrette sono
archiviate in docs/AGENTS-HISTORICAL-2026-10-25.md e non governano il prodotto.

- Modello cloud gratuito come prima scelta desiderata, locale come riserva.
  Nessun acquisto, abbonamento o passaggio automatico a un modello pagato.
  Distinguere i limiti dell'agente, le quote del provider e i limiti tecnici.
- Durante questa costruzione modificare solo Agent-Lab e i deliverable della
  chat. Le installazioni di origine e gli altri progetti restano fuori dalle modifiche.
- Nessuna modifica a fiducia Windows, certificati, PATH o servizi globali.
  Dati dell'app, cache e modello di riserva sono nel profilo dedicato.
- Riutilizzare le funzioni native AiderDesk. Il modello deve leggere i file,
  eseguire comandi reali e distinguere esiti PASS/FAIL/non verificati.
- La Knowledge Base e compilata dal modello su evidenze reali: ambito,
  versione e hash osservati. Non e addestramento e non certifica tutto il
  progetto. Non acquisire segreti o storico chat nella raccolta automatica.
  Queste cautele della KB non limitano gli strumenti di sviluppo.
- Rispettare AGENTS, decisioni approvate e autorizzazioni del progetto attivo.
- Usare i controlli pertinenti e review indipendente; riferire rischi,
  assistenza e prove non eseguite. Nessuna promessa di autonomia universale.
- Nessun commit/push automatico del laboratorio in questa fase.
- Prima di scrivere test, usare la skill Writing Tests upstream:
  ../.aider-desk/skills/writing-tests/SKILL.md.

Punto di ripresa: docs/GENERAL-IMPLEMENTATION-STATE.md.
