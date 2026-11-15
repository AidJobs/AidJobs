"""Role-content survey (W-54): Phase 0 scoring guide pilot (role-survey.md section 5 and 19.19).

Run on the user's machine; CI runs only `check` and the tests:

  python tools/survey/phase0.py draw        # freeze P01–P20 from work/ai-test-set.json (no redraw)
  python tools/survey/phase0.py packets     # four packets of five, long lines in pieces
  python tools/survey/phase0.py answers FILE  # one coder's answers, form-checked
  python tools/survey/phase0.py agreement   # exact agreement and quadratic weighted kappa
  python tools/survey/phase0.py disagreements
  python tools/survey/phase0.py reconcile   # seal reconciled.json once made
  python tools/survey/phase0.py check       # committed guide + form (CI)

Packets, answers, the reconciled set and the working guide copy stay in
survey-raw-archive/role-survey-reading/work/phase0/. The committed guide is
docs/architecture/role-survey/scoring-guide.md. Coders are read-only agents; copy
their JSON lines with take_answers.py from this chat's transcript folder.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

import adverts
import validation as v

HERE = Path(__file__).resolve().parent
ROLES = HERE.parent.parent / "docs" / "architecture" / "role-survey"
GUIDE_COMMITTED = ROLES / "scoring-guide.md"
WORK = adverts.WORK / "phase0"
PACKETS = WORK / "packets"
ANSWERS = WORK / "answers"
AI_TEST = adverts.WORK / "ai-test-set.json"
CHUNK = 1500
GROUP = 5

SCORE_KEYS = (
    "decision_facts", "specificity", "realistic_must_haves", "clear_outcomes",
    "field_realism", "fairness", "readability", "right_length", "findability",
)
WEIGHTS = {
    "decision_facts": 20, "specificity": 15, "realistic_must_haves": 15, "clear_outcomes": 10,
    "field_realism": 10, "fairness": 10, "readability": 10, "right_length": 5, "findability": 5,
}
ANSWER_KEYS = set(SCORE_KEYS) | {"id", "note"}
TARGETS = {"exact": 0.70, "kappa": 0.60}


def utc_now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pilot_ids() -> list[str]:
    data = json.loads(AI_TEST.read_text(encoding="utf-8"))
    pilot = data["pilot"]
    if len(pilot) != 20 or len(set(pilot)) != 20:
        raise SystemExit(f"ai-test-set pilot must be 20 unique ids, got {len(pilot)}")
    return list(pilot)


def codes_of(pilot: list[str]) -> dict[str, dict]:
    """P01–P20 in pilot order; batches of five (batch-1 … batch-4)."""
    codes = {}
    for i, advert_id in enumerate(pilot, 1):
        vid = f"P{i:02d}"
        batch = f"batch-{(i - 1) // GROUP + 1}"
        codes[vid] = {"advert_id": advert_id, "batch": batch, "index": i}
    return codes


def draw(_args=None) -> int:
    WORK.mkdir(parents=True, exist_ok=True)
    path = WORK / "draw.json"
    if path.exists():
        saved = json.loads(path.read_text(encoding="utf-8"))
        want = codes_of(pilot_ids())
        if saved.get("codes") != want:
            print("draw: refused — existing draw.json does not match ai-test-set.json pilot")
            return 1
        print(f"draw: already frozen ({len(want)} adverts)")
        return 0
    pilot = pilot_ids()
    measured = {a["id"] for a in adverts.load_adverts()}
    missing = [i for i in pilot if i not in measured]
    if missing:
        print(f"draw: {len(missing)} pilot ids have no local advert: {missing[:3]}")
        return 1
    codes = codes_of(pilot)
    path.write_text(json.dumps({
        "made_at": utc_now(),
        "source": "ai-test-set.json#pilot",
        "ai_test_sha256": sha256(AI_TEST),
        "codes": codes,
    }, indent=1), encoding="utf-8")
    print(f"draw: froze {len(codes)} adverts in {GROUP}-advert batches "
          f"{sorted({c['batch'] for c in codes.values()})}")
    return 0


def load_draw() -> dict[str, dict]:
    path = WORK / "draw.json"
    if not path.exists():
        raise SystemExit("draw.json is missing; run draw first")
    saved = json.loads(path.read_text(encoding="utf-8"))
    want = codes_of(pilot_ids())
    if saved.get("codes") != want:
        raise SystemExit("draw.json does not match the fixed ai-test-set pilot; do not redraw")
    if saved.get("ai_test_sha256") and saved["ai_test_sha256"] != sha256(AI_TEST):
        raise SystemExit("ai-test-set.json changed after the draw; refuse to continue")
    return saved["codes"]


def org_types() -> dict[str, str]:
    """advert_id -> org_type from the committed broad file (counts/categories only)."""
    path = ROLES / "broad-adverts.csv"
    if not path.exists():
        return {}
    with path.open(encoding="utf-8", newline="") as f:
        return {r["advert_id"]: r.get("org_type", "") for r in csv.DictReader(f)}


def packet_with_type(vid: str, ad: dict, org_type: str) -> tuple[str, int]:
    """Packet text with a Type: line when the organisation type is known (guide must-fix 7)."""
    text, n = v.packet_text(vid, ad, "", CHUNK)
    if not org_type:
        return text, n
    lines = text.splitlines(keepends=True)
    out = []
    inserted = False
    for ln in lines:
        out.append(ln)
        if not inserted and ln.startswith("Title:"):
            out.append(f"Type: {org_type}\n")
            inserted = True
    return "".join(out), n


def packets(_args=None) -> int:
    codes = load_draw()
    ads = {a["id"]: a for a in adverts.measured_adverts()["adverts"]}
    missing = [c["advert_id"] for c in codes.values() if c["advert_id"] not in ads]
    if missing:
        print(f"packets: {len(missing)} drawn adverts are not among the measured ones")
        return 1
    types = org_types()
    PACKETS.mkdir(parents=True, exist_ok=True)
    by_batch: dict[str, list[str]] = {}
    index = {}
    for vid in sorted(codes):
        ad = ads[codes[vid]["advert_id"]]
        org_type = types.get(codes[vid]["advert_id"], "")
        text, n = packet_with_type(vid, ad, org_type)
        by_batch.setdefault(codes[vid]["batch"], []).append(text)
        index[vid] = {"batch": codes[vid]["batch"], "lines": n, "advert_id": codes[vid]["advert_id"],
                      "org_type": org_type}
    for batch, parts in sorted(by_batch.items()):
        (PACKETS / f"{batch}.txt").write_text("\n".join(parts), encoding="utf-8")
    (PACKETS / "index.json").write_text(json.dumps(index, indent=1), encoding="utf-8")
    # Working copy of the guide for coders (same text as committed when present).
    if GUIDE_COMMITTED.exists():
        (WORK / "guide.md").write_text(GUIDE_COMMITTED.read_text(encoding="utf-8"), encoding="utf-8")
    print(f"packets: { {b: len(p) for b, p in sorted(by_batch.items())} }")
    return 0


def score_ok(key: str, val) -> bool:
    if key == "field_realism":
        return val is None or (isinstance(val, int) and not isinstance(val, bool) and val in (0, 1, 2, 3))
    return isinstance(val, int) and not isinstance(val, bool) and val in (0, 1, 2, 3)


def answer_problems(a: dict, expected: set[str]) -> list[str]:
    vid = a.get("id", "?")
    missing, unknown = ANSWER_KEYS - {"note"} - set(a), set(a) - ANSWER_KEYS
    if missing or unknown:
        return [f"{vid}: keys missing {sorted(missing)}, unknown {sorted(unknown)}"]
    p = []
    if vid not in expected:
        p.append(f"{vid}: not an advert of this draw")
    for k in SCORE_KEYS:
        if not score_ok(k, a.get(k)):
            p.append(f"{vid}: {k} must be 0–3"
                     + (" or null" if k == "field_realism" else ""))
    note = a.get("note")
    if note is not None and (not isinstance(note, str) or len(note.split()) > 40):
        p.append(f"{vid}: note must be a string of at most 40 words")
    return p


def load_answers(path: Path) -> list[dict]:
    rows = []
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line:
            continue
        rows.append(json.loads(line))
    return rows


def answers(args) -> int:
    path = Path(args.file)
    codes = load_draw()
    rows = load_answers(path)
    problems = []
    seen = []
    for a in rows:
        problems += answer_problems(a, set(codes))
        seen.append(a.get("id"))
    if len(seen) != len(set(seen)):
        problems.append("duplicate advert ids in the answers file")
    want = sorted(codes)
    if sorted(x for x in seen if x in codes) != want and set(seen) >= set(want):
        pass  # full set present, order checked only as warning
    if set(seen) != set(want):
        problems.append(f"expected ids {want}, got {sorted(seen)}")
    for p in problems:
        print(p)
    print(f"answers: {len(rows)} rows, {len(problems)} problems")
    return 1 if problems else 0


def coder_answers(name: str) -> dict[str, dict]:
    path = ANSWERS / f"{name}.jsonl"
    if not path.exists():
        raise SystemExit(f"answers/{name}.jsonl is missing")
    rows = load_answers(path)
    problems = [q for a in rows for q in answer_problems(a, set(load_draw()))]
    if problems:
        raise SystemExit("coder answers refused: " + "; ".join(problems[:5]))
    return {a["id"]: a for a in rows}


def quadratic_weighted_kappa(a: list, b: list) -> float | None:
    """Ordinal 0–3 quadratic weighted kappa; None when undefined (no pairs or pe = 1)."""
    pairs = [(x, y) for x, y in zip(a, b, strict=True) if x is not None and y is not None]
    n = len(pairs)
    if not n:
        return None
    cats = (0, 1, 2, 3)
    w = {(i, j): ((i - j) ** 2) / 9 for i in cats for j in cats}
    obs = Counter((x, y) for x, y in pairs)
    ca, cb = Counter(x for x, _ in pairs), Counter(y for _, y in pairs)
    po = sum(w[i, j] * obs[i, j] for i, j in obs) / n
    pe = sum(w[i, j] * (ca[i] * cb[j]) for i in cats for j in cats) / (n * n)
    # Convert disagreement weights into agreement form: kappa = 1 - po/pe for weighted disagreement.
    # Standard QWK uses observed and expected weighted disagreement.
    if pe == 0:
        return 1.0 if po == 0 else None
    return 1.0 - (po / pe)


def agreement_of(key: str, a: dict[str, dict], b: dict[str, dict], ids: list[str]) -> dict:
    va = [a[i][key] for i in ids]
    vb = [b[i][key] for i in ids]
    if key == "field_realism":
        # Both null: agree; one null: disagree; both scored: compare.
        exact_n = sum(
            (x is None and y is None) or (x is not None and y is not None and x == y)
            for x, y in zip(va, vb, strict=True)
        )
        exact = exact_n / len(ids) if ids else None
        scored_a = [x for x, y in zip(va, vb, strict=True) if x is not None and y is not None]
        scored_b = [y for x, y in zip(va, vb, strict=True) if x is not None and y is not None]
        return {
            "exact": exact,
            "kappa": quadratic_weighted_kappa(scored_a, scored_b),
            "scored_pairs": len(scored_a),
            "null_mismatch": sum((x is None) != (y is None) for x, y in zip(va, vb, strict=True)),
        }
    exact = sum(x == y for x, y in zip(va, vb, strict=True)) / len(ids) if ids else None
    return {"exact": exact, "kappa": quadratic_weighted_kappa(va, vb)}


def agreement(_args=None) -> int:
    codes, a, b = load_draw(), coder_answers("a"), coder_answers("b")
    ids = sorted(i for i in codes if i in a and i in b)
    if len(ids) != len(codes):
        print(f"agreement: only {len(ids)} of {len(codes)} adverts have both coders")
    table = {k: agreement_of(k, a, b, ids) for k in SCORE_KEYS}
    out = {"adverts": len(ids), "targets": TARGETS, "dimensions": table}
    low = [k for k, r in table.items()
           if (r["exact"] is not None and r["exact"] < TARGETS["exact"])
           or (r["kappa"] is not None and r["kappa"] < TARGETS["kappa"])]
    (WORK / "agreement.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(f"agreement: {len(ids)} adverts; below target on {len(low)}: "
          + ", ".join(f"{k} exact={table[k]['exact']} kappa={table[k]['kappa']}" for k in low))
    for k, r in table.items():
        print(f"  {k}: exact={r['exact']}, kappa={r['kappa']}")
    return 0


def disagreements(_args=None) -> int:
    codes, a, b = load_draw(), coder_answers("a"), coder_answers("b")
    ids = sorted(i for i in codes if i in a and i in b)
    rows = []
    for i in ids:
        for k in SCORE_KEYS:
            if a[i][k] != b[i][k]:
                rows.append({
                    "id": i, "dimension": k,
                    "coder_a": "" if a[i][k] is None else a[i][k],
                    "coder_b": "" if b[i][k] is None else b[i][k],
                    "decision": "", "reason": "",
                })
    path = WORK / "disagreements.csv"
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["id", "dimension", "coder_a", "coder_b", "decision", "reason"])
        w.writeheader()
        w.writerows(rows)
    print(f"disagreements: {len(rows)} cells across {len({r['id'] for r in rows})} adverts")
    return 0


def reconcile(_args=None) -> int:
    """Seal the reconciled set. Refuses if already sealed, or if decisions are incomplete."""
    seal = WORK / "reconciled.sha256"
    out = WORK / "reconciled.json"
    if seal.exists():
        if not out.exists() or sha256(out) != seal.read_text(encoding="utf-8").strip():
            print("reconcile: seal does not match reconciled.json")
            return 1
        print("reconcile: already sealed; sealed sets are never edited")
        return 0
    codes, a, b = load_draw(), coder_answers("a"), coder_answers("b")
    path = WORK / "disagreements.csv"
    if not path.exists():
        print("reconcile: disagreements.csv missing; run disagreements first")
        return 1
    decisions = list(csv.DictReader(path.open(encoding="utf-8")))
    pending = [d for d in decisions if d.get("decision", "").strip() == ""]
    if pending:
        print(f"reconcile: {len(pending)} disagreements still have an empty decision")
        return 1
    by = {(d["id"], d["dimension"]): d for d in decisions}
    rows = []
    for i in sorted(codes):
        if i not in a or i not in b:
            print(f"reconcile: missing coder answers for {i}")
            return 1
        row = {"id": i}
        for k in SCORE_KEYS:
            if a[i][k] == b[i][k]:
                row[k] = a[i][k]
            else:
                d = by.get((i, k))
                if not d:
                    print(f"reconcile: no decision row for {i}/{k}")
                    return 1
                raw = d["decision"].strip()
                if raw.lower() in ("null", "none", "n/a"):
                    val = None
                else:
                    val = int(raw)
                if not score_ok(k, val):
                    print(f"reconcile: bad decision for {i}/{k}: {raw!r}")
                    return 1
                row[k] = val
        rows.append(row)
    out.write_text(json.dumps({"made_at": utc_now(), "adverts": rows}, indent=1), encoding="utf-8")
    seal.write_text(sha256(out) + "\n", encoding="utf-8")
    print(f"reconcile: sealed {len(rows)} adverts; sha256 {seal.read_text(encoding='utf-8').strip()[:12]}…")
    return 0


def check(_args=None) -> int:
    problems = []
    if not GUIDE_COMMITTED.exists():
        problems.append(f"missing {GUIDE_COMMITTED}")
    else:
        text = GUIDE_COMMITTED.read_text(encoding="utf-8")
        for k in SCORE_KEYS:
            if f"`{k}`" not in text and k not in text:
                problems.append(f"guide does not name {k}")
        if "Version 1" not in text:
            problems.append("guide lacks Version 1 stamp")
    if AI_TEST.exists():
        try:
            pilot_ids()
        except SystemExit as e:
            problems.append(str(e))
    for p in problems:
        print(p)
    print(f"check: {len(problems)} problems")
    return 1 if problems else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("draw")
    sub.add_parser("packets")
    p_ans = sub.add_parser("answers")
    p_ans.add_argument("file")
    sub.add_parser("agreement")
    sub.add_parser("disagreements")
    sub.add_parser("reconcile")
    sub.add_parser("check")
    args = parser.parse_args(argv)
    return {
        "draw": draw, "packets": packets, "answers": answers, "agreement": agreement,
        "disagreements": disagreements, "reconcile": reconcile, "check": check,
    }[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
