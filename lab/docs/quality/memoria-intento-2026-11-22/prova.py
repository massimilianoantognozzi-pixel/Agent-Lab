"""Replica il confronto isolato fra verifica del sintomo e filtro sull'intento."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
PREVIOUS = HERE.parent / "memoria-it-2026-11-22"
HOLDOUT_HASH = "14b93e215b427a8780ff0f6f2b7124ca4f2a554e2e5db51ab9ff8c8bec5568f5"
PREVIOUS_RUNNER_HASH = "a427fab51e987d2492fa3ac71a3c3a039537b47a253b785b7ab036df9dc1c8e4"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(path.read_bytes())


def write(path, data):
    path.write_bytes((json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode())


def previous():
    path = PREVIOUS / "prova.py"
    if digest(path) != PREVIOUS_RUNNER_HASH:
        raise ValueError("Il programma di confronto precedente è cambiato")
    spec = importlib.util.spec_from_file_location("memoria_riscontro", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def classify(cases, work, model):
    baseline = previous()
    regression_work = work / "regressioni"
    regression_work.mkdir()
    qualified, count = baseline.passed_regressions(regression_work)
    # The retrieval implementation never receives either label or the observations.
    texts = [{k: row[k] for k in ["id", "query"]} for row in cases]
    retrieval = work / "recupero"
    retrieval.mkdir()
    ranking = baseline.retrieve(retrieval, model, texts)
    control = []
    requests = []
    for case, rank in zip(cases, ranking, strict=True):
        if case["id"] != rank["code"] or case["query"] != rank["query"]:
            raise ValueError("Abbinamento della richiesta non valido")
        top = [entry["id"] for entry in rank["rank"]["hybrid"]][:3]
        candidate = baseline.checked(top, case["observation"], qualified)
        assert baseline.checked(top, {}, qualified) == baseline.checked(top, case["observation"], set()) == "-"
        control.append((top, candidate))
        requests.append({"id": case["id"], "query": case["query"], "candidate": candidate})
    request_path = work / "richieste-cieche.json"
    result_path = work / "intenti-ciechi.json"
    write(request_path, requests)
    subprocess.run(["node", str(HERE / "intento.mjs"), str(model), str(request_path), str(result_path)],
                   cwd=ROOT, check=True, env={**os.environ, "HF_HUB_OFFLINE": "1"})
    rows = []
    for case, (top, old), evaluation in zip(cases, control, read(result_path), strict=True):
        new = evaluation["suggestion"]
        assert evaluation["id"] == case["id"] and new in ("-", old)
        rows.append({"id": case["id"], "expected": case["expected"], "evidenceExpected": case["evidenceExpected"],
                     "primeTre": top, "picks": {"riscontro": old, "riscontroIntento": new},
                     "filtro": {k: v for k, v in evaluation.items() if k not in ["suggestion", "id"]}})
    return {"regressioniSuperate": count, "proveCollegate": sorted(qualified),
            "conteggiPerIntento": baseline.scores(rows, "expected"), "casi": rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, default=ROOT / "lab/work/audit-memoria-it-01/model")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--sviluppo", action="store_true", help="Usa i 30 casi precedenti come controllo positivo")
    args = parser.parse_args()
    manifest = read(HERE / "metodo.json")
    for name, reference in manifest.items():
        if digest(HERE / name) != reference:
            raise ValueError(f"Artefatto del metodo diverso dal file fissato: {name}")
    path = (PREVIOUS / "casi.json") if args.sviluppo else (HERE / "holdout.json")
    if not args.sviluppo and digest(path) != HOLDOUT_HASH:
        raise ValueError("Il campione non coincide con quello fissato dal tester")
    cases = read(path)
    if len({r["id"] for r in cases}) != len(cases) or not cases:
        raise ValueError("Dataset senza casi o con ID duplicati")
    if not args.sviluppo:
        old_queries = {c["query"].strip().casefold() for c in read(PREVIOUS / "casi.json")}
        if any(c["query"].strip().casefold() in old_queries for c in cases):
            raise ValueError("Sovrapposizione con il precedente campione")
    area = ROOT / "lab/work/memoria-intento-2026-11-22"
    area.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="run-", dir=area) as temp:
        result = classify(cases, Path(temp), args.model.resolve())
    write(args.output, {"campioneSha256": digest(path), "metodo": manifest, **result})
    print(json.dumps(result["conteggiPerIntento"], ensure_ascii=False))


if __name__ == "__main__":
    main()
