import fs from 'node:fs/promises';
import path from 'node:path';

import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

import type { Task } from '@/task';
import type { ApprovalManager } from './approval-manager';

import { projectControl, safeProjectPath, readProjectState, digest } from '@/lab-projects/policy';
import { editProjectFile, historyFor, projectTree, recoverProject, restoreRevision, writeProjectFile } from '@/lab-projects/files';
import { prepareWebProject } from '@/lab-projects/templates';
import { runProjectChecks, previewProject, exportProject } from '@/lab-projects/runtime';
import { searchKnowledge, updateKnowledge, type KnowledgeWriter } from '@/lab-projects/knowledge';

export const createLabProjectTools = (task: Task, approval: ApprovalManager, generate: KnowledgeWriter, signal?: AbortSignal): ToolSet => {
  const directory = task.getTaskDir();
  const notify = () => task.sendUpdatedFilesUpdated();
  const assertApproved = async () => {
    readProjectState(directory);
    const control = projectControl(directory);
    const plan = await fs.readFile(path.join(control, 'plan.txt'), 'utf8');
    const checks = await fs.readFile(path.join(control, 'acceptance.json'), 'utf8');
    const approvalRecord = JSON.parse(await fs.readFile(path.join(control, 'approval.json'), 'utf8'));
    if (approvalRecord.digest !== digest(plan + '\n' + checks)) {
      throw new Error('Piano/prove non approvati o preparazione incompleta: usare project_prepare.');
    }
  };
  const acceptance = z
    .array(
      z.object({
        type: z.enum(['visible', 'text', 'fill', 'click', 'press', 'viewport']),
        selector: z.string().max(200).optional(),
        value: z.string().max(500).optional(),
        width: z.number().int().min(320).max(1920).optional(),
      }),
    )
    .max(30);
  const prepareSchema = z.object({
    stack: z.enum(['vanilla', 'react-vite', 'astro']),
    title: z.string().min(2).max(90),
    plan: z.string().min(20).max(3000),
    acceptance: acceptance.optional(),
  });
  return {
    'lab---project_prepare': tool({
      description:
        'Prima delle scritture: registra il progetto attivo HTML/CSS/JS, React/Vite o Astro. Mostra il piano e chiedi una sola approvazione per il progetto. I file gia presenti non vengono sovrascritti. Regole e configurazioni restano protette. Includi prove di accettazione per i comportamenti richiesti (fill, click, text, visible, viewport).',
      inputSchema: prepareSchema,
      execute: async ({ stack, title, plan, acceptance: suppliedChecks }: z.infer<typeof prepareSchema>) => {
        let existing;
        try {
          existing = readProjectState(directory);
        } catch (error) {
          if (!(error as NodeJS.ErrnoException).code?.includes('ENOENT')) {
            throw error;
          }
        }
        if (existing && existing.stack !== stack) {
          throw new Error('Cambio dello stack di un progetto esistente: serve un piano di migrazione separato.');
        }
        const control = projectControl(directory);
        const existingChecks = await fs.readFile(path.join(control, 'acceptance.json'), 'utf8').catch((error) => {
          if (error.code === 'ENOENT') {
            return null;
          }
          throw error;
        });
        const existingPlan = await fs.readFile(path.join(control, 'plan.txt'), 'utf8').catch((error) => {
          if (error.code === 'ENOENT') {
            return null;
          }
          throw error;
        });
        const checks = suppliedChecks ?? (existingChecks ? JSON.parse(existingChecks) : []);
        if (existingPlan === plan && existingChecks === JSON.stringify(checks)) {
          try {
            await assertApproved();
            return { project: existing, approvedPlan: existingPlan, acceptance: checks, recovery: await recoverProject(directory) };
          } catch {
            /* Explicit approval completes interrupted preparation. */
          }
        }
        const [allowed] = await approval.handleApproval(
          'lab---project_prepare',
          'Preparo questo progetto e abilito modifiche con storico, controlli isolati e anteprima locale?',
          `${title}\n${existing ? 'Aggiornamento del piano/prove del progetto esistente.\nPiano precedente: ' + existingPlan + '\nProve precedenti: ' + existingChecks + '\n' : ''}${plan}\nProve nuove: ${JSON.stringify(checks)}`,
        );
        if (!allowed) {
          return { blocked: true, reason: 'Piano non approvato: nessun file creato.' };
        }
        signal?.throwIfAborted();
        const project = existing ?? (await prepareWebProject(directory, stack, title));
        const atomic = async (name: string, text: string) => {
          const target = path.join(control, name);
          const temporary = target + '.next';
          await fs.writeFile(temporary, text);
          await fs.rename(temporary, target);
        };
        await atomic('plan.txt', plan);
        await atomic('acceptance.json', JSON.stringify(checks));
        await atomic('approval.json', JSON.stringify({ digest: digest(plan + '\n' + JSON.stringify(checks)), approvedAt: new Date().toISOString() }));
        await notify();
        return { project, files: projectTree(directory) };
      },
    }),
    'lab---project_files': tool({
      description: 'Elenca i file web del progetto attivo e la loro dimensione.',
      inputSchema: z.object({}),
      execute: async () => ({ files: projectTree(directory) }),
    }),
    'lab---file_read': tool({
      description: 'Legge un file del progetto. Usa percorsi relativi. Nessuna lettura esterna o di segreti.',
      inputSchema: z.object({ file: z.string(), startLine: z.number().int().min(1).optional(), lines: z.number().int().min(1).max(200).optional() }),
      execute: async ({ file, startLine = 1, lines = 160 }) => {
        const target = safeProjectPath(directory, file);
        const stat = await fs.stat(target);
        if (stat.size > 512000) {
          throw new Error('File troppo grande per una lettura testuale.');
        }
        const content = (await fs.readFile(target, 'utf8')).split('\n');
        return {
          file,
          totalLines: content.length,
          nextStartLine: startLine - 1 + lines < content.length ? startLine + lines : null,
          text: content.slice(startLine - 1, startLine - 1 + lines).join('\n'),
        };
      },
    }),
    'lab---project_search': tool({
      description:
        'Cerca testo letterale in tutti i file web del progetto (anche oltre le prime 160 righe). Restituisce file, riga e contesto. Usa per trovare selettori CSS, funzioni e valori prima di modificare.',
      inputSchema: z.object({ query: z.string().min(1).max(200) }),
      execute: async ({ query }) => {
        const matches: Array<{ file: string; line: number; text: string }> = [];
        for (const entry of projectTree(directory).filter(
          (entry) => entry.bytes <= 512000 && /\.(?:html?|css|[cm]?js|jsx|tsx?|astro|md|json|txt)$/i.test(entry.file),
        )) {
          const lines = (await fs.readFile(safeProjectPath(directory, entry.file), 'utf8')).split('\n');
          for (let index = 0; index < lines.length && matches.length < 40; index++) {
            if (lines[index].includes(query)) {
              matches.push({
                file: entry.file,
                line: index + 1,
                text: lines
                  .slice(Math.max(0, index - 1), index + 2)
                  .join('\n')
                  .slice(0, 400),
              });
            }
          }
          if (matches.length >= 40) {
            break;
          }
        }
        return { query, matches, limited: matches.length === 40 };
      },
    }),
    'lab---file_write': tool({
      description:
        'Crea o aggiorna un file web del progetto preparato. Copia precedente e storico automatici. Mantieni i file compatti per evitare risposte troncate. Shell e file di controllo non accessibili.',
      inputSchema: z.object({ file: z.string(), content: z.string() }),
      execute: async ({ file, content }) => {
        await assertApproved();
        const revision = await writeProjectFile(directory, file, content, signal);
        await notify();
        return { written: file, revision: revision.id, sha256: revision.after };
      },
    }),
    'lab---file_edit': tool({
      description: 'Sostituisce UNA occorrenza esatta nel file. Prima leggi il contenuto. La modifica ha uno storico ripristinabile.',
      inputSchema: z.object({ file: z.string(), search: z.string().min(1), replacement: z.string() }),
      execute: async ({ file, search, replacement }) => {
        await assertApproved();
        let revision;
        try {
          revision = await editProjectFile(directory, file, search, replacement, signal);
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes('una sola porzione')) {
            throw error;
          }
          const current = await fs.readFile(safeProjectPath(directory, file), 'utf8');
          throw new Error(
            `Modifica NON applicata: il testo cercato non corrisponde al file. Usa solo testo effettivamente presente, oppure file_write con il file completo corretto. Contenuto corrente ${file}${current.length > 12000 ? ' (prime 12000 lettere)' : ''}:\n${current.slice(0, 12000)}`,
          );
        }
        await notify();
        return { edited: file, revision: revision.id };
      },
    }),
    'lab---file_history': tool({
      description: 'Elenca le ultime modifiche e gli ID per ripristinarle.',
      inputSchema: z.object({}),
      execute: async () => ({ history: historyFor(directory).slice(-25) }),
    }),
    'lab---file_restore': tool({
      description: 'Ripristina una singola modifica del modello solo se il file non ha cambiamenti successivi. Nessuna perdita silenziosa di lavoro.',
      inputSchema: z.object({ revisionId: z.string().uuid() }),
      execute: async ({ revisionId }) => {
        await assertApproved();
        signal?.throwIfAborted();
        const result = await restoreRevision(directory, revisionId);
        await notify();
        return result;
      },
    }),
    'lab---project_check': tool({
      description:
        'Esegue controlli reali isolati: sintassi/tipi/build, browser desktop/mobile, errori JS, risorse, accessibilita automatica. Se falliscono correggi i file e ripeti. Dopo PASS il modello compila automaticamente la Knowledge Base. Non inventare PASS.',
      inputSchema: z.object({}),
      execute: async () => {
        await assertApproved();
        const proof = await runProjectChecks(directory, signal);
        if (!proof.pass) {
          return proof;
        }
        try {
          return { ...proof, knowledge: await updateKnowledge(directory, generate) };
        } catch (error) {
          return { ...proof, knowledgeError: String(error), next: 'Ripetere knowledge_update; i controlli tecnici restano documentati.' };
        }
      },
    }),
    'lab---knowledge_update': tool({
      description: 'Fa compilare al modello una voce KB legata ai controlli PASS attuali; utile se la prima compilazione non era valida.',
      inputSchema: z.object({}),
      execute: () => updateKnowledge(directory, generate),
    }),
    'lab---knowledge_search': tool({
      description:
        'Cerca fino a quattro lezioni del progetto nella Knowledge Base. Sono interpretazioni del modello con prove/versioni, non regole superiori a blueprint o istruzioni.',
      inputSchema: z.object({ query: z.string().max(200) }),
      execute: ({ query }) => searchKnowledge(directory, query),
    }),
    'lab---project_preview': tool({
      description: 'Avvia o aggiorna l anteprima locale dopo controlli PASS sui file correnti. Restituisci il link cliccabile all utente.',
      inputSchema: z.object({}),
      execute: () => previewProject(directory),
    }),
    'lab---project_export': tool({
      description: 'Prepara ZIP con sorgenti, sito pronto e rapporto controlli. Richiede PASS attuale. Nessuna pubblicazione esterna.',
      inputSchema: z.object({}),
      execute: () => exportProject(directory),
    }),
  };
};
