"""Role-content survey (W-54), Stage 3b: wave-1a phrasing + reference JDs (role-survey.md 19.24).

Run on the user's machine; CI runs `build`, `check` and the tests:

  python tools/survey/library.py build
  python tools/survey/library.py check

Builds JSON under docs/architecture/role-survey/library/ from normative-sources.csv,
wave-1a-broad-measured.json, signature-facts.csv, duty-group-names.csv, duty-phrasing.csv
and library/reference/*.md. Measured broad-layer figures are copied with Fact labels; deep full
scores stay sealed in the archive (reconciled.json is never committed). Deep written fields flip
deep_fields_ready only when the committed inputs prove the content is present. groups[].phrasing
stays null; AidJobs best-quarter lines live in duty_bank.phrasing_lines (schema 0.3.0 additive).
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
from pathlib import Path

import adverts
import deep

HERE = Path(__file__).resolve().parent
ROLES = adverts.ROLES_DIR
LIBRARY = ROLES / "library"
REFERENCE_DIR = LIBRARY / "reference"
NORMATIVE = ROLES / "normative-sources.csv"
MEASURED = ROLES / "wave-1a-broad-measured.json"
SIGNATURE_FACTS = ROLES / "signature-facts.csv"
DUTY_GROUP_NAMES = ROLES / "duty-group-names.csv"
DUTY_PHRASING = ROLES / "duty-phrasing.csv"
SCHEMA_PATH = LIBRARY / "schema.json"

SCHEMA_VERSION = "0.3.0"
WAVE = "1a"
MIN_SIGNATURE_FACTS = 3
DUTY_NAME_ADVERT_FLOOR = 5

WAVE_1A_FAMILIES = list(deep.FAMILIES)

DEFAULT_NORMATIVE_SOURCE_IDS = ("chcf", "chs-2024", "un-generic-job-profiles")
UN_VARIANT_SOURCE_ID = "un-values-behaviours"

REFERENCE_FORMATS = ("ingo_role_profile", "local_ngo_concise")
REFERENCE_LANGUAGES = ("en", "fr")
FAMILY_REFERENCE_LEVEL: dict[str, str] = {
    "programme_management": "coordinator_manager",
    "meal": "officer",
    "communications_advocacy": "officer",
    "finance": "officer",
}
FORMAT_LABELS: dict[str, str] = {
    "ingo_role_profile": "INGO role profile",
    "local_ngo_concise": "local NGO concise",
}

DEEP_FIELDS_READY_KEYS = (
    "duty_bank_naming",
    "duty_bank_phrasing",
    "signature_fact_questions",
    "reference_jds",
)

# First 12 hex chars of each family's sealed reconciled.json (archive only; role-survey.md 19.22).
DEEP_SEAL_PREFIX: dict[str, str] = {
    "programme_management": "cfc5a6058309",
    "meal": "cc3f7f7e7711",
    "communications_advocacy": "707a745d6cd2",
    "finance": "ea5ecc373c70",
}

FAMILY_NAMES: dict[str, str] = {
    "programme_management": "Programme management",
    "meal": "MEAL",
    "communications_advocacy": "Communications and advocacy",
    "finance": "Finance",
}

ARCHIVE_MEASURED = "survey-raw-archive/role-survey-reading/work/measured.jsonl"
ARCHIVE_DUTY_GROUPS = (
    "survey-raw-archive/role-survey-reading/work/stage2/measured/{family_id}/duty-banks.jsonl"
)
ARCHIVE_DEEP_RECONCILED = (
    "survey-raw-archive/role-survey-reading/work/stage2/{family_id}/reconciled.json"
)

SIGNATURE_FACT_FIELDS = [
    "family_id",
    "level",
    "fact_id",
    "fact",
    "question_en",
    "question_fr",
    "section_fed",
    "why_en",
    "why_fr",
    "top_count",
    "bottom_count",
    "evidence_adverts",
    "evidence_note",
    "normative_sources",
    "label",
]

DUTY_GROUP_FIELDS = [
    "family_id",
    "group_id",
    "heuristic_name",
    "stable_id",
    "name_en",
    "name_fr",
    "named",
    "line_count",
    "advert_count",
    "organisation_count",
    "label",
]

DUTY_PHRASING_FIELDS = [
    "stable_id",
    "family_id",
    "skip",
    "best_en",
    "best_fr",
    "slots",
    "weak_en",
    "weak_fr",
    "label",
]

STABLE_ID_RE = re.compile(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$")
NOISE_NAME_MARKERS = ("noise", "catch-all")


def sha256_file(path: Path) -> str:
    """Hash file bytes with CRLF normalised to LF so Windows checkouts match CI."""
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def sha256_file_raw(path: Path) -> str:
    """Hash exact file bytes. Use for sealed archive files whose .sha256 is byte-identity."""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_normative_rows(path: Path = NORMATIVE) -> list[dict]:
    if not path.is_file():
        raise FileNotFoundError(f"normative-sources.csv missing: {path}")
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def load_measured(path: Path = MEASURED) -> dict:
    if not path.is_file():
        raise FileNotFoundError(f"wave-1a-broad-measured.json missing: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def canonical_json(data: object) -> str:
    return json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def _parse_bool(value: str | bool) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "y"}


def _parse_int(value: str, field: str) -> int:
    text = (value or "").strip()
    if text == "":
        raise ValueError(f"{field} must be an integer")
    return int(text)


def read_signature_facts(path: Path = SIGNATURE_FACTS) -> list[dict]:
    if not path.is_file():
        raise FileNotFoundError(f"signature-facts.csv missing: {path}")
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        header = list(reader.fieldnames or [])
        rows = list(reader)
    if not rows:
        raise ValueError("signature-facts.csv has no data rows")
    missing = [c for c in SIGNATURE_FACT_FIELDS if c not in header]
    if missing:
        raise ValueError(f"signature-facts.csv missing columns: {', '.join(missing)}")
    out = []
    seen: set[tuple[str, str]] = set()
    for i, row in enumerate(rows, 1):
        family_id = (row.get("family_id") or "").strip()
        fact_id = (row.get("fact_id") or "").strip()
        if family_id not in WAVE_1A_FAMILIES:
            raise ValueError(f"signature-facts.csv row {i}: unknown family_id {family_id!r}")
        if not fact_id or not STABLE_ID_RE.match(fact_id):
            raise ValueError(f"signature-facts.csv row {i}: bad fact_id {fact_id!r}")
        key = (family_id, fact_id)
        if key in seen:
            raise ValueError(f"signature-facts.csv duplicate {family_id}/{fact_id}")
        seen.add(key)
        for required in (
            "fact",
            "question_en",
            "question_fr",
            "section_fed",
            "why_en",
            "why_fr",
            "label",
        ):
            if not (row.get(required) or "").strip():
                raise ValueError(f"signature-facts.csv row {i}: empty {required}")
        normative = [
            s.strip() for s in (row.get("normative_sources") or "").split(";") if s.strip()
        ]
        out.append(
            {
                "family_id": family_id,
                "level": (row.get("level") or "all").strip() or "all",
                "fact_id": fact_id,
                "fact": row["fact"].strip(),
                "question_en": row["question_en"].strip(),
                "question_fr": row["question_fr"].strip(),
                "section_fed": row["section_fed"].strip(),
                "why_en": row["why_en"].strip(),
                "why_fr": row["why_fr"].strip(),
                "top_count": _parse_int(row.get("top_count") or "0", "top_count"),
                "bottom_count": _parse_int(row.get("bottom_count") or "0", "bottom_count"),
                "evidence_adverts": _parse_int(
                    row.get("evidence_adverts") or "0", "evidence_adverts"
                ),
                "evidence_note": (row.get("evidence_note") or "").strip(),
                "normative_sources": normative,
                "label": row["label"].strip(),
            }
        )
    return out


def read_duty_group_names(path: Path = DUTY_GROUP_NAMES) -> list[dict]:
    if not path.is_file():
        raise FileNotFoundError(f"duty-group-names.csv missing: {path}")
    with path.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        raise ValueError("duty-group-names.csv has no data rows")
    header = list(rows[0].keys())
    missing = [c for c in DUTY_GROUP_FIELDS if c not in header]
    if missing:
        raise ValueError(f"duty-group-names.csv missing columns: {', '.join(missing)}")
    out = []
    seen: set[tuple[str, int]] = set()
    seen_stable: set[str] = set()
    for i, row in enumerate(rows, 1):
        family_id = (row.get("family_id") or "").strip()
        if family_id not in WAVE_1A_FAMILIES:
            raise ValueError(f"duty-group-names.csv row {i}: unknown family_id {family_id!r}")
        group_id = _parse_int(row.get("group_id") or "", "group_id")
        key = (family_id, group_id)
        if key in seen:
            raise ValueError(f"duty-group-names.csv duplicate {family_id}/{group_id}")
        seen.add(key)
        named = _parse_bool(row.get("named") or "false")
        stable_id = (row.get("stable_id") or "").strip()
        name_en = (row.get("name_en") or "").strip()
        name_fr = (row.get("name_fr") or "").strip()
        heuristic = (row.get("heuristic_name") or "").strip()
        if not heuristic:
            raise ValueError(f"duty-group-names.csv row {i}: empty heuristic_name")
        if named:
            if not stable_id or not STABLE_ID_RE.match(stable_id):
                raise ValueError(f"duty-group-names.csv row {i}: bad stable_id {stable_id!r}")
            if stable_id in seen_stable:
                raise ValueError(f"duty-group-names.csv duplicate stable_id {stable_id}")
            seen_stable.add(stable_id)
            if not name_en or not name_fr:
                raise ValueError(f"duty-group-names.csv row {i}: named row needs name_en/name_fr")
        else:
            if stable_id:
                raise ValueError(f"duty-group-names.csv row {i}: unnamed row must leave stable_id empty")
            if name_en or name_fr:
                raise ValueError(f"duty-group-names.csv row {i}: unnamed row must leave names empty")
        out.append(
            {
                "family_id": family_id,
                "group_id": group_id,
                "heuristic_name": heuristic,
                "stable_id": stable_id or None,
                "name_en": name_en or None,
                "name_fr": name_fr or None,
                "named": named,
                "line_count": _parse_int(row.get("line_count") or "0", "line_count"),
                "advert_count": _parse_int(row.get("advert_count") or "0", "advert_count"),
                "organisation_count": _parse_int(
                    row.get("organisation_count") or "0", "organisation_count"
                ),
                "label": (row.get("label") or "Fact").strip() or "Fact",
            }
        )
    return out


def is_noise_group_name(name_en: str | None) -> bool:
    text = (name_en or "").lower()
    return any(marker in text for marker in NOISE_NAME_MARKERS)


def read_duty_phrasing(path: Path = DUTY_PHRASING) -> list[dict]:
    if not path.is_file():
        return []
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        header = list(reader.fieldnames or [])
        rows = list(reader)
    if not rows:
        return []
    missing = [c for c in DUTY_PHRASING_FIELDS if c not in header]
    if missing:
        raise ValueError(f"duty-phrasing.csv missing columns: {', '.join(missing)}")
    out = []
    seen: set[str] = set()
    for i, row in enumerate(rows, 1):
        stable_id = (row.get("stable_id") or "").strip()
        family_id = (row.get("family_id") or "").strip()
        if family_id not in WAVE_1A_FAMILIES:
            raise ValueError(f"duty-phrasing.csv row {i}: unknown family_id {family_id!r}")
        if not stable_id or not STABLE_ID_RE.match(stable_id):
            raise ValueError(f"duty-phrasing.csv row {i}: bad stable_id {stable_id!r}")
        if stable_id in seen:
            raise ValueError(f"duty-phrasing.csv duplicate stable_id {stable_id}")
        seen.add(stable_id)
        skip = (row.get("skip") or "").strip()
        best_en = (row.get("best_en") or "").strip()
        best_fr = (row.get("best_fr") or "").strip()
        weak_en = (row.get("weak_en") or "").strip()
        weak_fr = (row.get("weak_fr") or "").strip()
        slots = [s.strip() for s in (row.get("slots") or "").split(";") if s.strip()]
        label = (row.get("label") or "Estimate").strip() or "Estimate"
        if skip:
            if best_en or best_fr:
                raise ValueError(
                    f"duty-phrasing.csv row {i}: skip set but best_en/best_fr filled"
                )
        else:
            if not best_en or not best_fr:
                raise ValueError(f"duty-phrasing.csv row {i}: needs best_en and best_fr")
            if not weak_en or not weak_fr:
                raise ValueError(f"duty-phrasing.csv row {i}: needs weak_en and weak_fr")
        out.append(
            {
                "stable_id": stable_id,
                "family_id": family_id,
                "skip": skip,
                "best_en": best_en or None,
                "best_fr": best_fr or None,
                "slots": slots,
                "weak_en": weak_en or None,
                "weak_fr": weak_fr or None,
                "label": label,
            }
        )
    return out


def reference_path(family_id: str, fmt: str, language: str) -> Path:
    return REFERENCE_DIR / f"{family_id}-{fmt}.{language}.md"


def read_reference_jds() -> list[dict]:
    """Load kept reference JD metadata from committed markdown under library/reference/."""
    if not REFERENCE_DIR.is_dir():
        return []
    out: list[dict] = []
    for family_id in WAVE_1A_FAMILIES:
        for fmt in REFERENCE_FORMATS:
            for language in REFERENCE_LANGUAGES:
                path = reference_path(family_id, fmt, language)
                if not path.is_file():
                    continue
                text = path.read_text(encoding="utf-8")
                if not text.strip():
                    raise ValueError(f"empty reference file: {path.name}")
                if "aidjobs-reference-status: kept" not in text.lower():
                    # Drafts may exist before blind scoring; they do not flip ready.
                    continue
                relative = f"role-survey/library/reference/{path.name}"
                out.append(
                    {
                        "family_id": family_id,
                        "format": fmt,
                        "format_label": FORMAT_LABELS[fmt],
                        "language": language,
                        "level": FAMILY_REFERENCE_LEVEL[family_id],
                        "path": relative,
                        "sha256": sha256_file(path),
                        "status": "kept_after_blind_scoring",
                        "label": "Estimate",
                    }
                )
    return out


def normative_catalog(rows: list[dict], source_ids: tuple[str, ...]) -> list[dict]:
    by_id = {r["source_id"]: r for r in rows}
    out = []
    for sid in source_ids:
        row = by_id.get(sid)
        if not row:
            raise KeyError(f"normative-sources.csv has no row for {sid!r}")
        out.append(
            {
                "source_id": sid,
                "name": row["name"],
                "publisher": row["publisher"],
                "edition": row.get("edition") or "",
                "label": row.get("label") or "Unverified",
            }
        )
    return out


def deep_reconciled_path(family_id: str) -> Path:
    return adverts.WORK / "stage2" / family_id / "reconciled.json"


def deep_reconciled_seal_prefix(family_id: str) -> str | None:
    """The sealed deep reconciled set's hash prefix, when present and valid in the archive."""
    root = adverts.WORK / "stage2" / family_id
    seal = root / "reconciled.sha256"
    reconciled = root / "reconciled.json"
    if not seal.is_file() or not reconciled.is_file():
        return None
    expected = seal.read_text(encoding="utf-8").strip()
    # Seals are byte-identity of reconciled.json as written (may be CRLF on Windows).
    if sha256_file_raw(reconciled) != expected:
        return None
    return expected[:12]


