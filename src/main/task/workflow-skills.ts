export type WorkflowKind = 'bug' | 'change' | 'feature';
export type WorkflowStage = 'plan' | 'implement' | 'debug' | 'review' | 'learn';

// These are adaptations of the public methods. The executable workflow owns approvals and checks.
export const WORKFLOW_SKILL_SOURCES = {
  brainstorming: 'https://github.com/obra/superpowers/blob/main/skills/brainstorming/SKILL.md',
  writingPlans: 'https://github.com/obra/superpowers/blob/main/skills/writing-plans/SKILL.md',
  systematicDebugging: 'https://github.com/obra/superpowers/blob/main/skills/systematic-debugging/SKILL.md',
  verificationBeforeCompletion: 'https://github.com/obra/superpowers/blob/main/skills/verification-before-completion/SKILL.md',
  specKit: 'https://github.com/github/spec-kit/blob/main/templates/spec-template.md',
  openSpec: 'https://github.com/Fission-AI/OpenSpec',
  compoundEngineering: 'https://github.com/EveryInc/compound-engineering-plugin/blob/main/STRATEGY.md',
} as const;

const kindInstructions: Record<WorkflowKind, string> = {
  bug: 'Per un bug, descrivi il comportamento osservato e quello atteso. Usa un caso di riproduzione preciso e limita la correzione alla causa.',
  change:
    'Per una modifica, descrivi la differenza fra il comportamento approvato e quello richiesto. Rileva le parti coinvolte e le aspettative di compatibilità.',
  feature:
    'Per una funzionalità, chiarisci obiettivo e flusso utente, poi esplicita esclusioni, casi limite e dipendenze. Registra le domande che cambiano il risultato.',
};

const stageInstructions: Record<WorkflowStage, readonly string[]> = {
  plan: [
    'Confronta la richiesta con codice, specifiche e decisioni approvate. Per ogni conflitto materiale indica la fonte e formula la domanda da risolvere prima di procedere.',
    'Identifica i componenti, i pattern e i testi approvati da riusare, con i relativi percorsi quando disponibili. Per le informazioni mancanti distingui domande aperte e assunzioni reversibili.',
    'Descrivi passi piccoli e ordinati per dipendenza, file coinvolti e criteri di accettazione osservabili. Per ciascun comportamento rilevante indica precondizione, azione, risultato atteso e controllo pertinente.',
  ],
  implement: [
    'Segui i passi e i criteri del piano approvato. Mantieni le responsabilità dei moduli e riusa le interfacce, i componenti, i testi e i test già presenti.',
    'Per una correzione riproducibile, usa il caso fallito come prova di regressione. Per gli altri interventi, collega la proposta ai criteri di accettazione e gestisci i casi limite del piano.',
    'Se emergono file, decisioni o dipendenze fuori perimetro, segnala cosa impedisce di rispettare il piano e quali prove lo mostrano.',
  ],
  debug: [
    'Parti dal controllo fallito. Isola il caso di riproduzione, confronta risultato osservato e atteso e indica le evidenze della causa prima di proporre una correzione.',
    'Correggi il minimo necessario. Mantieni i criteri e i test approvati come riferimento, poi indica il controllo fallito e le regressioni pertinenti da rieseguire.',
  ],
  review: [
    'Rivedi la proposta con il piano approvato, il diff e gli esiti effettivi dei controlli. Verifica ogni criterio di accettazione e segnala i casi mancanti, i risultati ambigui e gli errori riproducibili.',
    'Esamina anche regressioni, casi limite, compatibilità e riuso delle scelte approvate. Motiva ogni rilievo con un file, un comportamento osservabile o un risultato del controllo.',
    'Usa soltanto le prove disponibili. Se un criterio richiede una verifica mancante, indica esattamente quale.',
  ],
  learn: [
    'Ricava una proposta di apprendimento solo da una correzione o decisione verificata. Registra contesto, sintomo, causa, regola riutilizzabile e riferimento alla prova.',
    'Indica la destinazione più precisa per ogni proposta, per esempio una decisione, il catalogo dei componenti o un test di regressione. Segnala sovrapposizioni con fonti attive e separa i punti che richiedono approvazione.',
  ],
};

export const isWorkflowKind = (value: unknown): value is WorkflowKind => value === 'bug' || value === 'change' || value === 'feature';

export const workflowSkills = (kind: WorkflowKind, stage: WorkflowStage): string =>
  [
    kindInstructions[kind],
    'Usa i materiali del progetto come fonti sul prodotto. Rispetta i limiti del piano, gli strumenti e le autorizzazioni imposti dall’applicazione.',
    ...stageInstructions[stage],
    'Segui lo schema di risposta richiesto. Attribuisci esiti ai controlli effettivamente osservati.',
  ].join('\n');
