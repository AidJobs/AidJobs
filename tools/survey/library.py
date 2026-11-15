"""Role-content survey (W-54), Stage 3: wave-1a role library stubs (role-survey.md 19.21; section 9).

Run on the user's machine; CI runs `build`, `check` and the tests:

  python tools/survey/library.py build
  python tools/survey/library.py check

Builds skeleton JSON under docs/architecture/role-survey/library/ from normative-sources.csv,
wave-1a-broad-measured.json, and the wave-1a family list (the four Option A families in deep.py).
Measured broad-layer figures are copied with Fact labels; deep full scores stay sealed in the
archive (reconciled.json is never committed). Deep written fields (duty bank phrasing, signature
facts, reference JDs) stay unready until seals are verified.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import adverts
import deep

HERE = Path(__file__).resolve().parent
ROLES = adverts.ROLES_DIR
LIBRARY = ROLES / "library"
NORMATIVE = ROLES / "normative-sources.csv"
MEASURED = ROLES / "wave-1a-broad-measured.json"

SCHEMA_VERSION = "0.1.0"
WAVE = "1a"

WAVE_1A_FAMILIES = list(deep.FAMILIES)

DEFAULT_NORMATIVE_SOURCE_IDS = ("chcf", "chs-2024", "un-generic-job-profiles")
UN_VARIANT_SOURCE_ID = "un-values-behaviours"

DEEP_FIELDS_READY_KEYS = ("duty_bank_phrasing", "signature_fact_questions", "reference_jds")

# First 12 hex chars of each family's sealed reconciled.json (archive only; role-survey.md 19.21).
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
ARCHIVE_DUTY_GROUPS = "survey-raw-archive/role-survey-reading/work/duty-groups/{family_id}.json"
ARCHIVE_DEEP_RECONCILED = (
    "survey-raw-archive/role-survey-reading/work/stage2/{family_id}/reconciled.json"
)


def utc_now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def sha256_file(path: Path) -> str:
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
    if sha256_file(reconciled) != expected:
        return None
    return expected[:12]


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
            "archive (survey-raw-archive/.../work/duty-groups/)."
        ),
        "archive_pointer": ARCHIVE_DUTY_GROUPS.format(family_id=family_id),
        "n_adverts": groups["n_adverts"],
        "n_duty_lines": groups["n_duty_lines"],
        "n_organisations": groups["n_organisations"],
        "n_groups_reported": groups["n_groups_reported"],
        "lines_in_reported_groups": groups["lines_in_reported_groups"],
        "pct_lines_covered": groups["pct_lines_covered"],
    }


def build_family(
    family_id: str,
    norm_rows: list[dict],
    measured: dict,
    built_from: dict,
    built_at: str,
) -> dict:
    un_variant = normative_catalog(norm_rows, (UN_VARIANT_SOURCE_ID,))
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
            "deep_fields_ready": False,
            "archive_measured_pointer": ARCHIVE_MEASURED,
            "grouping_counts": duty_grouping_counts(measured, family_id),
            "phrasing": None,
        },
        "signature_fact_questions": [],
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
                "Full nine-dimension sealed scores are not copied from reconciled.json into "
                "committed library JSON until deep coding is reconciled and verified."
            ),
        },
        "deep_fields_ready": {k: False for k in DEEP_FIELDS_READY_KEYS},
    }


def input_built_from(norm_rows: list[dict], measured: dict) -> dict:
    return {
        "normative_sources_sha256": sha256_file(NORMATIVE),
        "wave_1a_broad_measured_sha256": sha256_file(MEASURED),
        "wave_1a_families": WAVE_1A_FAMILIES,
        "normative_row_count": len(norm_rows),
        "measured_generated_at": measured.get("generated_at"),
    }


def build_family_files(norm_rows: list[dict], measured: dict) -> dict[str, dict]:
    built_from = input_built_from(norm_rows, measured)
    built_at = measured.get("generated_at") or utc_now()
    families = measured.get("families") or {}
    missing = [f for f in WAVE_1A_FAMILIES if f not in families]
    if missing:
        raise ValueError(f"wave-1a-broad-measured.json missing families: {', '.join(missing)}")
    extra = sorted(set(families) - set(WAVE_1A_FAMILIES))
    if extra:
        raise ValueError(f"wave-1a families list does not match measured keys: extra {extra!r}")
    return {
        fid: build_family(fid, norm_rows, measured, built_from, built_at) for fid in WAVE_1A_FAMILIES
    }


def build_index(family_docs: dict[str, dict], measured: dict) -> dict:
    built_at = measured.get("generated_at") or utc_now()
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
            "wave_1a_families": WAVE_1A_FAMILIES,
        },
    }


def write_library(family_docs: dict[str, dict], index: dict, dest: Path = LIBRARY) -> None:
    dest.mkdir(parents=True, exist_ok=True)
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
    duty_bank = doc.get("duty_bank") or {}
    if duty_bank.get("deep_fields_ready") and not ready.get("duty_bank_phrasing"):
        problems.append(f"{family_id}: duty_bank.deep_fields_ready disagrees with deep_fields_ready")
    any_ready = any(ready.get(k) for k in DEEP_FIELDS_READY_KEYS)
    if any_ready and not deep_scores_sealed_in_archive(family_id):
        problems.append(
            f"{family_id}: deep_fields_ready claims true but archive reconciled.json is not "
            f"sealed at prefix {DEEP_SEAL_PREFIX[family_id]}"
        )
    if any_ready:
        prefix = deep_reconciled_seal_prefix(family_id)
        if prefix is None:
            problems.append(f"{family_id}: deep_fields_ready true without sealed reconciled.json")
    phrasing = duty_bank.get("phrasing")
    if phrasing:
        problems.append(f"{family_id}: duty_bank.phrasing must stay empty until deep is sealed")
    if doc.get("signature_fact_questions") and not ready.get("signature_fact_questions"):
        problems.append(f"{family_id}: signature_fact_questions present but not marked ready")
    if doc.get("reference_jds") and not ready.get("reference_jds"):
        problems.append(f"{family_id}: reference_jds present but not marked ready")
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
        built = build_family_files(norm_rows, measured)
        fresh_index = build_index(built, measured)
    except (FileNotFoundError, KeyError, ValueError) as exc:
        return [str(exc)]
    if not dest.is_dir():
        problems.append(f"library output folder missing: {dest}")
        return problems
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
        fresh = built[fid]
        if committed[fid] != fresh:
            problems.append(f"{fid}.json out of date; run library.py build")
        problems += validate_normative_citations(committed[fid], fid)
        problems += validate_deep_fields_ready(committed[fid], fid)
    return problems


def build(_args=None, dest: Path | None = None) -> int:
    dest = LIBRARY if dest is None else dest
    norm_rows = read_normative_rows()
    measured = load_measured()
    family_docs = build_family_files(norm_rows, measured)
    index = build_index(family_docs, measured)
    write_library(family_docs, index, dest)
    try:
        where = dest.relative_to(ROLES.parent)
    except ValueError:
        where = dest
    print(f"build: wrote index.json and {len(family_docs)} family files under {where}")
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