def archive_available() -> bool:
    return adverts.WORK.is_dir()


def deep_scores_ok_for_ready(family_id: str) -> bool:
    """True when deep fields may flip ready.

    Locally (archive present): live seal must match DEEP_SEAL_PREFIX.
    On CI (no archive): the committed prefix constant is the trust root.
    """
    expected = DEEP_SEAL_PREFIX[family_id]
    if not archive_available():
        return bool(expected)
    prefix = deep_reconciled_seal_prefix(family_id)
    return prefix is not None and prefix == expected


def live_seal_problems() -> list[str]:
    """When the archive is present, every family seal must match or build/check fail."""
    if not archive_available():
        return []
    problems = []
    for fid in WAVE_1A_FAMILIES:
        prefix = deep_reconciled_seal_prefix(fid)
        expected = DEEP_SEAL_PREFIX[fid]
        if prefix is None:
            problems.append(
                f"{fid}: archive reconciled.json does not match reconciled.sha256 "
                f"(raw-byte seal; expected prefix {expected})"
            )
        elif prefix != expected:
            problems.append(
                f"{fid}: archive seal prefix {prefix!r} != DEEP_SEAL_PREFIX {expected!r}"
            )
    return problems


def deep_scores_sealed_in_archive(family_id: str) -> bool:
    prefix = deep_reconciled_seal_prefix(family_id)
    return prefix is not None and prefix == DEEP_SEAL_PREFIX[family_id]


