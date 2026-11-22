import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env, pipeline } from '@huggingface/transformers';

const corrective = {
  A: [
    'Verifica se la stessa attività sta venendo svolta due volte contemporaneamente.',
    'Ricollega il lavoro già in corso quando torno nella sessione, altrimenti il secondo esecutore fa il lavoro del primo.',
    'Doveva partire una volta. Perché ce ne sono due sullo stesso incarico?',
  ],
  B: [
    'Riportami al lavoro che avevo interrotto: alla riapertura è stata scelta una pratica diversa.',
    'Verifica quale incarico è stato selezionato quando ho chiesto di continuare.',
    'Voglio proseguire la mia attività precedente, ma mi ritrovo a lavorare sulla cosa sbagliata.',
  ],
  C: [
    'Verifica se dopo la chiusura è sparito il punto da cui dovevo ripartire.',
    'Posso tornare alla fase lasciata a metà? Al riavvio sembra di dover ricominciare.',
    'Durante la chiusura il riepilogo ha preso il posto del salvataggio che mi serviva per continuare.',
  ],
  D: [
    'Verifica se nella consegna sono finiti dei file che dovevano rimanere separati.',
    'Il commit deve includere solo le modifiche di questo incarico e conservare a parte quelle che avevo preparato io.',
    'La mia bozza è stata spedita per sbaglio con il lavoro di qualcun altro. Come la separo?',
  ],
  E: [
    'Controlla se al nuovo tentativo è stata inviata la stessa revisione della prima volta.',
    'Il primo invio era stato rifiutato e riprovando ha creato un altro commit. Vorrei evitare il duplicato.',
    'Riprova a pubblicare quello che avevo già salvato mantenendo il suo identificativo.',
  ],
  F: [
    'Verifica se è ancora valida la prova manuale da quando è cambiato il comportamento.',
    'Perché questa nuova versione risulta già collaudata anche se avevo verificato solo quella vecchia?',
    'Richiedi un nuovo controllo quando cambia la funzione che era stata approvata.',
  ],
};

const incidental = {
  A: ['Misura quanta memoria, CPU e tempo consuma ciascun processo.', 'Voglio visualizzare i nomi e rendere più leggibili i simboli delle attività.'],
  B: ['Elenca le conversazioni del progetto e quando è stata aperta ciascuna.', 'Voglio consultare il testo di un vecchio lavoro e annotarne il nome.'],
  C: ['Vorrei dare un nome al salvataggio e sapere la data in cui è stato creato.', 'Esporta la cronologia della sessione e il riepilogo di fine giornata.'],
  D: ['Preparami una descrizione del commit per il cliente e traducila.', 'Vorrei la lista dei file e le statistiche delle modifiche per il verbale.'],
  E: ['Dimmi a che ora è avvenuto il secondo invio e quanto tempo ha richiesto.', 'Mi serve il link alla revisione da copiare nella comunicazione al team.'],
  F: ['A che ora è stata svolta la prova e chi l’ha firmata?', 'Vorrei stampare il verbale della verifica e cambiare come è mostrata la spunta.'],
};
const shared = [
  'Cambia il colore, la posizione o il nome visualizzato nella schermata.',
  'Scrivi un esempio per il manuale e spiega questa frase a chi legge.',
  'Voglio una traduzione o un riassunto da mandare a un collega.',
  'Mi interessano soltanto la durata, la data, il consumo o le statistiche.',
  'Esporta l’elenco in un file e preparami un facsimile del report.',
  'Vorrei l’indirizzo o il riferimento da copiare nella scheda.',
  'Questo comportamento è previsto, sto descrivendo un caso per la documentazione.',
];
const action = /\b(?:puoi|potresti|voglio|vorrei|mi serve|mi interessa|chiedo|controlla|verifica|mostra\w*|scrivi\w*|prepara\w*|calcola\w*|riporta\w*|esporta\w*|traduc\w*|rinomina\w*|fammi|dimmi|come|perche|quand[oa]|quant[aeoi]|quale|quali|chi|dove)\b/u;
const administrative = [
  /\b(?:traduc\w*|tradurr\w*|riformul\w*|riassum\w*|impagin\w*|rinomina\w*|riesport\w*|esport\w*)\b/u,
  /\b(?:colore|icone?|font|grassetto|didascalia|etichetta grafica|dimensione del carattere)\b/u,
  /\b(?:data|orario|ora|durata|consumo|percentuale|statistiche|timestamp|nominativo|autore|firmatario)\b.{0,50}\b(?:di|del|della|per|in|dell|impiegat\w*)\b/u,
  /\b(?:chi|quando|quanto|quanta)\b.{0,45}\b(?:firmat\w*|approvat\w*|impieg\w*|consum\w*|durat\w*|memoria|cpu)\b/u,
  /\b(?:link|url|permali\w*|grafico|screenshot|traduzione|fotografia)\b/u,
  /\b(?:scriv\w*|aggiung\w*|prepar\w*|inserisc\w*|consegn\w*|document\w*)\b.{0,75}\b(?:manuale|guida|verbale|newsletter|glossario|faq|tutorial|dizionario)\b/u,
];
const normalize = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
function focus(text) {
  const parts = text.split(/[.!?;\n]+|\b(?:ma|però|invece)\b/iu).map((part) => part.trim()).filter(Boolean);
  return parts.findLast((part) => action.test(normalize(part))) ?? text;
}

