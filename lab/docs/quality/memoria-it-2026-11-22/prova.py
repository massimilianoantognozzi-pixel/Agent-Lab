"""Ripete il banco dal checkout Agent-Lab. Richiede i pesi locali del 19 novembre."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
ARCHIVE = HERE.parent / "memoria-it-2026-11-19/Dati-e-replica-memoria-IT.zip"
ARCHIVE_HASH = "9668df896a96d931b75be41a7451fb0be5f9810a94ab3a091450c8ea0049c50f"
TESTS = {
    "A": ("src/main/agent/tools/__tests__/subagents.test.ts",
          "resumes only a worker whose successful result belongs to the current task history"),
    "B": ("src/main/task/__tests__/work-commands.test.ts",
          "finds the latest interrupted root task independent of list order, including an unfinished governed queue"),
    "C": ("src/main/__tests__/events-handler.test.ts",
          "keeps the interrupted checkpoint intact when closing an ordinary session"),
    "D": ("src/main/task/__tests__/desktop-close.test.ts",
          "publishes only the owned changes, updates the handoff and preserves unrelated staging; repeated close is a no-op"),
    "E": ("src/main/task/__tests__/desktop-close.test.ts",
          "keeps a rejected commit and retries that same SHA after the remote accepts it"),
    "F": ("src/main/task/__tests__/workflow-turni-pilot.test.ts",
          "runs the Turni plan on two Git branches and resumes a manual validation in another chat"),
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path):
    return json.loads(path.read_bytes())


def passed_regressions(work):
    receipt = work / "vitest.json"
    files = sorted({filename for filename, _ in TESTS.values()})
    files.append("src/main/__tests__/general-knowledge.test.ts")
    subprocess.run(["node", "node_modules/vitest/vitest.mjs", "run", "--config", "vitest.config.node.ts",
                    "--no-color", "--reporter=json", "--outputFile", str(receipt), *files], cwd=ROOT,
                   env={**os.environ, "NODE_ENV": "test"}, check=True)
    suites = read_json(receipt)
    passed = set()
    for suite in suites["testResults"]:
        filename = Path(suite["name"]).relative_to(ROOT).as_posix()
        for test in suite["assertionResults"]:
            if test["status"] == "passed":
                passed.add((filename, test["title"]))
    qualified = {key for key, reference in TESTS.items() if reference in passed}
    if qualified != set(TESTS):
        raise ValueError(f"Test di riferimento mancanti: {set(TESTS) - qualified}")
    return qualified, suites["numPassedTests"]


def retrieve(work, model, cases):
    if sha(ARCHIVE.read_bytes()) != ARCHIVE_HASH:
        raise ValueError("Archivio storico diverso da quello del protocollo")
    with zipfile.ZipFile(ARCHIVE) as archive:
        for filename in ["confronto.mjs", "model-manifest.json", "sorgente-verificato/general-knowledge.ts"]:
            target = work / filename
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(filename))
        material = json.loads(archive.read("materiale.json"))
    source = ROOT / "src/main/general-knowledge.ts"
    if source.read_text(encoding="utf-8") != (work / "sorgente-verificato/general-knowledge.ts").read_text(encoding="utf-8"):
        raise ValueError("Il recupero corrente differisce dalla base di confronto")
    old_queries = {row[3].strip().casefold() for group in ["calibration", "test", "probe"] for row in material[group]}
    if any(case["query"].strip().casefold() in old_queries for case in cases):
        raise ValueError("Richiesta già usata nel confronto storico")
    for entry in read_json(work / "model-manifest.json")["files"]:
        original = model / entry["file"]
        if sha(original.read_bytes()) != entry["sha256"]:
            raise ValueError(f"Pesi diversi dal manifest: {original}")
        target = work / "model" / entry["file"]
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            os.link(original, target)
        except OSError:
            shutil.copyfile(original, target)
    material["test"] = [[case["id"], "-", "cieco", case["query"]] for case in cases]
    raw = json.dumps(material, ensure_ascii=False).encode("utf-8")
    (work / "materiale.json").write_bytes(raw)
    (work / "protocollo.sha256").write_text(sha(raw), encoding="ascii")
    with (work / "retrieval.log").open("w", encoding="utf-8") as log:
        subprocess.run(["node", str(work / "confronto.mjs")], cwd=ROOT, stdout=log, check=True)
    return read_json(work / "risultati.json")["test"]


def identifier(value):
    return isinstance(value, str) and bool(value.strip())


def different(observation, before, after):
    first, second = observation.get(before), observation.get(after)
    return identifier(first) and identifier(second) and first != second


def supports(lesson, obs):
    if lesson == "A":
        task = obs.get("requestedTask")
        workers = {w["workerId"] for w in obs.get("workers", []) if identifier(w.get("workerId"))
                   and w.get("active") is True and w.get("taskId") == task}
        return identifier(task) and len(workers) > 1
    if lesson == "B":
        return different(obs, "requestedTask", "selectedTask")
    if lesson == "C":
        return (identifier(obs.get("checkpointBefore")) and "checkpointAfter" in obs
                and (obs["checkpointAfter"] is None or different(obs, "checkpointBefore", "checkpointAfter")))
    if lesson == "D":
        fields = ["stagedBefore", "sessionFiles", "committedFiles"]
        if not all(isinstance(obs.get(k), list) and all(identifier(v) for v in obs[k]) for k in fields):
            return False
        staged, owned, committed = (set(obs[k]) for k in fields)
        return bool((staged - owned) & committed)
    if lesson == "E":
        return obs.get("firstPushAccepted") is False and different(obs, "retryOf", "retryCommit")
    if lesson == "F":
        return obs.get("displayedCheck") == "passed" and different(obs, "checkedBehavior", "currentBehavior")
    raise ValueError(lesson)


def checked(top, observation, qualified):
    eligible = [key for key in top[:3] if key in qualified and supports(key, observation)]
    return eligible[0] if len(eligible) == 1 else "-"


def assess(cases, rankings, qualified):
    rows = []
    for case, ranking in zip(cases, rankings, strict=True):
        if case["id"] != ranking["code"] or case["query"] != ranking["query"]:
            raise ValueError("Ordine del recupero discordante")
        lexical = ranking["native"]
        hybrid = [entry["id"] for entry in ranking["rank"]["hybrid"]]
        observation = case["observation"]
        picks = {"attuale": next(iter(lexical), "-"), "ibrida": hybrid[0], "ibridaSoglia19": ranking["picks"]["hybrid"],
                 "lessicaleVerificata": checked(lexical, observation, qualified),
                 "ibridaVerificata": checked(hybrid, observation, qualified)}
        for top in [lexical, hybrid]:
            if checked(top, {}, qualified) != "-" or checked(top, observation, set()) != "-":
                raise AssertionError("Suggerimento senza riscontro o senza test")
        rows.append({"id": case["id"], "expected": case["expected"], "evidenceExpected": case["evidenceExpected"],
                     "lessicale": lexical, "ibridaPrimeTre": hybrid[:3], "picks": picks})
    return rows


def scores(rows, label):
    totals = {}
    for method in rows[0]["picks"]:
        counts = dict(giuste=0, sbagliate=0, mancanti=0, falsiAllarmi=0, scartiCorretti=0)
        for row in rows:
            prediction, expected = row["picks"][method], row[label]
            if expected == "-":
                category = "scartiCorretti" if prediction == "-" else "falsiAllarmi"
            elif prediction == "-":
                category = "mancanti"
            else:
                category = "giuste" if prediction == expected else "sbagliate"
            counts[category] += 1
        totals[method] = counts
    return totals


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, default=ROOT / "lab/work/audit-memoria-it-01/model")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    cases = read_json(HERE / "casi.json")
    if not cases or len({r["id"] for r in cases}) != len(cases):
        raise ValueError("Identità di caso assenti o duplicate")
    work_root = ROOT / "lab/work"
    work_root.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="memoria-22-", dir=work_root) as temp:
        work = Path(temp)
        qualified, passed = passed_regressions(work)
        rows = assess(cases, retrieve(work, args.model.resolve(), cases), qualified)
    result = {"regressioniSuperate": passed, "proveCollegate": sorted(qualified),
              "conteggiPerIntento": scores(rows, "expected"), "conteggiPerRiscontro": scores(rows, "evidenceExpected"),
              "casi": rows}
    args.output.write_bytes((json.dumps(result, indent=2, ensure_ascii=False) + "\n").encode("utf-8"))
    print(json.dumps(result["conteggiPerIntento"], ensure_ascii=False))


if __name__ == "__main__":
    main()