def measured_block(measured: dict, family_id: str) -> dict:
    families = measured.get("families") or {}
    if family_id not in families:
        raise KeyError(f"wave-1a-broad-measured.json has no family {family_id!r}")
    block = dict(families[family_id])
    block["evidence_label"] = "Fact"
    block["evidence_note"] = (
        "Counts and medians from the committed broad layer (wave-1a-broad-measured.json); "
        "not deep Option A sealed scores."
    )
    if "partial_score" in block:
        ps = dict(block["partial_score"])
        ps.setdefault("label", "Estimate")
        block["partial_score"] = ps
    return block


def duty_grouping_counts(measured: dict, family_id: str) -> dict | None:
    groups = (measured.get("duty_grouping") or {}).get(family_id)
    if not groups:
        return None
    return {
        "label": "Fact",
        "evidence_note": (
            "Counts only from the broad-layer duty-line grouping run; paraphrases stay in the "
            "archive (stage2/measured/{family}/duty-banks.jsonl)."
        ),
        "archive_pointer": ARCHIVE_DUTY_GROUPS.format(family_id=family_id),
        "n_adverts": groups["n_adverts"],
        "n_duty_lines": groups["n_duty_lines"],
        "n_organisations": groups["n_organisations"],
        "n_groups_reported": groups["n_groups_reported"],
        "lines_in_reported_groups": groups["lines_in_reported_groups"],
        "pct_lines_covered": groups["pct_lines_covered"],
    }


def signature_questions_for_family(facts: list[dict], family_id: str) -> list[dict]:
    rows = [f for f in facts if f["family_id"] == family_id]
    rows.sort(key=lambda r: r["fact_id"])
    return [
        {
            "fact_id": r["fact_id"],
            "fact": r["fact"],
            "level": r["level"],
            "question_en": r["question_en"],
            "question_fr": r["question_fr"],
            "section_fed": r["section_fed"],
            "why_en": r["why_en"],
            "why_fr": r["why_fr"],
            "top_count": r["top_count"],
            "bottom_count": r["bottom_count"],
            "evidence_adverts": r["evidence_adverts"],
            "evidence_note": r["evidence_note"],
            "normative_sources": r["normative_sources"],
            "label": r["label"],
        }
        for r in rows
    ]