const [modelPath, requestPath, outputPath] = process.argv.slice(2);
const requests = JSON.parse(await fs.readFile(requestPath, 'utf8'));
for (const request of requests) {
  assert.deepEqual(Object.keys(request).sort(), ['candidate', 'id', 'query']);
  assert.ok(request.candidate === '-' || Object.hasOwn(corrective, request.candidate));
}
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useFSCache = false;
const encoder = await pipeline('feature-extraction', path.resolve(modelPath).replaceAll('\\', '/'), {
  device: 'cpu', dtype: 'q8', local_files_only: true,
  session_options: { intraOpNumThreads: 4, interOpNumThreads: 1 },
});
const sentences = [...new Set([...Object.values(corrective).flat(), ...Object.values(incidental).flat(), ...shared,
  ...requests.filter((row) => row.candidate !== '-').map((row) => focus(row.query))])];
const vectors = new Map();
for (let first = 0; first < sentences.length; first += 8) {
  const batch = sentences.slice(first, first + 8);
  const encoded = await encoder(batch, { pooling: 'mean', normalize: true });
  assert.deepEqual(encoded.dims, [batch.length, 384]);
  batch.forEach((text, i) => vectors.set(text, encoded.data.slice(i * 384, (i + 1) * 384)));
  encoded.dispose();
}
await encoder.dispose();
function best(text, anchors) {
  const source = vectors.get(text);
  return Math.max(...anchors.map((anchor) => vectors.get(anchor).reduce((sum, v, i) => sum + v * source[i], 0)));
}
const verdicts = requests.map(({ id, query, candidate }) => {
  if (candidate === '-') return { id, suggestion: '-', reason: 'nessuna-candidata' };
  const clause = focus(query);
  const correctiveScore = best(clause, corrective[candidate]);
  const alternateScore = best(clause, [...incidental[candidate], ...shared]);
  const explicit = administrative.some((pattern) => pattern.test(normalize(clause)));
  const reason = explicit ? 'obiettivo-alternativo-esplicito'
    : alternateScore - correctiveScore >= 0.10 ? 'obiettivo-alternativo-semantico' : 'conservata';
  return { id, suggestion: reason === 'conservata' ? candidate : '-', reason, clause,
    correctiveScore: Number(correctiveScore.toFixed(6)), alternateScore: Number(alternateScore.toFixed(6)) };
});
await fs.writeFile(outputPath, JSON.stringify(verdicts), 'utf8');
