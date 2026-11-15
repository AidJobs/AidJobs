"""Role-content survey (W-54): Stage 2 deep layer, Option A (role-survey.md 19.19).

Run on the user's machine; CI runs only `check` and the tests:

  python tools/survey/deep.py draw [--family F|--all]
  python tools/survey/deep.py pretags [--family F|--all]
  python tools/survey/deep.py packets [--family F|--all]
  python tools/survey/deep.py check

Twenty adverts per wave-1a family, stratified by organisation type, level, language and source;
the AI test set is never drawn. Draws, pretags and packets stay in
survey-raw-archive/role-survey-reading/work/stage2/{family_id}/.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

import adverts
import roles
import validation as v

HERE = Path(__file__).resolve().parent
STAGE2 = adverts.WORK / "stage2"
N, ORG_MAX, BATCHES, GROUP = 20, 3, 4, 5
UNKNOWN_CAP = 3
AI_TEST = adverts.WORK / "ai-test-set.json"

FAMILIES = {
    "programme_management": {"prefix": "PM", "seed": 20261120, "french_min": 4},
    "meal": {"prefix": "ML", "seed": 20261121, "french_min": 4},
    "communications_advocacy": {"prefix": "CA", "seed": 20261122, "french_min": 3},
    "finance": {"prefix": "FN", "seed": 20261123, "french_min": 3},
}

SCORE_COLS = (
    "score_decision_facts", "score_readability", "score_length",
    "score_findability", "partial_score",
)


def utc_now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_rows(path: Path) -> list[dict]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def family_dir(family: str) -> Path:
    return STAGE2 / family


def cell_of(row: dict) -> tuple[str, str, bool, str]:
    """Stratum: (org_type, level, French, source)."""
    return (row.get("org_type") or "", row.get("level") or "unknown",
            row["language"] == "fr", row["source"])


def effective_french_min(pool: list[dict], french_min: int, n: int) -> int:
    fr = sum(1 for r in pool if r["language"] == "fr")
    if not pool:
        return 0
    want = max(french_min, round(n * fr / len(pool)))
    return min(want, fr)


def quotas(pool: list[dict], n: int = N, french_min: int = 4) -> dict:
    sizes = Counter(cell_of(r) for r in pool)
    n_fr = effective_french_min(pool, french_min, n)
    q_fr = v.allocate({c: sz for c, sz in sizes.items() if c[2]}, n_fr) if n_fr else {}
    q_en = v.allocate({c: sz for c, sz in sizes.items() if not c[2]}, n - n_fr)
    return q_fr | q_en


def draw_sample(
    pool: list[dict],
    seed: int,
    n: int = N,
    french_min: int = 4,
    org_max: int = ORG_MAX,
) -> list[dict]:
    q = quotas(pool, n, french_min)
    rng = random.Random(seed)
    order = {}
    for c in sorted(q, key=str):
        cell = [r for r in pool if cell_of(r) == c]
        rng.shuffle(cell)
        order[c] = cell
    chosen, ids, per_org = [], set(), Counter()
    unknown_n = 0

    def take(c, k: int) -> int:
        nonlocal unknown_n
        got = 0
        while got < k:
            cands = [r for r in order[c] if r["advert_id"] not in ids and per_org[r["org_id"]] < org_max]
            if unknown_n >= UNKNOWN_CAP:
                cands = [r for r in cands if (r.get("level") or "unknown") != "unknown"]
            if not cands:
                break
            low = min(per_org[r["org_id"]] for r in cands)
            r = next(r for r in cands if per_org[r["org_id"]] == low)
            chosen.append(r)
            ids.add(r["advert_id"])
            per_org[r["org_id"]] += 1
            if (r.get("level") or "unknown") == "unknown":
                unknown_n += 1
            got += 1
        return got

    short = Counter()
    for c in sorted(q, key=str):
        short[c[2]] += q[c] - take(c, q[c])
    for group, k in sorted(short.items()):
        for c in sorted((c for c in q if c[2] == group), key=lambda c: (-len(order[c]), str(c))):
            if k <= 0:
                break
            k -= take(c, k)
        if k:
            raise SystemExit(f"draw: {k} places could not be filled within the caps for this family")
    return chosen


def draw_problems(
    chosen: list[dict],
    pool: list[dict],
    exclude: set[str],
    french_min: int,
) -> list[str]:
    problems = []
    by_id = {r["advert_id"]: r for r in pool}
    if len(chosen) != N or len({r["advert_id"] for r in chosen}) != N:
        problems.append(f"{len(chosen)} adverts drawn, not {N} distinct ones")
    if any(r["advert_id"] in exclude for r in chosen):
        problems.append("an advert of the AI test set was drawn")
    if any(by_id.get(r["advert_id"], {}).get("held_out") != "false" for r in chosen):
        problems.append("a held-out advert was drawn")
    fr_have = sum(1 for r in chosen if r["language"] == "fr")
    fr_want = min(effective_french_min(pool, french_min, N), sum(1 for r in pool if r["language"] == "fr"))
    if fr_want and fr_have < fr_want:
        problems.append(f"fewer than {fr_want} French adverts (pool allows {fr_want})")
    if max(Counter(r["org_id"] for r in chosen).values(), default=0) > ORG_MAX:
        problems.append(f"more than {ORG_MAX} adverts from one organisation")
    unk = sum(1 for r in chosen if (r.get("level") or "unknown") == "unknown")
    if unk > UNKNOWN_CAP:
        problems.append(f"more than {UNKNOWN_CAP} adverts at level unknown")
    return problems


def codes_for(chosen: list[dict], prefix: str, seed: int) -> dict[str, dict]:
    order = sorted(chosen, key=lambda r: r["advert_id"])
    random.Random(seed + 1).shuffle(order)
    out = {}
    for i, r in enumerate(order, 1):
        code = f"{prefix}{i:02d}"
        batch = f"batch-{(i - 1) // GROUP + 1}"
        out[code] = {
            "advert_id": r["advert_id"],
            "batch": batch,
            "org_id": r["org_id"],
            "org_type": r.get("org_type", ""),
            "level": r.get("level", "unknown"),
            "source": r["source"],
            "system": r["system"],
            "french": r["language"] == "fr",
        }
    return out


def family_pool(rows: list[dict], family: str, exclude: set[str]) -> list[dict]:
    return sorted(
        (r for r in rows if r["family_id"] == family and r["held_out"] == "false" and r["advert_id"] not in exclude),
        key=lambda r: r["advert_id"],
    )


def draw_one(family: str, rows: list[dict], exclude: set[str]) -> int:
    cfg = FAMILIES[family]
    path = family_dir(family) / "draw.json"
    if path.exists():
        print(f"draw {family}: refused — {path} already exists (sealed)")
        return 1
    pool = family_pool(rows, family, exclude)
    if len(pool) < N:
        print(f"draw {family}: pool holds {len(pool)} adverts, need {N}")
        return 1
    chosen = draw_sample(pool, cfg["seed"], french_min=cfg["french_min"])
    problems = draw_problems(chosen, pool, exclude, cfg["french_min"])
    if problems:
        for p in problems:
            print(p)
        return 1
    family_dir(family).mkdir(parents=True, exist_ok=True)
    codes = codes_for(chosen, cfg["prefix"], cfg["seed"])
    ai_sha = sha256(AI_TEST) if AI_TEST.exists() else ""
    path.write_text(json.dumps({
        "made_at": utc_now(),
        "family_id": family,
        "seed": cfg["seed"],
        "french_min": cfg["french_min"],
        "n": N,
        "drawn_from": sha256(roles.ROLES / "broad-adverts.csv"),
        "ai_test_sha256": ai_sha,
        "codes": codes,
    }, indent=1), encoding="utf-8")
    fr = sum(c["french"] for c in codes.values())
    orgs = len({c["org_id"] for c in codes.values()})
    ot = dict(Counter(c["org_type"] for c in codes.values()))
    lv = dict(Counter(c["level"] for c in codes.values()))
    print(f"draw {family}: {len(codes)} adverts at {orgs} organisations; French {fr}; org_type {ot}; level {lv}")
    return 0


def load_draw(family: str) -> dict[str, dict]:
    path = family_dir(family) / "draw.json"
    if not path.exists():
        raise SystemExit(f"{family}: draw.json is missing; run draw first")
    saved = json.loads(path.read_text(encoding="utf-8"))
    if AI_TEST.exists() and saved.get("ai_test_sha256") and saved["ai_test_sha256"] != sha256(AI_TEST):
        raise SystemExit(f"{family}: ai-test-set.json changed after the draw")
    return saved["codes"]


def draw(args) -> int:
    rows = read_rows(roles.ROLES / "broad-adverts.csv")
    exclude = v.test_set_ids()
    families = list(FAMILIES) if getattr(args, "all", False) else [args.family]
    bad = 0
    for fam in families:
        bad += draw_one(fam, rows, exclude)
    return bad


def sections_summary(advert_id: str, sec_rows: list[dict]) -> list[dict]:
    return [
        {"position": int(r["position"]), "section_type": r["section_type"], "words": int(r["words"])}
        for r in sec_rows if r["advert_id"] == advert_id
    ]


def pretag_record(
    code: str,
    family: str,
    row: dict,
    ad: dict,
    sec_rows: list[dict],
) -> dict:
    secs = adverts.sections_of(ad["lines"], ad.get("title", ""))
    text = "\n".join(ln["text"] for ln in ad["lines"])
    req_text = "\n".join(
        "\n".join(s["lines"]) for s in secs if s["type"] in ("essential_requirements", "desirable_requirements")
    ) or text
    duties = adverts.duty_lines(ad)
    spec = [{"line": ln, "score": sc, "kinds": kinds}
            for ln, (sc, kinds) in ((d, adverts.specificity(d)) for d in duties)]
    y_min, y_alt = adverts.years_required(secs, text)
    rec = {
        "id": row["advert_id"],
        "code": code,
        "family_id": family,
        "lines": [
            {"n": i, "text": ln["text"], "heading": bool(ln.get("heading")), "tag": ln.get("tag") or ""}
            for i, ln in enumerate(ad["lines"], 1)
        ],
        "sections": sections_summary(row["advert_id"], sec_rows),
        "duty_lines": duties,
        "specificity": spec,
        "years_required": {"min": y_min, "alt": y_alt},
        "degree_asked": adverts.degree_asked(req_text),
        "verbs": [],
        "places": [],
        "language": row.get("language", ""),
        "org_type": row.get("org_type", ""),
        "level": row.get("level", "unknown"),
        "source": row.get("source", ""),
        "system": row.get("system", ""),
    }
    for col in SCORE_COLS:
        if col in row:
            rec[col] = row[col]
    return rec


def pretags_one(family: str, rows_by_id: dict, sec_rows: list[dict], ads: dict[str, dict]) -> int:
    codes = load_draw(family)
    path = family_dir(family) / "pretags.jsonl"
    missing = [c["advert_id"] for c in codes.values() if c["advert_id"] not in ads]
    if missing:
        print(f"pretags {family}: {len(missing)} drawn adverts are not among the measured ones")
        return 1
    lines = []
    for code in sorted(codes):
        aid = codes[code]["advert_id"]
        row = rows_by_id.get(aid, {})
        lines.append(pretag_record(code, family, row, ads[aid], sec_rows))
    path.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in lines) + "\n", encoding="utf-8")
    print(f"pretags {family}: {len(lines)} records -> {path}")
    return 0


def pretags(args) -> int:
    families = list(FAMILIES) if getattr(args, "all", False) else [args.family]
    rows_by_id = {r["advert_id"]: r for r in read_rows(roles.ROLES / "broad-adverts.csv")}
    sec_rows = read_rows(roles.ROLES / "broad-sections.csv")
    measured = {a["id"]: a for a in adverts.measured_adverts()["adverts"]}
    return sum(pretags_one(fam, rows_by_id, sec_rows, measured) for fam in families)


def packet_with_type(vid: str, ad: dict, org_type: str) -> tuple[str, int]:
    text, n = v.packet_text(vid, ad, "", v.CHUNK)
    if not org_type:
        return text, n
    out = []
    inserted = False
    for ln in text.splitlines(keepends=True):
        out.append(ln)
        if not inserted and ln.startswith("Title:"):
            out.append(f"Type: {org_type}\n")
            inserted = True
    return "".join(out), n


def packets_one(family: str) -> int:
    codes = load_draw(family)
    ads = {a["id"]: a for a in adverts.measured_adverts()["adverts"]}
    missing = [c["advert_id"] for c in codes.values() if c["advert_id"] not in ads]
    if missing:
        print(f"packets {family}: {len(missing)} drawn adverts are not among the measured ones")
        return 1
    packets_dir = family_dir(family) / "packets"
    packets_dir.mkdir(parents=True, exist_ok=True)
    by_batch: dict[str, list[str]] = {}
    index = {}
    for vid in sorted(codes):
        ad = ads[codes[vid]["advert_id"]]
        text, n = packet_with_type(vid, ad, codes[vid].get("org_type", ""))
        by_batch.setdefault(codes[vid]["batch"], []).append(text)
        index[vid] = {
            "batch": codes[vid]["batch"],
            "lines": n,
            "advert_id": codes[vid]["advert_id"],
            "org_type": codes[vid].get("org_type", ""),
        }
    for batch, parts in sorted(by_batch.items()):
        (packets_dir / f"{batch}.txt").write_text("\n".join(parts), encoding="utf-8")
    (packets_dir / "index.json").write_text(json.dumps(index, indent=1), encoding="utf-8")
    print(f"packets {family}: { {b: len(p) for b, p in sorted(by_batch.items())} }")
    return 0


def packets(args) -> int:
    families = list(FAMILIES) if getattr(args, "all", False) else [args.family]
    return sum(packets_one(fam) for fam in families)


def check_draw(family: str, rows: list[dict], exclude: set[str]) -> list[str]:
    problems = []
    path = family_dir(family) / "draw.json"
    if not path.exists():
        return [f"{family}: draw.json is missing"]
    saved = json.loads(path.read_text(encoding="utf-8"))
    if AI_TEST.exists():
        got = sha256(AI_TEST)
        rec = saved.get("ai_test_sha256", "")
        if rec and rec != got:
            problems.append(f"{family}: ai-test-set sha256 changed ({rec[:12]}… != {got[:12]}…)")
    codes = saved.get("codes", {})
    if len(codes) != N:
        problems.append(f"{family}: {len(codes)} codes, not {N}")
    aids = [c["advert_id"] for c in codes.values()]
    if len(aids) != len(set(aids)):
        problems.append(f"{family}: duplicate advert ids in draw")
    pool = family_pool(rows, family, exclude)
    by_id = {r["advert_id"]: r for r in pool}
    chosen = [by_id[aid] for aid in aids if aid in by_id]
    if len(chosen) != N:
        problems.append(f"{family}: drawn ids not all in family pool")
    cfg = FAMILIES[family]
    problems += draw_problems(chosen, pool, exclude, cfg["french_min"])
    packets_dir = family_dir(family) / "packets"
    if packets_dir.is_dir():
        idx = packets_dir / "index.json"
        if not idx.exists():
            problems.append(f"{family}: packets/index.json missing")
        else:
            index = json.loads(idx.read_text(encoding="utf-8"))
            for i in range(1, BATCHES + 1):
                bt = f"batch-{i}"
                if not (packets_dir / f"{bt}.txt").exists():
                    problems.append(f"{family}: packets/{bt}.txt missing")
            if len(index) != N:
                problems.append(f"{family}: packet index has {len(index)} adverts, not {N}")
    return problems


def check(_args=None) -> int:
    """Validate frozen draws when the archive is present; CI without stage2/ only checks module constants."""
    problems = []
    if list(FAMILIES) != [
        "programme_management", "meal", "communications_advocacy", "finance",
    ]:
        problems.append("FAMILIES drifted from wave 1a")
    any_draw = any((family_dir(f) / "draw.json").exists() for f in FAMILIES)
    if any_draw or STAGE2.exists():
        rows = read_rows(roles.ROLES / "broad-adverts.csv")
        exclude = v.test_set_ids()
        for fam in FAMILIES:
            problems += check_draw(fam, rows, exclude)
    for p in problems[:80]:
        print(p)
    print(f"check: {len(problems)} problems")
    return 1 if problems else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_draw = sub.add_parser("draw")
    p_draw.add_argument("--family", choices=sorted(FAMILIES))
    p_draw.add_argument("--all", action="store_true")
    p_pt = sub.add_parser("pretags")
    p_pt.add_argument("--family", choices=sorted(FAMILIES))
    p_pt.add_argument("--all", action="store_true")
    p_pk = sub.add_parser("packets")
    p_pk.add_argument("--family", choices=sorted(FAMILIES))
    p_pk.add_argument("--all", action="store_true")
    sub.add_parser("check")
    args = parser.parse_args(argv)
    if args.cmd in ("draw", "pretags", "packets") and not args.all and not args.family:
        parser.error(f"{args.cmd} needs --family or --all")
    return {"draw": draw, "pretags": pretags, "packets": packets, "check": check}[args.cmd](args)


if __name__ == "__main__":
    sys.path.insert(0, str(HERE))
    raise SystemExit(main())