def duty_groups_for_family(groups: list[dict], family_id: str) -> list[dict]:
    rows = [g for g in groups if g["family_id"] == family_id]
    rows.sort(key=lambda r: (-r["advert_count"], -r["line_count"], r["group_id"]))
    return [
        {
            "group_id": r["group_id"],
            "heuristic_name": r["heuristic_name"],
            "stable_id": r["stable_id"],
            "name_en": r["name_en"],
            "name_fr": r["name_fr"],
            "named": r["named"],
            "line_count": r["line_count"],
            "advert_count": r["advert_count"],
            "organisation_count": r["organisation_count"],
            "label": r["label"],
            "phrasing": None,
        }
        for r in rows
    ]


def phrasing_lines_for_family(phrasing_rows: list[dict], family_id: str) -> list[dict]:
    rows = [r for r in phrasing_rows if r["family_id"] == family_id]
    rows.sort(key=lambda r: r["stable_id"])
    out = []
    for r in rows:
        if r["skip"]:
            out.append(
                {
                    "stable_id": r["stable_id"],
                    "skip": r["skip"],
                    "best_en": None,
                    "best_fr": None,
                    "slots": [],
                    "weak_en": None,
                    "weak_fr": None,
                    "label": r["label"],
                }
            )
        else:
            out.append(
                {
                    "stable_id": r["stable_id"],
                    "skip": None,
                    "best_en": r["best_en"],
                    "best_fr": r["best_fr"],
                    "slots": list(r["slots"]),
                    "weak_en": r["weak_en"],
                    "weak_fr": r["weak_fr"],
                    "label": r["label"],
                }
            )
    return out


def deep_fields_ready_for(
    family_id: str,
    signature_questions: list[dict],
    duty_groups: list[dict],
    phrasing_rows: list[dict],
    reference_rows: list[dict],
) -> dict[str, bool]:
    seals_ok = deep_scores_ok_for_ready(family_id)
    named = [g for g in duty_groups if g["named"]]
    naming_ok = (
        seals_ok
        and len(named) >= 1
        and all(g["advert_count"] >= DUTY_NAME_ADVERT_FLOOR for g in named)
        and all(g["stable_id"] and g["name_en"] and g["name_fr"] for g in named)
    )
    facts_ok = seals_ok and len(signature_questions) >= MIN_SIGNATURE_FACTS
    by_stable = {r["stable_id"]: r for r in phrasing_rows if r["family_id"] == family_id}
    phrasing_ok = False
    if seals_ok and naming_ok and named:
        complete = True
        for g in named:
            row = by_stable.get(g["stable_id"])
            if row is None:
                complete = False
                break
            noise = is_noise_group_name(g["name_en"])
            if noise:
                if not row["skip"]:
                    complete = False
                    break
            else:
                if row["skip"] or not row["best_en"] or not row["best_fr"]:
                    complete = False
                    break
        phrasing_ok = complete and len(by_stable) == len(named)
    expected_refs = len(REFERENCE_FORMATS) * len(REFERENCE_LANGUAGES)
    family_refs = [r for r in reference_rows if r["family_id"] == family_id]
    reference_ok = seals_ok and len(family_refs) == expected_refs
    return {
        "duty_bank_naming": naming_ok,
        "duty_bank_phrasing": phrasing_ok,
        "signature_fact_questions": facts_ok,
        "reference_jds": reference_ok,
    }


def build_family(
    family_id: str,
    norm_rows: list[dict],
    measured: dict,
    built_from: dict,
    built_at: str,
    signature_facts: list[dict],
    duty_groups: list[dict],
    phrasing_rows: list[dict],
    reference_rows: list[dict],
) -> dict:
    un_variant = normative_catalog(norm_rows, (UN_VARIANT_SOURCE_ID,))
    questions = signature_questions_for_family(signature_facts, family_id)
    groups = duty_groups_for_family(duty_groups, family_id)
    ready = deep_fields_ready_for(
        family_id, questions, groups, phrasing_rows, reference_rows
    )
    phrasing_lines = (
        phrasing_lines_for_family(phrasing_rows, family_id)
        if ready["duty_bank_phrasing"]
        else []
    )
    refs = [r for r in reference_rows if r["family_id"] == family_id]
    refs.sort(key=lambda r: (r["format"], r["language"]))
    return {
        "schema_version": SCHEMA_VERSION,
        "family_id": family_id,
        "name_en": FAMILY_NAMES[family_id],
        "wave": WAVE,
        "built_at": built_at,
        "built_from": built_from,
        "normative_sources": {
            "default_source_ids": list(DEFAULT_NORMATIVE_SOURCE_IDS),
            "default": normative_catalog(norm_rows, DEFAULT_NORMATIVE_SOURCE_IDS),
            "variants": {
                "un_organisation_type": {
                    "label": "Estimate",
                    "note": (
                        "Templates do not insert this standard by default (role-survey.md 19.21); "
                        "the chat asks whether the role works to a named standard. Cite only when "
                        "organisation type is UN."
                    ),
                    "source_ids": [UN_VARIANT_SOURCE_ID],
                    "sources": un_variant,
                },
            },
        },
        "measured_broad": measured_block(measured, family_id),
        "duty_bank": {
            "deep_fields_ready": ready["duty_bank_phrasing"],
            "naming_ready": ready["duty_bank_naming"],
            "archive_measured_pointer": ARCHIVE_MEASURED,
            "grouping_counts": duty_grouping_counts(measured, family_id),
            "groups": groups,
            "phrasing": None,
            "phrasing_lines": phrasing_lines,
            "naming_note": (
                f"AidJobs names for groups with advert_count >= {DUTY_NAME_ADVERT_FLOOR}; "
                "thinner groups keep heuristic names only (named false). "
                "Best-quarter lines live in phrasing_lines; groups[].phrasing stays null."
            ),
        },
        "signature_fact_questions": questions if ready["signature_fact_questions"] else [],
        "reference_jds": refs if ready["reference_jds"] else [],
        "recognition": {"status": "pending", "label": "Estimate"},
        "requirements_by_level": {"status": "pending", "label": "Estimate"},
        "standards_application": {
            "label": "Estimate",
            "note": "Standards-first findings from role-survey.md 19.21; template wording comes later.",
        },
        "deep_option_a_scores": {
            "status": "sealed_in_archive",
            "seal_prefix": DEEP_SEAL_PREFIX[family_id],
            "archive_reconciled_pointer": ARCHIVE_DEEP_RECONCILED.format(family_id=family_id),
            "label": "Estimate",
            "note": (
                "Full nine-dimension sealed scores stay in the archive; library ready flags use the "
                "seal prefix (live-checked when the archive is present)."
            ),
        },
        "deep_fields_ready": ready,
    }


