"""Role-content survey (W-54): the broad layer's validation sample of 100 (role-survey.md 19.3 and 19.16).

Run on the user's machine; CI runs only `check` and the tests:

  python tools/survey/validation.py draw           # the sample of 100, by fixed seed, frozen once made
  python tools/survey/validation.py packets        # the coders' packets: each advert's text under a neutral id
  python tools/survey/validation.py guide          # the coding guide names every category the script uses
  python tools/survey/validation.py answers FILE   # one coder's answers checked against the guide's form
  python tools/survey/validation.py agreement      # the two coders' agreement per measure
  python tools/survey/validation.py disagreements  # the items the coders answered differently, to settle
  python tools/survey/validation.py reconcile      # the reconciled set, frozen once made
  python tools/survey/validation.py score          # the script against the reconciled set -> broad-validation.csv
  python tools/survey/validation.py recheck        # an earlier round re-scored on today's rules (local only)
  python tools/survey/validation.py check          # every round's committed file, its form (CI)

Each command takes `--round N` (default 1). Round 1 (19.16) drew 100 adverts by seed 20261113 and
validated the rules as they stood; round 2 (19.17) draws 100 fresh adverts by seed 20261114, never
an earlier round's or the AI test set's, after the revised rules are frozen, and is coded on the same
frozen guide (version 1.1) with no pilot.

Two coders, read-only agents of different model families, code each advert's cleaned text (the text
`adverts.py measure` read, site furniture removed) with the guide, never seeing the script's answers
or each other's. Their answers, the guide, the packets and the reconciled set stay in
survey-raw-archive/role-survey-reading/work/validation/ (round 2: validation-2/); the committed files
hold counts only.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import random
import re
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path

import adverts
import roles

HERE = Path(__file__).resolve().parent
ROUNDS = {1: {"seed": 20261113, "folder": "validation", "first_id": 1, "pilot": True, "batches": 4,
              "output": "broad-validation.csv"},
          2: {"seed": 20261114, "folder": "validation-2", "first_id": 101, "pilot": False, "batches": 5,
              "output": "broad-validation-2.csv"}}
ROUND1_COMMIT = "d62f97e"          # the commit whose broad-adverts.csv round 1 was drawn from
FROZEN_GUIDE = "6e31517863d07cac8b21875401d973ddb17a06f8dab4045ffa61425d786ad3de"   # guide 1.1, as reconciled
RULE_FILES = ("adverts.py", "advert_set.py", "roles.py")
STRATA = ("advert_id", "held_out", "org_id", "source", "system", "language")
CHUNK = 1500                       # characters per piece of a long line in a packet

ROUND = 1
VALID = adverts.WORK / "validation"
PACKETS = VALID / "packets"
ANSWERS = VALID / "answers"
OUTPUT = roles.ROLES / "broad-validation.csv"

SEED = 20261113
SAMPLE, FRENCH_MIN, ORG_MAX = 100, 20, 3
BIG_SYSTEM, SYSTEM_FLOOR = 50, 3   # every system with 50 or more adverts has at least 3 in the sample
PILOT, BATCHES = 10, 4


def use_round(n: int) -> None:
    """Point the commands at round `n`: its seed, folder and committed file."""
    global ROUND, VALID, PACKETS, ANSWERS, OUTPUT, SEED
    cfg = ROUNDS[n]
    ROUND, SEED = n, cfg["seed"]
    VALID = adverts.WORK / cfg["folder"]
    PACKETS, ANSWERS, OUTPUT = VALID / "packets", VALID / "answers", roles.ROLES / cfg["output"]
MIN_POSITIVES = 15
TARGET_PRECISION, TARGET_RECALL, TARGET_YEARS = 0.9, 0.85, 0.9

# The categories the coders use are the script's own, so the answers can be compared.
SECTION_TYPES = sorted({s for s, _ in adverts.SECTION_TYPES} | {s for s, _ in adverts.SECTION_EXTRA})
HEADING_TYPES = SECTION_TYPES + ["other"]
FACT_IDS = list(adverts.FACTS)
NO_VAGUE = {"pay_vague"}          # vague pay wording is itself the fact
DEGREES = ["phd", "master", "bachelor", "secondary", "none"]
FUNCTIONS = roles.FUNCTION_IDS + ["none"]
SECTORS = roles.SECTOR_IDS
LEVELS = roles.LEVEL_IDS + ["unknown"]
LANGUAGES = sorted(adverts.STOPWORDS) + ["other"]
RESTRICTION_IDS = list(adverts.RESTRICTIONS)
ANSWER_KEYS = {"id", "headings", "given", "vague", "years_min", "years_alt", "degree", "function", "sector",
               "level", "language", "restrictions", "note"}

ITEM_KEYS = ([f"section:{t}" for t in SECTION_TYPES] + [f"fact:{f}" for f in FACT_IDS] +
             ["years_min", "years_alt", "degree", "function", "sector", "level", "language"] +
             [f"restriction:{c}" for c in RESTRICTION_IDS])
MEASURES = ([f"section:{t}" for t in SECTION_TYPES] + [f"fact:{f}" for f in FACT_IDS] +
            ["years_min", "years_alt", "degree:named"] + [f"degree:{d}" for d in DEGREES[:-1]] +
            ["family", "function", "level"] + [f"level:{lv}" for lv in roles.LEVEL_IDS] +
            ["language", "language:en", "language:fr", "restriction:any"] +
            [f"restriction:{c}" for c in RESTRICTION_IDS])
# Measures judged on precision alone (19.3: family, language, restrictions; level by the same rule),
# so their 15 cases are the script's own positives.
PRECISION_ONLY = {m for m in MEASURES if m.split(":")[0] in ("family", "function", "level", "language",
                                                              "restriction")}
FIELDS = ["measure", "positive_cases", "script_positives", "precision", "recall", "within_one_year",
          "coder_agreement", "kappa", "result"]
RESULTS = {"validated", "Estimate", "not validated"}


def utc_now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def read_rows(path: Path) -> list[dict]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# --- the draw -------------------------------------------------------------------------------------

def cell_of(row: dict) -> tuple[str, str, bool]:
    return row["source"], row["system"], row["language"] == "fr"


def allocate(sizes: dict, total: int) -> dict:
    """Places per cell, proportional to its size by the largest remainder, never more than it holds."""
    whole = sum(sizes.values())
    raw = {c: total * n / whole for c, n in sizes.items()} if whole else {c: 0 for c in sizes}
    q = {c: min(int(raw[c]), sizes[c]) for c in sizes}
    for c in sorted(sizes, key=lambda c: (-(raw[c] - int(raw[c])), -sizes[c], str(c))):
        if sum(q.values()) >= total:
            break
        if q[c] < sizes[c]:
            q[c] += 1
    while sum(q.values()) < total and any(q[c] < sizes[c] for c in q):
        c = max((c for c in q if q[c] < sizes[c]), key=lambda c: (sizes[c] - q[c], str(c)))
        q[c] += 1
    return q


def big_systems(rows: list[dict]) -> set[str]:
    return {s for s, v in Counter(r["system"] for r in rows).items() if v >= BIG_SYSTEM}


def quotas(pool: list[dict], n: int = SAMPLE, french: int = FRENCH_MIN, big: set[str] | None = None) -> dict:
    """Places per cell (source, system, French or not): French cells share at least `french` places,
    the rest the others, each group in proportion; then every system with BIG_SYSTEM adverts or more
    (in the pool, or the systems `big` names) is raised to SYSTEM_FLOOR places, taken from the largest
    cell of the same language group."""
    sizes = Counter(cell_of(r) for r in pool)
    n_fr = max(french, round(n * sum(v for c, v in sizes.items() if c[2]) / max(len(pool), 1)))
    q = allocate({c: v for c, v in sizes.items() if c[2]}, n_fr)
    q |= allocate({c: v for c, v in sizes.items() if not c[2]}, n - n_fr)
    per_system = Counter(r["system"] for r in pool)
    big = big_systems(pool) if big is None else big & set(per_system)

    def system_total(s):
        return sum(v for c, v in q.items() if c[1] == s)

    for s in sorted(big):
        while system_total(s) < min(SYSTEM_FLOOR, per_system[s]):
            adds = [c for c in q if c[1] == s and q[c] < sizes[c]]
            add = max(adds, key=lambda c: (sizes[c] - q[c], str(c))) if adds else None
            takes = [c for c in q if add and c[2] == add[2] and c[1] != s and q[c] > 0 and
                     not (c[1] in big and system_total(c[1]) <= SYSTEM_FLOOR)]
            if not takes:
                break                  # no place to move: draw_problems reports the system as short
            q[add] += 1
            q[max(takes, key=lambda c: (q[c], str(c)))] -= 1
    return q


def draw_sample(rows: list[dict], exclude: set[str], seed: int = SEED, n: int = SAMPLE,
                french: int = FRENCH_MIN, org_max: int = ORG_MAX, earlier: set[str] = frozenset()) -> list[dict]:
    """The validation sample: evidence adverts only (never the AI test set, `exclude`, nor an earlier
    round's, `earlier`), stratified by source, system and language through `quotas`, and by
    organisation within each cell (the organisation with the fewest adverts drawn so far goes
    first), at most `org_max` per organisation. A cell that cannot fill its places passes them to the
    largest cells of its language group. The systems with a floor are those of the whole evidence,
    so every round has the same strata."""
    evidence = [r for r in rows if r["held_out"] == "false" and r["advert_id"] not in exclude]
    big = big_systems(evidence)
    pool = sorted((r for r in evidence if r["advert_id"] not in earlier), key=lambda r: r["advert_id"])
    q = quotas(pool, n, french, big)
    rng = random.Random(seed)
    order = {}
    for c in sorted(q, key=str):
        cell = [r for r in pool if cell_of(r) == c]
        rng.shuffle(cell)
        order[c] = cell
    chosen, ids, per_org = [], set(), Counter()

    def take(c, k: int) -> int:
        got = 0
        while got < k:
            cands = [r for r in order[c] if r["advert_id"] not in ids and per_org[r["org_id"]] < org_max]
            if not cands:
                break
            low = min(per_org[r["org_id"]] for r in cands)
            r = next(r for r in cands if per_org[r["org_id"]] == low)
            chosen.append(r)
            ids.add(r["advert_id"])
            per_org[r["org_id"]] += 1
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
            raise SystemExit(f"draw: {k} places could not be filled within the caps")
    drawn = Counter(r["system"] for r in chosen)
    short_systems = [s for s in big if drawn[s] < SYSTEM_FLOOR]
    if short_systems:
        raise SystemExit(f"draw: the organisation cap left {sorted(short_systems)} under {SYSTEM_FLOOR} adverts")
    return chosen


def draw_problems(chosen: list[dict], rows: list[dict], exclude: set[str], earlier: set[str] = frozenset()) -> list[str]:
    """What a draw must hold (19.3 as the user approved it on 13 November 2026; for round 2, 19.17)."""
    problems = []
    by_id = {r["advert_id"]: r for r in rows}
    if len(chosen) != SAMPLE or len({r["advert_id"] for r in chosen}) != SAMPLE:
        problems.append(f"{len(chosen)} adverts drawn, not {SAMPLE} distinct ones")
    if any(by_id.get(r["advert_id"], {}).get("held_out") != "false" or r["advert_id"] in exclude for r in chosen):
        problems.append("an advert of the AI test set, or not in the evidence, was drawn")
    if any(r["advert_id"] in earlier for r in chosen):
        problems.append("an advert of an earlier round was drawn")
    if sum(1 for r in chosen if r["language"] == "fr") < FRENCH_MIN:
        problems.append(f"fewer than {FRENCH_MIN} French adverts")
    if max(Counter(r["org_id"] for r in chosen).values(), default=0) > ORG_MAX:
        problems.append(f"more than {ORG_MAX} adverts from one organisation")
    evidence = Counter(r["system"] for r in rows if r["held_out"] == "false" and r["advert_id"] not in exclude)
    drawn = Counter(r["system"] for r in chosen)
    for s, v in evidence.items():
        if v >= BIG_SYSTEM and drawn[s] < SYSTEM_FLOOR:
            problems.append(f"the system {s} has {v} adverts but {drawn[s]} drawn")
    return problems


def test_set_ids() -> set[str]:
    p = adverts.WORK / "ai-test-set.json"
    return set(json.loads(p.read_text(encoding="utf-8")).get("test", [])) if p.exists() else set()


def codes_for(chosen: list[dict], seed: int = SEED, first: int = 1, pilot_size: int = PILOT,
              batches: int = BATCHES) -> dict[str, dict]:
    """Neutral ids (V001 to V100 in round 1, V101 to V200 in round 2) in a shuffled order, so a packet
    cannot be matched to the committed rows; a pilot first where the round has one (`pilot_size`
    adverts at as many organisations, at least 2 of them French), then the rest in `batches` batches."""
    order = sorted(chosen, key=lambda r: r["advert_id"])
    random.Random(seed + 1).shuffle(order)
    pilot = []
    for french, size in ((True, min(2, pilot_size)), (False, pilot_size)):
        for r in order:
            if len(pilot) >= size:
                break
            if r in pilot or r["org_id"] in {p["org_id"] for p in pilot} or (french and r["language"] != "fr"):
                continue
            pilot.append(r)
    rest = [r for r in order if r not in pilot]
    out = {}
    for i, r in enumerate(pilot + rest, 1):
        batch = "pilot" if i <= len(pilot) else f"batch-{1 + (i - len(pilot) - 1) * batches // len(rest)}"
        out[f"V{first + i - 1:03d}"] = {"advert_id": r["advert_id"], "batch": batch, "org_id": r["org_id"],
                                        "source": r["source"], "system": r["system"], "french": r["language"] == "fr"}
    return out


def strata_hash(rows: list[dict]) -> str:
    """What a draw depends on in broad-adverts.csv: each advert's id, evidence status, organisation,
    source, system and language. A rebuild that changes only measures keeps it."""
    text = "\n".join("\t".join(r[k] for k in STRATA) for r in sorted(rows, key=lambda r: r["advert_id"]))
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def rules_hashes() -> dict[str, str]:
    return {name: sha256(HERE / name) for name in RULE_FILES}


def round1_strata() -> tuple[str, str] | None:
    """The strata of the broad file round 1 was drawn from, read from git at ROUND1_COMMIT."""
    try:
        blob = subprocess.run(["git", "show", f"{ROUND1_COMMIT}:docs/architecture/role-survey/broad-adverts.csv"],
                              cwd=HERE, capture_output=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        return None
    return strata_hash(list(csv.DictReader(io.StringIO(blob.decode("utf-8"))))), hashlib.sha256(blob).hexdigest()


def earlier_ids(n: int | None = None) -> set[str]:
    """The adverts drawn by every round before round `n` (default: the current one)."""
    out = set()
    for k in range(1, (ROUND if n is None else n)):
        p = adverts.WORK / ROUNDS[k]["folder"] / "draw.json"
        if not p.exists():
            raise SystemExit(f"round {k}'s draw is missing, so round {n or ROUND} cannot leave it out")
        out |= {c["advert_id"] for c in json.loads(p.read_text(encoding="utf-8"))["codes"].values()}
    return out


def saved_draw_problems(saved: dict, rows: list[dict], exclude: set[str], earlier: set[str] = frozenset()) -> list[str]:
    """A frozen draw must still be the one made: its seed, its neutral ids, every rule of the draw,
    the strata of the broad file it was drawn from, and (where recorded) the rules it was drawn
    under, so the revised rules cannot change after a round is drawn."""
    by_id = {r["advert_id"]: r for r in rows}
    codes = saved.get("codes", {})
    missing = [c["advert_id"] for c in codes.values() if c["advert_id"] not in by_id]
    chosen = [by_id[c["advert_id"]] for c in codes.values() if c["advert_id"] in by_id]
    problems = draw_problems(chosen, rows, exclude, earlier)
    if missing:
        problems.append(f"{len(missing)} drawn adverts are not in broad-adverts.csv")
    if saved.get("seed") != SEED:
        problems.append(f"the draw's seed {saved.get('seed')} is not {SEED}")
    if ROUND > 1 and not ("strata" in saved and "rules" in saved):
        problems.append(f"round {ROUND}'s draw does not record its strata and rules")
    if "strata" in saved:
        if saved["strata"] != strata_hash(rows):
            problems.append("broad-adverts.csv has changed since the draw was made (its adverts or strata)")
    elif saved.get("drawn_from") != sha256(roles.ROLES / "broad-adverts.csv"):
        old = round1_strata()           # round 1 recorded the whole file: compare its strata through git
        if not old or old[1] != saved.get("drawn_from") or old[0] != strata_hash(rows):
            problems.append("broad-adverts.csv has changed since the draw was made")
    if "rules" in saved and saved["rules"] != rules_hashes():
        problems.append("the rules (" + ", ".join(RULE_FILES) + ") have changed since the draw was made")
    first = ROUNDS[ROUND]["first_id"]
    if sorted(codes) != [f"V{i:03d}" for i in range(first, first + SAMPLE)]:
        problems.append(f"the neutral ids are not V{first:03d} to V{first + SAMPLE - 1:03d}")
    return problems


def draw(_args=None) -> int:
    rows = read_rows(roles.ROLES / "broad-adverts.csv")
    exclude, earlier = test_set_ids(), earlier_ids()
    path = VALID / "draw.json"
    if path.exists():
        saved = json.loads(path.read_text(encoding="utf-8"))
        problems = saved_draw_problems(saved, rows, exclude, earlier)
        print(f"draw: frozen since {saved['made_at']}, kept as it is; {len(problems)} problems")
        for p in problems:
            print(p)
        return 1 if problems else 0
    chosen = draw_sample(rows, exclude, seed=SEED, earlier=earlier)
    problems = draw_problems(chosen, rows, exclude, earlier)
    if problems:
        for p in problems:
            print(p)
        return 1
    VALID.mkdir(parents=True, exist_ok=True)
    cfg = ROUNDS[ROUND]
    codes = codes_for(chosen, SEED, cfg["first_id"], PILOT if cfg["pilot"] else 0, cfg["batches"])
    path.write_text(json.dumps({"made_at": utc_now(), "round": ROUND, "seed": SEED,
                                "drawn_from": sha256(roles.ROLES / "broad-adverts.csv"), "strata": strata_hash(rows),
                                "rules": rules_hashes(), "codes": codes}, indent=1), encoding="utf-8")
    print(f"draw: {len(codes)} adverts at {len({c['org_id'] for c in codes.values()})} organisations; "
          f"French {sum(c['french'] for c in codes.values())}; by source {dict(Counter(c['source'] for c in codes.values()))}; "
          f"by system {dict(Counter(c['system'] for c in codes.values()))}")
    return 0


def load_draw() -> dict[str, dict]:
    """The frozen draw, refused unless it still holds every rule and was drawn from today's adverts
    (and, for a round that recorded them, under today's rules)."""
    saved = json.loads((VALID / "draw.json").read_text(encoding="utf-8"))
    problems = saved_draw_problems(saved, read_rows(roles.ROLES / "broad-adverts.csv"), test_set_ids(), earlier_ids())
    if problems:
        raise SystemExit("the frozen draw is refused: " + "; ".join(problems))
    return saved["codes"]


# --- the coders' packets ----------------------------------------------------------------------------

def posting_values(html: str) -> str:
    """The values of the job-posting data the script read its facts from (a JSON-LD JobPosting with a
    description of 100 words or more), contacts removed."""
    for p in adverts.jsonld_postings(html):
        if len(re.sub(r"<[^>]+>", " ", adverts._text(p.get("description"))).split()) < 100:
            continue
        parts = []
        for label, key in (("closing date", "validThrough"), ("place", "jobLocation"),
                           ("applicant location", "applicantLocationRequirements"), ("location type", "jobLocationType"),
                           ("employment type", "employmentType"), ("pay", "baseSalary"),
                           ("estimated pay", "estimatedSalary"), ("date posted", "datePosted")):
            v = re.sub(r"\s+", " ", adverts._text(p.get(key))).strip()
            if v:
                parts.append(f"{label}: {adverts.scrub(v)[:160]}")
        return " | ".join(parts) or "none of its facts given"
    return ""


def raw_html(ad: dict, saved: dict, boards: dict) -> str:
    if ad["source"] == "archive" and ad["id"] in saved:
        _uri, body, headers = adverts.http_body(saved[ad["id"]].read_bytes())
        return body.decode(adverts.charset(headers, body), "replace")
    if ad["source"] == "board" and ad["id"] in boards:
        return boards[ad["id"]].read_bytes().decode("utf-8", "replace")
    return ""


def board_bodies() -> dict[str, Path]:
    out = {}
    for meta_path in (adverts.READING / "r3" / "bodies").glob("*.json"):
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        if meta.get("status") == 200:
            out[adverts.page_id(meta["url"])] = meta_path.with_suffix(".bin")
    return out


def pieces(text: str, size: int = CHUNK) -> list[str]:
    """A long line cut at spaces into pieces of at most about `size` characters."""
    out, rest = [], text
    while len(rest) > size:
        cut = rest.rfind(" ", 0, size)
        cut = cut if cut > size // 2 else size
        out.append(rest[:cut].rstrip())
        rest = rest[cut:].lstrip()
    return out + [rest]


def packet_text(vid: str, ad: dict, posting: str, chunk: int | None = None) -> tuple[str, int]:
    """One advert as the coders read it: its title, the job-posting data's values where the page had
    them, and its lines, numbered, '#' marking the page's main heading and '##' a line the page
    formats as a heading. With `chunk` (round 2), a line longer than that is given in pieces, each
    after the first marked "N (continued)", so line numbers stay the advert's own: very long lines
    stalled coders in round 1."""
    out = [f"=== {vid} ===", f"Title: {ad.get('title') or '(none found)'}"]
    if ad.get("method") == "jsonld":
        out.append(f"Job-posting data on the page: {posting or 'not readable'}")
    out.append("Lines:")
    for i, ln in enumerate(ad["lines"], 1):
        mark = "# " if ln.get("tag") == "h1" else "## " if ln.get("heading") else ""
        parts = pieces(ln["text"], chunk) if chunk else [ln["text"]]
        out.append(f"{i} {mark}{parts[0]}")
        out += [f"{i} (continued) {p}" for p in parts[1:]]
    return "\n".join(out) + "\n", len(ad["lines"])


def packets(_args=None) -> int:
    codes = load_draw()
    wanted = {c["advert_id"]: vid for vid, c in codes.items()}
    measured = {a["id"]: a for a in adverts.measured_adverts()["adverts"] if a["id"] in wanted}
    if len(measured) != len(wanted):
        print(f"packets: {len(wanted) - len(measured)} drawn adverts are not among the measured ones")
        return 1
    saved, boards = adverts.saved_pages(), board_bodies()
    PACKETS.mkdir(parents=True, exist_ok=True)
    texts, index = defaultdict(list), {}
    for vid in sorted(codes):
        ad = measured[codes[vid]["advert_id"]]
        posting = posting_values(raw_html(ad, saved, boards)) if ad.get("method") == "jsonld" else ""
        text, n = packet_text(vid, ad, posting, None if ROUNDS[ROUND]["pilot"] else CHUNK)
        texts[codes[vid]["batch"]].append(text)
        index[vid] = {"batch": codes[vid]["batch"], "lines": n}
    for batch, parts in texts.items():
        (PACKETS / f"{batch}.txt").write_text("\n".join(parts), encoding="utf-8")
    (PACKETS / "index.json").write_text(json.dumps(index, indent=1), encoding="utf-8")
    print(f"packets: {dict(Counter(v['batch'] for v in index.values()))}")
    return 0


# --- the guide and the coders' answers --------------------------------------------------------------

def guide_problems(text: str) -> list[str]:
    """Every category a coder may answer must be defined in the guide, by its id in backticks."""
    ids = (HEADING_TYPES + FACT_IDS + DEGREES + FUNCTIONS + SECTORS + LEVELS + LANGUAGES + RESTRICTION_IDS +
           ["given", "vague", "absent"])
    return [f"the guide does not define `{i}`" for i in dict.fromkeys(ids) if f"`{i}`" not in text]


def frozen_guide_problems() -> list[str]:
    """After round 1, every round is coded on guide 1.1 unchanged, the version round 1 reconciled."""
    if ROUND == 1:
        return []
    path = VALID / "guide.md"
    if not path.exists() or sha256(path) != FROZEN_GUIDE:
        return [f"round {ROUND}'s guide.md is not guide 1.1 as frozen ({FROZEN_GUIDE[:12]}…)"]
    return []


def guide(_args=None) -> int:
    if not (VALID / "guide.md").exists():
        print(f"guide: {VALID / 'guide.md'} is missing")
        return 1
    problems = frozen_guide_problems()
    problems += guide_problems((VALID / "guide.md").read_text(encoding="utf-8"))
    for p in problems:
        print(p)
    print(f"guide: {len(problems)} problems")
    return 1 if problems else 0


def _number(v) -> bool:
    return isinstance(v, int | float) and not isinstance(v, bool) and 0 < v <= 40


def answer_problems(a: dict, lines: int | None) -> list[str]:
    """The guide's form for one advert's answers."""
    vid = a.get("id", "?")
    missing, unknown = ANSWER_KEYS - {"note"} - set(a), set(a) - ANSWER_KEYS
    if missing or unknown:
        return [f"{vid}: keys missing {sorted(missing)}, unknown {sorted(unknown)}"]
    p = []
    if lines is None:
        p.append(f"{vid}: not an advert of this packet")
    seen = set()
    for h in a["headings"] if isinstance(a["headings"], list) else [None]:
        if not (isinstance(h, list) and len(h) == 2 and isinstance(h[0], int) and not isinstance(h[0], bool)
                and h[1] in HEADING_TYPES):
            p.append(f"{vid}: heading {h!r} is not [line, section type]")
        # One line may start several sections when an advert's text comes as a single line.
        elif (lines is not None and not 1 <= h[0] <= lines) or tuple(h) in seen:
            p.append(f"{vid}: heading {h!r} is outside the advert or given twice")
        else:
            seen.add(tuple(h))
    for k in ("given", "vague", "restrictions"):
        allowed = set(RESTRICTION_IDS) if k == "restrictions" else set(FACT_IDS) - (NO_VAGUE if k == "vague" else set())
        if not isinstance(a[k], list) or not set(a[k]) <= allowed or len(set(a[k])) != len(a[k]):
            p.append(f"{vid}: {k} holds an unknown or repeated item")
    if isinstance(a["given"], list) and isinstance(a["vague"], list) and set(a["given"]) & set(a["vague"]):
        p.append(f"{vid}: a fact is both given and vague")
    for k in ("years_min", "years_alt"):
        if a[k] is not None and not _number(a[k]):
            p.append(f"{vid}: {k} is not a number of years or null")
    if a["years_alt"] is not None and (a["years_min"] is None or (_number(a["years_min"]) and _number(a["years_alt"])
                                                                  and a["years_alt"] <= a["years_min"])):
        p.append(f"{vid}: years_alt needs a smaller years_min")
    for k, allowed in (("degree", DEGREES), ("function", FUNCTIONS), ("sector", SECTORS), ("level", LEVELS),
                       ("language", LANGUAGES)):
        if a[k] not in allowed:
            p.append(f"{vid}: {k}={a[k]!r} is not an allowed value")
    if "note" in a and (not isinstance(a["note"], str) or len(a["note"].split()) > 40):
        p.append(f"{vid}: the note is not a short text")
    return p


def read_answers(path: Path) -> list[dict]:
    out = []
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if line and not line.startswith("```"):
            out.append(json.loads(line))
    return out


def answers(args) -> int:
    index = json.loads((PACKETS / "index.json").read_text(encoding="utf-8"))
    bad = 0
    for name in args.files:
        path = Path(name)
        batch = re.sub(r"^coder-[ab]-", "", path.stem)
        rows = read_answers(path)
        expected = {v for v, i in index.items() if i["batch"] == batch}
        problems = [q for a in rows for q in answer_problems(a, index[a["id"]]["lines"] if a.get("id") in expected
                                                             else None)]
        got = [a.get("id") for a in rows]
        if sorted(got) != sorted(expected):
            problems.append(f"{path.name}: answers for {len(set(got))} adverts, the packet holds {len(expected)} "
                            f"(missing {sorted(expected - set(got))}, extra or repeated "
                            f"{sorted(k for k, n in Counter(got).items() if n > 1 or k not in expected)})")
        for q in problems:
            print(q)
        print(f"{path.name}: {len(rows)} adverts, {len(problems)} problems")
        bad += len(problems)
    return 1 if bad else 0


def coder_answers(coder: str) -> dict[str, dict]:
    out = {}
    for path in sorted(ANSWERS.glob(f"coder-{coder}-*.jsonl")):
        for a in read_answers(path):
            out[a["id"]] = a
    return out


# --- items, agreement and reconciliation ---------------------------------------------------------

def items_of(a: dict) -> dict:
    """One advert's answers as the items compared and reconciled."""
    types = {t for _, t in a["headings"]}
    out = {f"section:{t}": t in types for t in SECTION_TYPES}
    out |= {f"fact:{f}": "given" if f in a["given"] else "vague" if f in a["vague"] else "absent" for f in FACT_IDS}
    out |= {k: (float(a[k]) if a[k] is not None else None) for k in ("years_min", "years_alt")}
    out |= {k: a[k] for k in ("degree", "function", "sector", "level", "language")}
    out |= {f"restriction:{c}": c in a["restrictions"] for c in RESTRICTION_IDS}
    return out


def family_of(items: dict) -> str:
    if items["function"] in ("none", "unplaced", ""):
        return "unplaced"
    return items["function"] if items["sector"] == "none" else f"{items['function']}.{items['sector']}"


def value_for(measure: str, items: dict):
    """What a measure reads from one advert's items: a truth value, a category or a number."""
    kind, _, arg = measure.partition(":")
    if kind == "section":
        return items[measure]
    if kind == "fact":
        return items[measure]
    if kind in ("years_min", "years_alt"):
        return items[kind]
    if kind == "degree":
        return items["degree"] != "none" if arg == "named" else items["degree"] == arg
    if kind == "family":
        return family_of(items)
    if kind == "function":
        return items["function"] if items["function"] not in ("unplaced", "") else "none"
    if kind in ("level", "language"):
        return items[kind] if not arg else items[kind] == arg
    if kind == "restriction":
        if arg == "any":
            return any(items[f"restriction:{c}"] for c in RESTRICTION_IDS)
        return items[measure]
    raise KeyError(measure)


def kappa(a: list, b: list) -> float | None:
    """Cohen's kappa for two coders' answers on the same cases; None when chance agreement is total."""
    n = len(a)
    if not n:
        return None
    po = sum(x == y for x, y in zip(a, b, strict=True)) / n
    ca, cb = Counter(map(str, a)), Counter(map(str, b))
    pe = sum(ca[k] * cb[k] for k in ca) / (n * n)
    return None if pe >= 1 else (po - pe) / (1 - pe)


def within_one(x, y) -> bool:
    return x is not None and y is not None and abs(x - y) <= 1


def agreement_of(measure: str, a: list[dict], b: list[dict]) -> tuple[float | None, float | None]:
    """(percent agreement, kappa) of two coders on one measure. Years: agreement within one year
    among the adverts where either coder gives a figure; kappa on the exact figures."""
    va, vb = [value_for(measure, x) for x in a], [value_for(measure, x) for x in b]
    if measure in ("years_min", "years_alt"):
        cases = [(x, y) for x, y in zip(va, vb, strict=True) if x is not None or y is not None]
        share = sum(within_one(x, y) for x, y in cases) / len(cases) if cases else None
        return share, kappa(va, vb)
    return (sum(x == y for x, y in zip(va, vb, strict=True)) / len(va) if va else None), kappa(va, vb)


def agreement_table(ids: list[str], a: dict, b: dict) -> dict[str, tuple]:
    ia, ib = [items_of(a[i]) for i in ids], [items_of(b[i]) for i in ids]
    return {m: agreement_of(m, ia, ib) for m in MEASURES}


def pilot_and_main(codes: dict) -> tuple[list[str], list[str]]:
    pilot = sorted(v for v, c in codes.items() if c["batch"] == "pilot")
    return pilot, sorted(v for v in codes if v not in pilot)


def agreement(_args=None) -> int:
    codes, a, b = load_draw(), coder_answers("a"), coder_answers("b")
    out = {}
    for name, ids in zip(("pilot", "main"), pilot_and_main(codes), strict=True):
        ids = [i for i in ids if i in a and i in b]
        if not ids:
            continue
        table = agreement_table(ids, a, b)
        out[name] = {"adverts": len(ids), "measures": {m: list(v) for m, v in table.items()}}
        low = sorted((m for m, (p, _k) in table.items() if p is not None and p < 0.8), key=lambda m: table[m][0])
        print(f"agreement, {name} ({len(ids)} adverts): below 80% on {len(low)} measures: "
              + ", ".join(f"{m} {table[m][0]:.2f}" for m in low))
    (VALID / "agreement.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    return 0


DIS_FIELDS = ["id", "item", "coder_a", "coder_b", "decision", "reason"]


def show(v) -> str:
    if v is None:
        return "none"
    if isinstance(v, bool):
        return "yes" if v else "no"
    if isinstance(v, float):
        return f"{v:g}"
    return str(v)


def parse_decision(item: str, text: str):
    """A reconciler's decision as the item's value; ValueError if it is not one of the item's values."""
    t = text.strip()
    if item.startswith(("section:", "restriction:")):
        if t not in ("yes", "no"):
            raise ValueError(t)
        return t == "yes"
    if item.startswith("fact:"):
        if t not in ("given", "vague", "absent") or (t == "vague" and item[5:] in NO_VAGUE):
            raise ValueError(t)
        return t
    if item in ("years_min", "years_alt"):
        if t == "none":
            return None
        v = float(t)
        if not 0 < v <= 40:
            raise ValueError(t)
        return v
    allowed = {"degree": DEGREES, "function": FUNCTIONS, "sector": SECTORS, "level": LEVELS, "language": LANGUAGES}[item]
    if t not in allowed:
        raise ValueError(t)
    return t


NOT_CODED = "not coded"


def coded_items(answers: dict, vid: str) -> dict:
    """An advert's items from one coder, or "not coded" for every item when that coder could not
    code it: each item then needs the reconciler's decision."""
    return items_of(answers[vid]) if vid in answers else dict.fromkeys(ITEM_KEYS, NOT_CODED)


def disagreement_rows(a: dict, b: dict, ids: list[str], earlier: list[dict] = ()) -> list[dict]:
    """Every item the two coders answered differently (every item of an advert one coder could not
    code), keeping a decision already written for the same answers."""
    kept = {(r["id"], r["item"], r["coder_a"], r["coder_b"]): r for r in earlier}
    rows = []
    for vid in ids:
        ia, ib = coded_items(a, vid), coded_items(b, vid)
        for k in ITEM_KEYS:
            if ia[k] != ib[k]:
                key = (vid, k, show(ia[k]), show(ib[k]))
                old = kept.get(key, {})
                rows.append({"id": vid, "item": k, "coder_a": key[2], "coder_b": key[3],
                             "decision": old.get("decision", ""), "reason": old.get("reason", "")})
    return rows


def disagreements(_args=None) -> int:
    codes, a, b = load_draw(), coder_answers("a"), coder_answers("b")
    ids = sorted(v for v in codes if v in a or v in b)
    path = VALID / "disagreements.csv"
    rows = disagreement_rows(a, b, ids, read_rows(path) if path.exists() else [])
    adverts.write_local(path, DIS_FIELDS, rows)
    print(f"disagreements: {len(rows)} items in {len({r['id'] for r in rows})} of {len(ids)} adverts; "
          f"{sum(1 for r in rows if not r['decision'])} not yet decided")
    return 0


def reconciled_items(a: dict, b: dict, ids: list[str], rows: list[dict]) -> tuple[dict, list[str]]:
    """The reconciled set: an item the coders agree on stands; any other takes the reconciler's
    decision, which needs a one-line reason. An advert neither coder coded is refused."""
    decided = {(r["id"], r["item"]): r for r in rows}
    out, problems = {}, []
    for vid in ids:
        if vid not in a and vid not in b:
            problems.append(f"{vid}: coded by neither coder")
            continue
        ia, ib = coded_items(a, vid), coded_items(b, vid)
        items = {}
        for k in ITEM_KEYS:
            if ia[k] == ib[k] and ia[k] != NOT_CODED:
                items[k] = ia[k]
                continue
            r = decided.get((vid, k))
            if not r or not r["decision"].strip() or not r["reason"].strip() or "\n" in r["reason"]:
                problems.append(f"{vid} {k}: no decision with a one-line reason")
                continue
            try:
                items[k] = parse_decision(k, r["decision"])
            except ValueError:
                problems.append(f"{vid} {k}: {r['decision']!r} is not a value of this item")
        if set(items) == set(ITEM_KEYS):
            problems += [f"{vid}: {p}" for p in item_problems(items)]
        out[vid] = items
    return out, problems


def item_problems(items: dict) -> list[str]:
    """The guide's form for one advert's reconciled items, the years pair included."""
    p = []
    for k, x in items.items():
        try:
            parse_decision(k, show(x))
        except ValueError:
            p.append(f"{k}={x!r} is not a value of this item")
    if items["years_alt"] is not None and (items["years_min"] is None or items["years_alt"] <= items["years_min"]):
        p.append("years_alt needs a smaller years_min")
    return p


def reconcile(_args=None) -> int:
    path, seal = VALID / "reconciled.json", VALID / "reconciled.sha256"
    if path.exists():
        ok = seal.exists() and seal.read_text(encoding="utf-8").strip() == sha256(path)
        print(f"reconcile: frozen, {'its seal matches' if ok else 'ITS SEAL DOES NOT MATCH'}; not made again")
        return 0 if ok else 1
    codes, a, b = load_draw(), coder_answers("a"), coder_answers("b")
    ids = sorted(codes)
    single = [v for v in ids if (v in a) != (v in b)]
    if single:
        print(f"reconcile: {single} coded by one coder only; every item of theirs takes a decision")
    items, problems = reconciled_items(a, b, ids, read_rows(VALID / "disagreements.csv"))
    problems = frozen_guide_problems() + problems
    for p in problems[:30]:
        print(p)
    if problems:
        print(f"reconcile: {len(problems)} problems; nothing frozen")
        return 1
    path.write_text(json.dumps({"made_at": utc_now(), "guide": sha256(VALID / "guide.md"), "items": items},
                               indent=1, sort_keys=True), encoding="utf-8")
    seal.write_text(sha256(path) + "\n", encoding="utf-8")
    print(f"reconcile: {len(items)} adverts frozen")
    return 0


# --- scoring ---------------------------------------------------------------------------------------

def script_items(row: dict, section_types: set[str]) -> dict:
    """The script's answers for one advert, from the committed broad files, as items."""
    given = set(filter(None, row["facts_given"].split(";")))
    restrictions = set(filter(None, row["restrictions"].split(";")))
    out = {f"section:{t}": t in section_types for t in SECTION_TYPES}
    out |= {f"fact:{f}": "given" if f in given else "absent" for f in FACT_IDS}
    out |= {k: float(row[k]) if row[k] else None for k in ("years_min", "years_alt")}
    out |= {"degree": row["degree"] or "none", "function": "none" if row["function"] == "unplaced" else row["function"],
            "sector": row["sector"], "level": row["level"],
            "language": row["language"] if row["language"] in LANGUAGES else "other"}
    out |= {f"restriction:{c}": c in restrictions for c in RESTRICTION_IDS}
    out["family"] = row["family_id"]
    return out


def truth_of(measure: str, items: dict):
    if measure.startswith("fact:"):
        return items[measure] == "given"
    return value_for(measure, items)


def script_of(measure: str, items: dict):
    if measure == "family":
        return items["family"]
    return truth_of(measure, items)


def judged(measure: str, positives: int, script_positives: int, precision, recall, within) -> str:
    if measure in ("years_min", "years_alt"):
        if positives < MIN_POSITIVES:
            return "not validated"
        return "validated" if within >= TARGET_YEARS else "Estimate"
    if measure in PRECISION_ONLY:
        if script_positives < MIN_POSITIVES:
            return "not validated"
        return "validated" if precision is not None and precision >= TARGET_PRECISION else "Estimate"
    if positives < MIN_POSITIVES:
        return "not validated"
    ok = precision is not None and precision >= TARGET_PRECISION and recall is not None and recall >= TARGET_RECALL
    return "validated" if ok else "Estimate"


def score_measure(measure: str, script: list[dict], truth: list[dict]) -> dict:
    """One measure's row: its positive cases, precision, recall (or the share within one year) and
    result, by 19.3's targets."""
    s = [script_of(measure, x) for x in script]
    t = [truth_of(measure, x) for x in truth]
    precision = recall = within = None
    if measure in ("years_min", "years_alt"):
        cases = [(x, y) for x, y in zip(s, t, strict=True) if x is not None or y is not None]
        positives, script_positives = len(cases), sum(x is not None for x in s)
        within = sum(within_one(x, y) for x, y in cases) / len(cases) if cases else None
    elif measure in ("family", "function", "level", "language"):
        unset = {"family": "unplaced", "function": "none", "level": "unknown", "language": None}[measure]
        placed = [(x, y) for x, y in zip(s, t, strict=True) if x != unset]
        positives, script_positives = sum(y != unset for y in t), len(placed)
        hits = sum(x == y for x, y in placed)
        precision = hits / len(placed) if placed else None
        recall = hits / positives if positives else None
    else:
        tp = sum(bool(x) and bool(y) for x, y in zip(s, t, strict=True))
        positives, script_positives = sum(map(bool, t)), sum(map(bool, s))
        precision = tp / script_positives if script_positives else None
        recall = tp / positives if positives else None
    # Judged on the shares as committed (three decimals), so the form check can recompute the result.
    precision, recall, within = (None if x is None else round(x, 3) for x in (precision, recall, within))
    return {"measure": measure, "positive_cases": positives, "script_positives": script_positives,
            "precision": precision, "recall": recall, "within_one_year": within,
            "result": judged(measure, positives, script_positives, precision, recall, within)}


def fmt(v) -> str:
    return "" if v is None else f"{v:.3f}"


def score_rows(script: list[dict], truth: list[dict], agree: dict[str, tuple]) -> list[dict]:
    rows = []
    for m in MEASURES:
        r = score_measure(m, script, truth)
        p, k = agree.get(m, (None, None))
        rows.append({**{f: r[f] for f in ("measure", "positive_cases", "script_positives", "result")},
                     "precision": fmt(r["precision"]), "recall": fmt(r["recall"]),
                     "within_one_year": fmt(r["within_one_year"]), "coder_agreement": fmt(p), "kappa": fmt(k)})
    return rows


def error_rows(ids: list[str], script: list[dict], truth: list[dict], codes: dict) -> list[dict]:
    """Where the script and the reconciled set differ, per advert and measure (local, for the error
    patterns)."""
    out = []
    for vid, s, t in zip(ids, script, truth, strict=True):
        for m in MEASURES:
            if m == "restriction:any" or m.startswith(("degree:", "level:", "language:")):
                continue
            x, y = script_of(m, s), truth_of(m, t)
            differs = not within_one(x, y) and x != y if m.startswith("years") else x != y
            if differs:
                out.append({"id": vid, "advert_id": codes[vid]["advert_id"], "measure": m, "script": show(x),
                            "reconciled": show(y), "reconciled_detail": show(t[m]) if m in t else ""})
    return out


def score(_args=None) -> int:
    if ROUND < max(ROUNDS) and OUTPUT.exists():
        print(f"score: round {ROUND}'s committed results stand as the record of its rules; use recheck")
        return 1
    return score_to(OUTPUT, VALID / "errors.csv")


def recheck(_args=None) -> int:
    """An earlier round re-scored on today's rules, written locally beside its reconciled set and
    never over its committed file: round 1's adverts are where the error patterns were found, so
    this is a check of the revised rules, not a test of them (19.17)."""
    if ROUND == max(ROUNDS):
        print("recheck: only an earlier round is rechecked; the latest round is scored")
        return 1
    return score_to(VALID / "recheck.csv", VALID / "errors-recheck.csv", local=True)


def score_to(output: Path, errors: Path, local: bool = False) -> int:
    path, seal = VALID / "reconciled.json", VALID / "reconciled.sha256"
    if not path.exists() or not seal.exists() or seal.read_text(encoding="utf-8").strip() != sha256(path):
        print("score: the reconciled set is not frozen with a matching seal; nothing scored")
        return 1
    if ROUND > 1 and json.loads(path.read_text(encoding="utf-8")).get("guide") != FROZEN_GUIDE:
        print("score: the reconciled set was not made on guide 1.1 as frozen; nothing scored")
        return 1
    codes = load_draw()
    truth_by = json.loads(path.read_text(encoding="utf-8"))["items"]
    rows = {r["advert_id"]: r for r in read_rows(roles.ROLES / "broad-adverts.csv")}
    secs = defaultdict(set)
    for r in read_rows(roles.ROLES / "broad-sections.csv"):
        secs[r["advert_id"]].add(r["section_type"])
    ids = sorted(codes)
    script = [script_items(rows[codes[v]["advert_id"]], secs[codes[v]["advert_id"]]) for v in ids]
    truth = [truth_by[v] for v in ids]
    a, b = coder_answers("a"), coder_answers("b")
    _pilot, main = pilot_and_main(codes)
    out = score_rows(script, truth, agreement_table([i for i in main if i in a and i in b], a, b))
    (adverts.write_local if local else adverts.write_dicts)(output, FIELDS, out)
    adverts.write_local(errors, ["id", "advert_id", "measure", "script", "reconciled", "reconciled_detail"],
                        error_rows(ids, script, truth, codes))
    print(f"score: {dict(Counter(r['result'] for r in out))}")
    for r in out:
        print(f"{r['measure']:40} pos {r['positive_cases']:>3} script {r['script_positives']:>3} "
              f"P {r['precision'] or '-':>5} R {r['recall'] or '-':>5} 1y {r['within_one_year'] or '-':>5} "
              f"agree {r['coder_agreement'] or '-':>5} k {r['kappa'] or '-':>6} {r['result']}")
    return 0


# --- the committed file's form (CI) ------------------------------------------------------------------

DECIMAL = re.compile(r"(?:0\.\d{3}|1\.000)?")
KAPPA = re.compile(r"(?:-?[01]\.\d{3})?")


def check_problems(path: Path) -> list[str]:
    """broad-validation.csv: its columns, every measure once, counts and shares only, a result from
    the three, and no email, phone number or address."""
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != FIELDS:
            return [f"{path.name}: columns {reader.fieldnames} are not {FIELDS}"]
        rows = list(reader)
    problems = []
    seen = [r["measure"] for r in rows]
    if seen != MEASURES:
        problems.append(f"{path.name}: the measures are not exactly {len(MEASURES)} known ones, in order")
    for i, r in enumerate(rows, 2):
        for k, v in r.items():
            v = v or ""
            if adverts.EMAIL.search(v) or re.search(r"https?://|www\.", v):
                problems.append(f"{path.name}:{i}: {k} holds an email address or an address")
            if k in ("positive_cases", "script_positives") and not v.isdigit():
                problems.append(f"{path.name}:{i}: {k} is not a count")
            if k in ("precision", "recall", "within_one_year", "coder_agreement") and not DECIMAL.fullmatch(v):
                problems.append(f"{path.name}:{i}: {k}={v!r} is not a share")
            if k == "kappa" and not KAPPA.fullmatch(v):
                problems.append(f"{path.name}:{i}: kappa={v!r} is not a kappa")
            if k == "result" and v not in RESULTS:
                problems.append(f"{path.name}:{i}: result={v!r} is not one of {sorted(RESULTS)}")
        try:
            share = {k: float(r[k]) if r[k] else None for k in ("precision", "recall", "within_one_year")}
            expected = judged(r["measure"], int(r["positive_cases"]), int(r["script_positives"]), share["precision"],
                              share["recall"], share["within_one_year"])
        except (ValueError, TypeError):
            continue
        if r["result"] != expected:
            problems.append(f"{path.name}:{i}: result {r['result']!r} is not what its counts give ({expected!r})")
    return problems


def check(_args=None, path: Path | None = None) -> int:
    """The committed file of every round (or only `path`): each must exist and pass its form."""
    paths = [path] if path else [roles.ROLES / cfg["output"] for cfg in ROUNDS.values()]
    problems = [q for p in paths for q in (check_problems(p) if p.exists() else [f"{p.name} is missing"])]
    for p in problems[:50]:
        print(p)
    print(f"check: {len(problems)} problems")
    return 1 if problems else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--round", type=int, default=1, choices=sorted(ROUNDS))
    sub = parser.add_subparsers(dest="cmd", required=True)
    for name, func in (("draw", draw), ("packets", packets), ("guide", guide), ("agreement", agreement),
                       ("disagreements", disagreements), ("reconcile", reconcile), ("score", score),
                       ("recheck", recheck), ("check", check)):
        sub.add_parser(name).set_defaults(func=func)
    p = sub.add_parser("answers")
    p.add_argument("files", nargs="+")
    p.set_defaults(func=answers)
    args = parser.parse_args()
    use_round(args.round)
    return args.func(args)


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    raise SystemExit(main())
