"""Role-content survey (W-54), Stage 3: wave-1a role library (role-survey.md 19.23; section 9).

Run on the user's machine; CI runs `build`, `check` and the tests:

  python tools/survey/library.py build
  python tools/survey/library.py check

Builds JSON under docs/architecture/role-survey/library/ from normative-sources.csv,
wave-1a-broad-measured.json, signature-facts.csv and duty-group-names.csv.
Measured broad-layer figures are copied with Fact labels; deep full scores stay sealed in the
archive (reconciled.json is never committed). Deep written fields flip deep_fields_ready only when
the committed inputs prove the content is present. Duty-bank phrasing and reference JDs stay
unready in this stage.
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
NORMATIVE = ROLES / "normative-sources.csv"
MEASURED = ROLES / "wave-1a-broad-measured.json"
SIGNATURE_FACTS = ROLES / "signature-facts.csv"
DUTY_GROUP_NAMES = ROLES / "duty-group-names.csv"
SCHEMA_PATH = LIBRARY / "schema.json"

SCHEMA_VERSION = "0.2.0"
WAVE = "1a"
MIN_SIGNATURE_FACTS = 3
DUTY_NAME_ADVERT_FLOOR = 5

WAVE_1A_FAMILIES = list(deep.FAMILIES)

DEFAULT_NORMATIVE_SOURCE_IDS = ("chcf", "chs-2024", "un-generic-job-profiles")
UN_VARIANT_SOURCE_ID = "un-values-behaviours"

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

STABLE_ID_RE = re.compile(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$")


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


def deep_fields_ready_for(
    family_id: str,
    signature_questions: list[dict],
    duty_groups: list[dict],
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
    return {
        "duty_bank_naming": naming_ok,
        "duty_bank_phrasing": False,
        "signature_fact_questions": facts_ok,
        "reference_jds": False,
    }


def build_family(
    family_id: str,
    norm_rows: list[dict],
    measured: dict,
    built_from: dict,
    built_at: str,
    signature_facts: list[dict],
    duty_groups: list[dict],
) -> dict:
    un_variant = normative_catalog(norm_rows, (UN_VARIANT_SOURCE_ID,))
    questions = signature_questions_for_family(signature_facts, family_id)
    groups = duty_groups_for_family(duty_groups, family_id)
    ready = deep_fields_ready_for(family_id, questions, groups)
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
            "naming_note": (
                f"AidJobs names for groups with advert_count >= {DUTY_NAME_ADVERT_FLOOR}; "
                "thinner groups keep heuristic names only (named false). Best-quarter phrasing deferred."
            ),
        },
        "signature_fact_questions": questions if ready["signature_fact_questions"] else [],
        "reference_jds": [],
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
) -> dict:
    return {
        "normative_sources_sha256": sha256_file(NORMATIVE),
        "wave_1a_broad_measured_sha256": sha256_file(MEASURED),
        "signature_facts_sha256": sha256_file(SIGNATURE_FACTS),
        "duty_group_names_sha256": sha256_file(DUTY_GROUP_NAMES),
        "wave_1a_families": WAVE_1A_FAMILIES,
        "normative_row_count": len(norm_rows),
        "signature_fact_row_count": len(signature_facts),
        "duty_group_row_count": len(duty_groups),
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
) -> dict[str, dict]:
    built_from = input_built_from(norm_rows, measured, signature_facts, duty_groups)
    built_at = deterministic_built_at(built_from)
    families = measured.get("families") or {}
    missing = [f for f in WAVE_1A_FAMILIES if f not in families]
    if missing:
        raise ValueError(f"wave-1a-broad-measured.json missing families: {', '.join(missing)}")
    extra = sorted(set(families) - set(WAVE_1A_FAMILIES))
    if extra:
        raise ValueError(f"wave-1a families list does not match measured keys: extra {extra!r}")
    for fid in WAVE_1A_FAMILIES:
        n_facts = sum(1 for r in signature_facts if r["family_id"] == fid)
        if n_facts < MIN_SIGNATURE_FACTS:
            raise ValueError(
                f"{fid}: need at least {MIN_SIGNATURE_FACTS} signature facts, found {n_facts}"
            )
        named = [g for g in duty_groups if g["family_id"] == fid and g["named"]]
        if not named:
            raise ValueError(f"{fid}: duty-group-names.csv has no named groups")
    return {
        fid: build_family(
            fid, norm_rows, measured, built_from, built_at, signature_facts, duty_groups
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
            "wave_1a_families": WAVE_1A_FAMILIES,
        },
    }


def schema_document() -> dict:
    """Minimal JSON Schema (Draft 2020-12 subset) for wave-1a library files."""
    ready_props = {k: {"type": "boolean"} for k in DEEP_FIELDS_READY_KEYS}
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "https://aidjobs.app/role-survey/library/schema.json",
        "title": "AidJobs role library (wave 1a)",
        "description": (
            "Schema for docs/architecture/role-survey/library/{family}.json and index.json. "
            f"schema_version {SCHEMA_VERSION}."
        ),
        "schema_version": SCHEMA_VERSION,
        "type": "object",
        "required": ["schema_version", "wave"],
        "properties": {
            "schema_version": {"type": "string", "const": SCHEMA_VERSION},
            "wave": {"type": "string", "const": WAVE},
            "built_at": {"type": "string"},
            "family_id": {"type": "string"},
            "name_en": {"type": "string"},
            "families": {"type": "array"},
            "inputs": {"type": "object"},
            "deep_fields_ready": {
                "type": "object",
                "required": list(DEEP_FIELDS_READY_KEYS),
                "properties": ready_props,
                "additionalProperties": False,
            },
            "signature_fact_questions": {"type": "array"},
            "duty_bank": {"type": "object"},
            "reference_jds": {"type": "array"},
            "measured_broad": {"type": "object"},
            "normative_sources": {"type": "object"},
            "built_from": {"type": "object"},
            "recognition": {"type": "object"},
            "requirements_by_level": {"type": "object"},
            "standards_application": {"type": "object"},
            "deep_option_a_scores": {"type": "object"},
        },
        "additionalProperties": True,
    }


def write_schema(dest: Path = SCHEMA_PATH) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(canonical_json(schema_document()), encoding="utf-8")


def write_library(family_docs: dict[str, dict], index: dict, dest: Path = LIBRARY) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    write_schema(dest / "schema.json")
    (dest / "index.json").write_text(canonical_json(index), encoding="utf-8")
    for fid, doc in family_docs.items():
        (dest / f"{fid}.json").write_text(canonical_json(doc), encoding="utf-8")


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
    if phrasing:
        problems.append(f"{family_id}: duty_bank.phrasing must stay empty until phrasing stage")
    if ready.get("duty_bank_phrasing"):
        problems.append(f"{family_id}: duty_bank_phrasing must stay false in this stage")
    if ready.get("reference_jds"):
        problems.append(f"{family_id}: reference_jds ready must stay false in this stage")
    questions = doc.get("signature_fact_questions") or []
    if questions and not ready.get("signature_fact_questions"):
        problems.append(f"{family_id}: signature_fact_questions present but not marked ready")
    if ready.get("signature_fact_questions") and len(questions) < MIN_SIGNATURE_FACTS:
        problems.append(
            f"{family_id}: signature_fact_questions ready needs >= {MIN_SIGNATURE_FACTS} questions"
        )
    if doc.get("reference_jds") and not ready.get("reference_jds"):
        problems.append(f"{family_id}: reference_jds present but not marked ready")
    groups = duty_bank.get("groups") or []
    named = [g for g in groups if g.get("named")]
    if ready.get("duty_bank_naming"):
        if not named:
            problems.append(f"{family_id}: duty_bank_naming ready without named groups")
        for g in named:
            if not g.get("stable_id") or not g.get("name_en") or not g.get("name_fr"):
                problems.append(f"{family_id}: named group missing id or names")
            if g.get("phrasing") is not None:
                problems.append(f"{family_id}: named group must keep phrasing null")
            if int(g.get("advert_count") or 0) < DUTY_NAME_ADVERT_FLOOR:
                problems.append(
                    f"{family_id}: named group advert_count below {DUTY_NAME_ADVERT_FLOOR}"
                )
    return problems


def check_problems(dest: Path | None = None) -> list[str]:
    dest = LIBRARY if dest is None else dest
    problems = []
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
        built = build_family_files(norm_rows, measured, signature_facts, duty_groups)
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
    for fid in WAVE_1A_FAMILIES:
        path = dest / f"{fid}.json"
        if not path.is_file():
            problems.append(f"{fid}.json missing")
            continue
        if committed[fid] != built[fid]:
            problems.append(f"{fid}.json out of date; run library.py build")
        problems += validate_normative_citations(committed[fid], fid)
        problems += validate_deep_fields_ready(committed[fid], fid)
    return problems


def build(_args=None, dest: Path | None = None) -> int:
    dest = LIBRARY if dest is None else dest
    norm_rows = read_normative_rows()
    measured = load_measured()
    signature_facts = read_signature_facts()
    duty_groups = read_duty_group_names()
    family_docs = build_family_files(norm_rows, measured, signature_facts, duty_groups)
    index = build_index(family_docs, measured)
    write_library(family_docs, index, dest)
    try:
        where = dest.relative_to(ROLES.parent)
    except ValueError:
        where = dest
    print(f"build: wrote schema.json, index.json and {len(family_docs)} family files under {where}")
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