def input_built_from(
    norm_rows: list[dict],
    measured: dict,
    signature_facts: list[dict],
    duty_groups: list[dict],
    phrasing_rows: list[dict],
    reference_rows: list[dict],
) -> dict:
    phrasing_hash = sha256_file(DUTY_PHRASING) if DUTY_PHRASING.is_file() else ""
    ref_material = "|".join(
        sorted(f"{r['path']}:{r['sha256']}" for r in reference_rows)
    )
    ref_hash = hashlib.sha256(ref_material.encode("utf-8")).hexdigest() if reference_rows else ""
    return {
        "normative_sources_sha256": sha256_file(NORMATIVE),
        "wave_1a_broad_measured_sha256": sha256_file(MEASURED),
        "signature_facts_sha256": sha256_file(SIGNATURE_FACTS),
        "duty_group_names_sha256": sha256_file(DUTY_GROUP_NAMES),
        "duty_phrasing_sha256": phrasing_hash,
        "reference_jds_sha256": ref_hash,
        "wave_1a_families": WAVE_1A_FAMILIES,
        "normative_row_count": len(norm_rows),
        "signature_fact_row_count": len(signature_facts),
        "duty_group_row_count": len(duty_groups),
        "duty_phrasing_row_count": len(phrasing_rows),
        "reference_jd_count": len(reference_rows),
        "measured_generated_at": measured.get("generated_at"),
    }


def deterministic_built_at(built_from: dict) -> str:
    """Stable stamp from input hashes so CI rebuild matches the committed library."""
    material = "|".join(
        [
            built_from["normative_sources_sha256"],
            built_from["wave_1a_broad_measured_sha256"],
            built_from["signature_facts_sha256"],
            built_from["duty_group_names_sha256"],
            built_from.get("duty_phrasing_sha256") or "",
            built_from.get("reference_jds_sha256") or "",
            SCHEMA_VERSION,
        ]
    )
    digest = hashlib.sha256(material.encode("utf-8")).hexdigest()[:12]
    return f"wave1a-{SCHEMA_VERSION}-{digest}"


def build_family_files(
    norm_rows: list[dict],
    measured: dict,
    signature_facts: list[dict],
    duty_groups: list[dict],
    phrasing_rows: list[dict] | None = None,
    reference_rows: list[dict] | None = None,
) -> dict[str, dict]:
    phrasing_rows = [] if phrasing_rows is None else phrasing_rows
    reference_rows = [] if reference_rows is None else reference_rows
    built_from = input_built_from(
        norm_rows, measured, signature_facts, duty_groups, phrasing_rows, reference_rows
    )
    built_at = deterministic_built_at(built_from)
    families = measured.get("families") or {}
    missing = [f for f in WAVE_1A_FAMILIES if f not in families]
    if missing:
        raise ValueError(f"wave-1a-broad-measured.json missing families: {', '.join(missing)}")
    extra = sorted(set(families) - set(WAVE_1A_FAMILIES))
    if extra:
        raise ValueError(f"wave-1a families list does not match measured keys: extra {extra!r}")
    named_ids = {
        g["stable_id"]
        for g in duty_groups
        if g["named"] and g["stable_id"]
    }
    for row in phrasing_rows:
        if row["stable_id"] not in named_ids:
            raise ValueError(
                f"duty-phrasing.csv stable_id {row['stable_id']} is not a named duty group"
            )
    for fid in WAVE_1A_FAMILIES:
        n_facts = sum(1 for r in signature_facts if r["family_id"] == fid)
        if n_facts < MIN_SIGNATURE_FACTS:
            raise ValueError(
                f"{fid}: need at least {MIN_SIGNATURE_FACTS} signature facts, found {n_facts}"
            )
        named = [g for g in duty_groups if g["family_id"] == fid and g["named"]]
        if not named:
            raise ValueError(f"{fid}: duty-group-names.csv has no named groups")
        family_groups = [g for g in duty_groups if g["family_id"] == fid]
        reported = ((measured.get("duty_grouping") or {}).get(fid) or {}).get("n_groups_reported")
        if reported is not None and len(family_groups) != reported:
            raise ValueError(
                f"{fid}: duty-group-names.csv has {len(family_groups)} groups, "
                f"measured n_groups_reported is {reported}"
            )
        for g in family_groups:
            should_name = g["advert_count"] >= DUTY_NAME_ADVERT_FLOOR
            if g["named"] != should_name:
                raise ValueError(
                    f"{fid} group {g['group_id']}: named={g['named']} but "
                    f"advert_count={g['advert_count']} (floor {DUTY_NAME_ADVERT_FLOOR})"
                )
    seal_problems = live_seal_problems()
    if seal_problems:
        raise ValueError("; ".join(seal_problems))
    return {
        fid: build_family(
            fid,
            norm_rows,
            measured,
            built_from,
            built_at,
            signature_facts,
            duty_groups,
            phrasing_rows,
            reference_rows,
        )
        for fid in WAVE_1A_FAMILIES
    }


def build_index(family_docs: dict[str, dict], measured: dict) -> dict:
    built_at = family_docs[WAVE_1A_FAMILIES[0]]["built_at"]
    return {
        "schema_version": SCHEMA_VERSION,
        "wave": WAVE,
        "built_at": built_at,
        "families": [
            {
                "family_id": fid,
                "file": f"{fid}.json",
                "name_en": FAMILY_NAMES[fid],
                "deep_fields_ready": family_docs[fid]["deep_fields_ready"],
            }
            for fid in WAVE_1A_FAMILIES
        ],
        "inputs": {
            "normative_sources": "role-survey/normative-sources.csv",
            "wave_1a_broad_measured": "role-survey/wave-1a-broad-measured.json",
            "signature_facts": "role-survey/signature-facts.csv",
            "duty_group_names": "role-survey/duty-group-names.csv",
            "duty_phrasing": "role-survey/duty-phrasing.csv",
            "reference_dir": "role-survey/library/reference/",
            "wave_1a_families": WAVE_1A_FAMILIES,
        },
    }


