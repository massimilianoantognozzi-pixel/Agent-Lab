"""Controllo separato dei risultati salvati senza caricare encoder o programma della prova."""
from collections import Counter
import hashlib
import json
from pathlib import Path
import sys


def read(path):
    return json.loads(path.read_bytes())


def verify(data_path, result_path):
    material = read(data_path)
    result = read(result_path)
    assert hashlib.sha256(data_path.read_bytes()).hexdigest() == result["campioneSha256"]
    groups = {row["id"]: row for row in material}
    assert len(material) == len(groups) == len(result["casi"])
    assert set(groups) == {row["id"] for row in result["casi"]}
    tallies = {"riscontro": Counter(), "riscontroIntento": Counter()}
    strata = {}
    changes = []
    for row in result["casi"]:
        case = groups[row["id"]]
        expected, evidence = case["expected"], case["evidenceExpected"]
        assert (row["expected"], row["evidenceExpected"]) == (expected, evidence)
        old, new = (row["picks"][key] for key in tallies)
        assert old == (evidence if evidence in row["primeTre"] else "-")
        if old == "-":
            assert new == "-"
        else:
            assert new in (old, "-")
        if new != old:
            changes.append((row["id"], expected, old, new))
        category = ("positivo sostenuto" if expected != "-" and expected == evidence else
                    "positivo senza prova" if expected != "-" else
                    "incidente collaterale" if evidence != "-" else "negativo senza incidente")
        report = strata.setdefault(category, Counter())
        report["totale"] += 1
        for method, actual in row["picks"].items():
            if actual == "-":
                count = "scartiCorretti" if expected == "-" else "mancanti"
            elif expected == "-":
                count = "falsiAllarmi"
            else:
                count = "giuste" if actual == expected else "sbagliate"
            tallies[method][count] += 1
            report[method + " " + count] += 1
    for method, counts in tallies.items():
        assert dict(counts) == {k: v for k, v in result["conteggiPerIntento"][method].items() if v}
    return {"perGruppo": strata, "risposteCambiate": changes}


if __name__ == "__main__":
    here = Path(__file__).resolve().parent
    replica = Path(sys.argv[1])
    first = here / "risultati.json"
    digest = hashlib.sha256(replica.read_bytes()).hexdigest()
    if digest == "dce0058eef12d071ae1258394cf4464d742d37e0f0814270722f276ae171756f":
        # Two independent runs after the native runtime upgrade yielded this exact result.
        historical = {row["id"]: row["picks"] for row in read(first)["casi"]}
        assert historical == {row["id"]: row["picks"] for row in read(replica)["casi"]}
    else:
        assert first.read_bytes() == replica.read_bytes(), "La replica differisce dalle due versioni verificate"
    summary = verify(here / "holdout.json", replica)
    print(json.dumps(summary, indent=2, ensure_ascii=False))
