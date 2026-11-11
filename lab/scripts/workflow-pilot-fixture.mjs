export const pilotRequest =
  "Attiva ricerca per nome, filtro per stato e apertura del dettaglio. Riusa i tre componenti e le etichette approvate.";

export const pilotFiles = {
  "AGENTS.md":
    "# Pilota Agent-Lab\n\nDati sintetici. Usa DESIGN.md come decisione approvata e modifica solo view.json.\n",
  "DESIGN.md":
    "# Interfaccia approvata\n\n" +
    "- Riusa RecordsTable, RecordsFilter e RecordDialog già definiti in index.html.\n" +
    "- Ricerca per nome e filtro per stato si combinano. Il dettaglio mostra il nome della riga selezionata.\n" +
    "- Etichette: Cerca, Tutti, Nessun risultato, Dettagli, Chiudi.\n" +
    "- Il titolo esistente è Archivio campione. La richiesta abilita i tre comportamenti già disponibili.\n",
  "HISTORY.md":
    "# Decisione superata\n\nL’etichetta precedente del filtro di ricerca era Trova.\n",
  "view.json": JSON.stringify(
    {
      title: "Archivio campione",
      table: "RecordsTable",
      filters: "RecordsFilter",
      modal: "RecordDialog",
      enabled: { search: false, status: false, details: false },
      labels: {
        search: "Cerca",
        all: "Tutti",
        empty: "Nessun risultato",
        details: "Dettagli",
        close: "Chiudi",
      },
    },
    null,
    2,
  ),
  "index.html": [
    '<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>Archivio campione</title><style>",
    "body{font:1rem system-ui,sans-serif;margin:3rem auto;max-width:48rem;padding:0 1rem;color:#202b38}",
    "label{display:inline-flex;gap:.5rem;margin:0 1rem 1rem 0}button,input,select{font:inherit;padding:.4rem}",
    "table{width:100%;border-collapse:collapse;text-align:left}th,td{padding:.6rem;border-bottom:1px solid #c8d1db}",
    "dialog{min-width:16rem;border:1px solid #8397ac;border-radius:.4rem;padding:1rem}",
    '</style></head><body><main id="app"></main><script type="module">',
    'const app = document.querySelector("#app");',
    'const view = await fetch("./view.json", {cache:"no-store"}).then(response => response.json());',
    'const records = [{name:"Ada Rossi",state:"Attivo"},{name:"Luca Bianchi",state:"Archiviato"},{name:"Marta Serra",state:"Attivo"}];',
    "const el = (tag,text) => { const node = document.createElement(tag); if (text) node.textContent = text; return node; };",
    "function RecordDialog() {",
    '  const dialog = el("dialog"), name = el("h2"), close = el("button",view.labels.close);',
    '  name.id = "record-name"; dialog.setAttribute("aria-labelledby", name.id);',
    "  close.onclick = () => dialog.close(); dialog.append(name,close); app.append(dialog);",
    "  return record => { name.textContent = record.name; dialog.showModal(); };",
    "}",
    "function RecordsTable(showDetails) {",
    '  const table = el("table"), header = el("thead"), columns = el("tr"), body = el("tbody"), empty = el("p",view.labels.empty);',
    '  for (const caption of ["Nome","Stato","Azioni"]) columns.append(el("th",caption));',
    "  header.append(columns); table.append(header,body); app.append(table,empty);",
    "  return matches => { body.replaceChildren(); empty.hidden = matches.length > 0;",
    '    for (const record of matches) { const row = el("tr"), actions = el("td");',
    '      if (view.enabled.details) { const button = el("button",view.labels.details); button.onclick = () => showDetails(record); actions.append(button); }',
    '      row.append(el("td",record.name),el("td",record.state),actions); body.append(row); } };',
    "}",
    "function RecordsFilter(render) {",
    '  const box = el("section"), search = el("input"), status = el("select");',
    '  for (const [name,value] of [[view.labels.all,""],["Attivo","Attivo"],["Archiviato","Archiviato"]]) {',
    '    const option = el("option",name); option.value = value; status.append(option); }',
    '  for (const [enabled,name,field] of [[view.enabled.search,view.labels.search,search],[view.enabled.status,"Stato",status]]) {',
    '    if (enabled) { const label = el("label",name); label.append(field); box.append(label); } }',
    "  const refresh = () => render(records.filter(record =>",
    "    (!search.value || record.name.toLowerCase().includes(search.value.trim().toLowerCase())) &&",
    "    (!status.value || record.state === status.value)));",
    '  search.oninput = refresh; status.onchange = refresh; refresh(); app.insertBefore(box,app.querySelector("table"));',
    "}",
    'app.append(el("h1",view.title));',
    "const components = { RecordsTable, RecordsFilter, RecordDialog };",
    "components[view.filters](components[view.table](components[view.modal]()));",
    "</script></body></html>",
  ].join("\n"),
};