def _ready_schema() -> dict:
    ready_props = {k: {"type": "boolean"} for k in DEEP_FIELDS_READY_KEYS}
    return {
        "type": "object",
        "required": list(DEEP_FIELDS_READY_KEYS),
        "properties": ready_props,
        "additionalProperties": False,
    }


def _group_schema() -> dict:
    return {
        "type": "object",
        "required": [
            "group_id",
            "heuristic_name",
            "named",
            "line_count",
            "advert_count",
            "organisation_count",
            "label",
            "phrasing",
        ],
        "properties": {
            "group_id": {"type": "integer"},
            "heuristic_name": {"type": "string"},
            "stable_id": {"type": ["string", "null"]},
            "name_en": {"type": ["string", "null"]},
            "name_fr": {"type": ["string", "null"]},
            "named": {"type": "boolean"},
            "line_count": {"type": "integer"},
            "advert_count": {"type": "integer"},
            "organisation_count": {"type": "integer"},
            "label": {"type": "string"},
            "phrasing": {"type": "null"},
        },
        "additionalProperties": False,
    }


def family_schema() -> dict:
    ready_schema = _ready_schema()
    return {
        "type": "object",
        "required": [
            "schema_version",
            "wave",
            "family_id",
            "name_en",
            "built_at",
            "built_from",
            "normative_sources",
            "measured_broad",
            "duty_bank",
            "signature_fact_questions",
            "reference_jds",
            "deep_fields_ready",
            "deep_option_a_scores",
        ],
        "properties": {
            "schema_version": {"type": "string", "const": SCHEMA_VERSION},
            "wave": {"type": "string", "const": WAVE},
            "built_at": {
                "type": "string",
                "description": "Deterministic id wave1a-{schema}-{hash12}, not a timestamp.",
            },
            "family_id": {"type": "string"},
            "name_en": {"type": "string"},
            "built_from": {"type": "object"},
            "normative_sources": {
                "type": "object",
                "required": ["default_source_ids", "default", "variants"],
                "properties": {
                    "default_source_ids": {"type": "array", "items": {"type": "string"}},
                    "default": {"type": "array"},
                    "variants": {"type": "object"},
                },
                "additionalProperties": False,
            },
            "measured_broad": {
                "type": "object",
                "description": "Broad measured block; left open in this stage.",
            },
            "duty_bank": {
                "type": "object",
                "required": [
                    "groups",
                    "phrasing",
                    "phrasing_lines",
                    "naming_ready",
                    "deep_fields_ready",
                ],
                "properties": {
                    "deep_fields_ready": {"type": "boolean"},
                    "naming_ready": {"type": "boolean"},
                    "archive_measured_pointer": {"type": "string"},
                    "grouping_counts": {"type": ["object", "null"]},
                    "groups": {"type": "array", "items": _group_schema()},
                    "phrasing": {"type": "null"},
                    "phrasing_lines": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": [
                                "stable_id",
                                "skip",
                                "best_en",
                                "best_fr",
                                "slots",
                                "weak_en",
                                "weak_fr",
                                "label",
                            ],
                            "properties": {
                                "stable_id": {"type": "string"},
                                "skip": {"type": ["string", "null"]},
                                "best_en": {"type": ["string", "null"]},
                                "best_fr": {"type": ["string", "null"]},
                                "slots": {"type": "array", "items": {"type": "string"}},
                                "weak_en": {"type": ["string", "null"]},
                                "weak_fr": {"type": ["string", "null"]},
                                "label": {"type": "string"},
                            },
                            "additionalProperties": False,
                        },
                    },
                    "naming_note": {"type": "string"},
                },
                "additionalProperties": False,
            },
            "signature_fact_questions": {"type": "array"},
            "reference_jds": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": [
                        "family_id",
                        "format",
                        "format_label",
                        "language",
                        "level",
                        "path",
                        "sha256",
                        "status",
                        "label",
                    ],
                    "properties": {
                        "family_id": {"type": "string"},
                        "format": {"type": "string"},
                        "format_label": {"type": "string"},
                        "language": {"type": "string"},
                        "level": {"type": "string"},
                        "path": {"type": "string"},
                        "sha256": {"type": "string"},
                        "status": {"type": "string"},
                        "label": {"type": "string"},
                    },
                    "additionalProperties": False,
                },
            },
            "recognition": {"type": "object"},
            "requirements_by_level": {"type": "object"},
            "standards_application": {"type": "object"},
            "deep_option_a_scores": {"type": "object"},
            "deep_fields_ready": ready_schema,
        },
        "additionalProperties": False,
    }


def index_schema() -> dict:
    ready_schema = _ready_schema()
    return {
        "type": "object",
        "required": ["schema_version", "wave", "built_at", "families", "inputs"],
        "properties": {
            "schema_version": {"type": "string", "const": SCHEMA_VERSION},
            "wave": {"type": "string", "const": WAVE},
            "built_at": {
                "type": "string",
                "description": "Deterministic id wave1a-{schema}-{hash12}, not a timestamp.",
            },
            "families": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["family_id", "file", "name_en", "deep_fields_ready"],
                    "properties": {
                        "family_id": {"type": "string"},
                        "file": {"type": "string"},
                        "name_en": {"type": "string"},
                        "deep_fields_ready": ready_schema,
                    },
                    "additionalProperties": False,
                },
            },
            "inputs": {"type": "object"},
        },
        "additionalProperties": False,
    }


def schema_document() -> dict:
    """JSON Schema document committed as library/schema.json (family + index shapes)."""
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "https://aidjobs.app/role-survey/library/schema.json",
        "title": "AidJobs role library (wave 1a)",
        "description": (
            "Family files use $defs.family; index.json uses $defs.index. "
            f"schema_version {SCHEMA_VERSION}. built_at is a deterministic id from input hashes, "
            "not an ISO timestamp. CI walks type/required/const/items/additionalProperties:false."
        ),
        "schema_version": SCHEMA_VERSION,
        "$defs": {
            "family": family_schema(),
            "index": index_schema(),
            "deep_fields_ready": _ready_schema(),
            "duty_group": _group_schema(),
        },
    }


def _type_ok(value: object, expected: object) -> bool:
    if expected == "null":
        return value is None
    if expected == "string":
        return isinstance(value, str)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "array":
        return isinstance(value, list)
    if expected == "object":
        return isinstance(value, dict)
    return False


def validate_schema_subset(doc: object, schema: dict, path: str = "$") -> list[str]:
    """Stated JSON Schema subset: type, required, const, items, additionalProperties false."""
    problems: list[str] = []
    expected_type = schema.get("type")
    if expected_type is not None:
        if isinstance(expected_type, list):
            if not any(_type_ok(doc, t) for t in expected_type):
                problems.append(f"{path}: type must be one of {expected_type}")
                return problems
        elif not _type_ok(doc, expected_type):
            problems.append(f"{path}: type must be {expected_type}")
            return problems
    if "const" in schema and doc != schema["const"]:
        problems.append(f"{path}: const {schema['const']!r} required")
    if isinstance(doc, dict):
        for key in schema.get("required") or []:
            if key not in doc:
                problems.append(f"{path}: missing required {key}")
        props = schema.get("properties") or {}
        if schema.get("additionalProperties") is False:
            for key in doc:
                if key not in props:
                    problems.append(f"{path}: unexpected property {key}")
        for key, child_schema in props.items():
            if key in doc:
                problems += validate_schema_subset(doc[key], child_schema, f"{path}.{key}")
    if isinstance(doc, list) and "items" in schema:
        for i, item in enumerate(doc):
            problems += validate_schema_subset(item, schema["items"], f"{path}[{i}]")
    return problems


def write_schema(dest: Path = SCHEMA_PATH) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(canonical_json(schema_document()), encoding="utf-8", newline="\n")


def write_library(family_docs: dict[str, dict], index: dict, dest: Path = LIBRARY) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    write_schema(dest / "schema.json")
    (dest / "index.json").write_text(canonical_json(index), encoding="utf-8", newline="\n")
    for fid, doc in family_docs.items():
        (dest / f"{fid}.json").write_text(canonical_json(doc), encoding="utf-8", newline="\n")


def load_committed_library(dest: Path = LIBRARY) -> tuple[dict, dict[str, dict]]:
    index = json.loads((dest / "index.json").read_text(encoding="utf-8"))
    families = {}
    for fid in WAVE_1A_FAMILIES:
        path = dest / f"{fid}.json"
        if not path.is_file():
            raise FileNotFoundError(f"{path} missing")
        families[fid] = json.loads(path.read_text(encoding="utf-8"))
    return index, families


def validate_normative_citations(doc: dict, family_id: str) -> list[str]:
    problems = []
    ns = doc.get("normative_sources") or {}
    default_ids = ns.get("default_source_ids") or []
    for sid in DEFAULT_NORMATIVE_SOURCE_IDS:
        if sid not in default_ids:
            problems.append(f"{family_id}: default_source_ids missing {sid}")
    if UN_VARIANT_SOURCE_ID in default_ids:
        problems.append(
            f"{family_id}: {UN_VARIANT_SOURCE_ID} must not be in default_source_ids (19.21)"
        )
    variants = (ns.get("variants") or {}).get("un_organisation_type") or {}
    if UN_VARIANT_SOURCE_ID not in (variants.get("source_ids") or []):
        problems.append(f"{family_id}: UN variant note missing {UN_VARIANT_SOURCE_ID}")
    deep_scores = doc.get("deep_option_a_scores") or {}
    if deep_scores.get("status") != "sealed_in_archive":
        problems.append(f"{family_id}: deep_option_a_scores.status must be sealed_in_archive")
    prefix = deep_scores.get("seal_prefix")
    if prefix != DEEP_SEAL_PREFIX[family_id]:
        problems.append(f"{family_id}: deep_option_a_scores.seal_prefix wrong ({prefix!r})")
    if doc.get("schema_version") != SCHEMA_VERSION:
        problems.append(f"{family_id}: schema_version must be {SCHEMA_VERSION}")
    return problems


def validate_deep_fields_ready(doc: dict, family_id: str) -> list[str]:
    problems = []
    ready = doc.get("deep_fields_ready") or {}
    for key in DEEP_FIELDS_READY_KEYS:
        if key not in ready:
            problems.append(f"{family_id}: deep_fields_ready missing {key}")
    duty_bank = doc.get("duty_bank") or {}
    if duty_bank.get("deep_fields_ready") and not ready.get("duty_bank_phrasing"):
        problems.append(f"{family_id}: duty_bank.deep_fields_ready disagrees with deep_fields_ready")
    if duty_bank.get("naming_ready") and not ready.get("duty_bank_naming"):
        problems.append(f"{family_id}: duty_bank.naming_ready disagrees with deep_fields_ready")
    any_ready = any(ready.get(k) for k in DEEP_FIELDS_READY_KEYS)
    if any_ready and not deep_scores_ok_for_ready(family_id):
        problems.append(
            f"{family_id}: deep_fields_ready claims true but deep seal is not ok "
            f"(expected prefix {DEEP_SEAL_PREFIX[family_id]})"
        )
    phrasing = duty_bank.get("phrasing")
    if phrasing is not None:
        problems.append(f"{family_id}: duty_bank.phrasing must stay null (use phrasing_lines)")
    phrasing_lines = duty_bank.get("phrasing_lines") or []
    if phrasing_lines and not ready.get("duty_bank_phrasing"):
        problems.append(f"{family_id}: phrasing_lines present but duty_bank_phrasing not ready")
    if ready.get("duty_bank_phrasing") and not phrasing_lines:
        problems.append(f"{family_id}: duty_bank_phrasing ready without phrasing_lines")
    questions = doc.get("signature_fact_questions") or []
    if questions and not ready.get("signature_fact_questions"):
        problems.append(f"{family_id}: signature_fact_questions present but not marked ready")
    if ready.get("signature_fact_questions") and len(questions) < MIN_SIGNATURE_FACTS:
        problems.append(
            f"{family_id}: signature_fact_questions ready needs >= {MIN_SIGNATURE_FACTS} questions"
        )
    refs = doc.get("reference_jds") or []
    if refs and not ready.get("reference_jds"):
        problems.append(f"{family_id}: reference_jds present but not marked ready")
    expected_refs = len(REFERENCE_FORMATS) * len(REFERENCE_LANGUAGES)
    if ready.get("reference_jds") and len(refs) != expected_refs:
        problems.append(
            f"{family_id}: reference_jds ready needs {expected_refs} kept files, found {len(refs)}"
        )
    groups = duty_bank.get("groups") or []
    named = [g for g in groups if g.get("named")]
    if ready.get("duty_bank_naming"):
        if not named:
            problems.append(f"{family_id}: duty_bank_naming ready without named groups")
        for g in named:
            if not g.get("stable_id") or not g.get("name_en") or not g.get("name_fr"):
                problems.append(f"{family_id}: named group missing id or names")
            if int(g.get("advert_count") or 0) < DUTY_NAME_ADVERT_FLOOR:
                problems.append(
                    f"{family_id}: named group advert_count below {DUTY_NAME_ADVERT_FLOOR}"
                )
    if ready.get("duty_bank_phrasing"):
        by_line = {line.get("stable_id"): line for line in phrasing_lines}
        if len(by_line) != len(named):
            problems.append(
                f"{family_id}: phrasing_lines count {len(by_line)} != named groups {len(named)}"
            )
        for g in named:
            line = by_line.get(g.get("stable_id"))
            if line is None:
                problems.append(f"{family_id}: missing phrasing_lines for {g.get('stable_id')}")
                continue
            noise = is_noise_group_name(g.get("name_en"))
            if noise:
                if not line.get("skip"):
                    problems.append(
                        f"{family_id}: noise group {g.get('stable_id')} must set skip"
                    )
            else:
                if line.get("skip"):
                    problems.append(
                        f"{family_id}: phraseable group {g.get('stable_id')} must not skip"
                    )
                if not line.get("best_en") or not line.get("best_fr"):
                    problems.append(
                        f"{family_id}: phraseable group {g.get('stable_id')} needs best_en/fr"
                    )
    for g in groups:
        if g.get("phrasing") is not None:
            problems.append(f"{family_id}: group {g.get('group_id')} must keep phrasing null")
    return problems


def check_problems(dest: Path | None = None) -> list[str]:
    dest = LIBRARY if dest is None else dest
    problems = []
    problems += live_seal_problems()
    if list(WAVE_1A_FAMILIES) != [
        "programme_management",
        "meal",
        "communications_advocacy",
        "finance",
    ]:
        problems.append("WAVE_1A_FAMILIES drifted from wave 1a (19.19)")
    try:
        norm_rows = read_normative_rows()
        measured = load_measured()
        signature_facts = read_signature_facts()
        duty_groups = read_duty_group_names()
        phrasing_rows = read_duty_phrasing()
        reference_rows = read_reference_jds()
        built = build_family_files(
            norm_rows,
            measured,
            signature_facts,
            duty_groups,
            phrasing_rows,
            reference_rows,
        )
        fresh_index = build_index(built, measured)
        fresh_schema = schema_document()
    except (FileNotFoundError, KeyError, ValueError) as exc:
        return [str(exc)]
    if not dest.is_dir():
        problems.append(f"library output folder missing: {dest}")
        return problems
    schema_path = dest / "schema.json"
    if not schema_path.is_file():
        problems.append("library/schema.json missing")
    else:
        committed_schema = json.loads(schema_path.read_text(encoding="utf-8"))
        if committed_schema != fresh_schema:
            problems.append("library/schema.json out of date; run library.py build")
    try:
        committed_index, committed = load_committed_library(dest)
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        return problems + [str(exc)]
    if committed_index.get("schema_version") != SCHEMA_VERSION:
        problems.append(f"index.json schema_version must be {SCHEMA_VERSION}")
    if committed_index != fresh_index:
        problems.append("index.json out of date; run library.py build")
    problems += validate_schema_subset(committed_index, index_schema(), "index")
    for fid in WAVE_1A_FAMILIES:
        path = dest / f"{fid}.json"
        if not path.is_file():
            problems.append(f"{fid}.json missing")
            continue
        if committed[fid] != built[fid]:
            problems.append(f"{fid}.json out of date; run library.py build")
        problems += validate_schema_subset(committed[fid], family_schema(), fid)
        problems += validate_normative_citations(committed[fid], fid)
        problems += validate_deep_fields_ready(committed[fid], fid)
        default_ids = (committed[fid].get("normative_sources") or {}).get("default_source_ids") or []
        if UN_VARIANT_SOURCE_ID in default_ids:
            problems.append(f"{fid}: {UN_VARIANT_SOURCE_ID} must not be in default_source_ids (19.21)")
    return problems


def build(_args=None, dest: Path | None = None) -> int:
    dest = LIBRARY if dest is None else dest
    norm_rows = read_normative_rows()
    measured = load_measured()
    signature_facts = read_signature_facts()
    duty_groups = read_duty_group_names()
    phrasing_rows = read_duty_phrasing()
    reference_rows = read_reference_jds()
    family_docs = build_family_files(
        norm_rows,
        measured,
        signature_facts,
        duty_groups,
        phrasing_rows,
        reference_rows,
    )
    index = build_index(family_docs, measured)
    write_library(family_docs, index, dest)
    try:
        where = dest.relative_to(ROLES.parent)
    except ValueError:
        where = dest
    ready = {
        fid: family_docs[fid]["deep_fields_ready"] for fid in WAVE_1A_FAMILIES
    }
    print(
        f"build: wrote schema.json, index.json and {len(family_docs)} family files under {where}; "
        f"phrasing_rows={len(phrasing_rows)} reference_kept={len(reference_rows)} ready={ready}"
    )
    return 0


def check(_args=None, dest: Path | None = None) -> int:
    dest = LIBRARY if dest is None else dest
    problems = check_problems(dest)
    for msg in problems[:80]:
        print(msg)
    print(f"check: {len(problems)} problems")
    return 1 if problems else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("build")
    sub.add_parser("check")
    args = parser.parse_args(argv)
    return {"build": build, "check": check}[args.cmd](args)


if __name__ == "__main__":
    sys.path.insert(0, str(HERE))
    raise SystemExit(main())
