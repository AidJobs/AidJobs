"""Tests for Stage 3b wave-1a library (phrasing_lines + reference JDs, schema 0.3.0)."""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import library


def test_wave_1a_families_match_deep():
    assert library.WAVE_1A_FAMILIES == list(library.deep.FAMILIES)


def test_build_writes_schema_index_and_ready_flags(tmp_path, monkeypatch):
    monkeypatch.setattr(library, "LIBRARY", tmp_path / "library")
    monkeypatch.setattr(library, "REFERENCE_DIR", tmp_path / "library" / "reference")
    assert library.build() == 0
    assert (library.LIBRARY / "schema.json").is_file()
    assert (library.LIBRARY / "index.json").is_file()
    schema = json.loads((library.LIBRARY / "schema.json").read_text(encoding="utf-8"))
    assert schema["schema_version"] == "0.3.0"
    assert "family" in schema["$defs"]
    assert "index" in schema["$defs"]
    for fid in library.WAVE_1A_FAMILIES:
        doc = json.loads((library.LIBRARY / f"{fid}.json").read_text(encoding="utf-8"))
        assert doc["schema_version"] == "0.3.0"
        assert doc["normative_sources"]["default_source_ids"] == list(
            library.DEFAULT_NORMATIVE_SOURCE_IDS
        )
        assert library.UN_VARIANT_SOURCE_ID not in doc["normative_sources"]["default_source_ids"]
        assert doc["deep_option_a_scores"]["seal_prefix"] == library.DEEP_SEAL_PREFIX[fid]
        ready = doc["deep_fields_ready"]
        assert ready["signature_fact_questions"] is True
        assert ready["duty_bank_naming"] is True
        assert "duty_bank_phrasing" in ready
        assert "reference_jds" in ready
        assert len(doc["signature_fact_questions"]) >= library.MIN_SIGNATURE_FACTS
        named = [g for g in doc["duty_bank"]["groups"] if g["named"]]
        assert named
        assert all(g["phrasing"] is None for g in doc["duty_bank"]["groups"])
        assert doc["duty_bank"]["phrasing"] is None
        assert isinstance(doc["duty_bank"]["phrasing_lines"], list)
        if ready["duty_bank_phrasing"]:
            assert len(doc["duty_bank"]["phrasing_lines"]) == len(named)
        else:
            assert doc["duty_bank"]["phrasing_lines"] == []
        if ready["reference_jds"]:
            assert len(doc["reference_jds"]) == len(library.REFERENCE_FORMATS) * len(
                library.REFERENCE_LANGUAGES
            )
        else:
            assert doc["reference_jds"] == []
        assert library.validate_schema_subset(doc, library.family_schema(), fid) == []


def test_check_passes_on_built_output(tmp_path, monkeypatch):
    monkeypatch.setattr(library, "LIBRARY", tmp_path / "library")
    monkeypatch.setattr(library, "REFERENCE_DIR", tmp_path / "library" / "reference")
    assert library.build() == 0
    assert library.check() == 0


def test_validate_refuses_un_values_in_default_sources(tmp_path, monkeypatch):
    monkeypatch.setattr(library, "LIBRARY", tmp_path / "library")
    monkeypatch.setattr(library, "REFERENCE_DIR", tmp_path / "library" / "reference")
    assert library.build() == 0
    path = library.LIBRARY / "meal.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["normative_sources"]["default_source_ids"].append(library.UN_VARIANT_SOURCE_ID)
    problems = library.validate_normative_citations(doc, "meal")
    assert any("un-values-behaviours" in p for p in problems)


def test_validate_refuses_non_null_group_phrasing(tmp_path, monkeypatch):
    monkeypatch.setattr(library, "LIBRARY", tmp_path / "library")
    monkeypatch.setattr(library, "REFERENCE_DIR", tmp_path / "library" / "reference")
    assert library.build() == 0
    path = library.LIBRARY / "programme_management.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["duty_bank"]["phrasing"] = [{"text": "should not appear"}]
    problems = library.validate_deep_fields_ready(doc, "programme_management")
    assert any("phrasing must stay null" in p for p in problems)
    doc["duty_bank"]["phrasing"] = None
    doc["duty_bank"]["groups"][0]["phrasing"] = "not null"
    problems = library.validate_deep_fields_ready(doc, "programme_management")
    assert any("phrasing null" in p for p in problems)


def test_validate_refuses_ready_when_seal_not_ok(tmp_path, monkeypatch):
    monkeypatch.setattr(library, "LIBRARY", tmp_path / "library")
    monkeypatch.setattr(library, "REFERENCE_DIR", tmp_path / "library" / "reference")
    assert library.build() == 0
    doc = json.loads((library.LIBRARY / "finance.json").read_text(encoding="utf-8"))
    monkeypatch.setattr(library, "deep_scores_ok_for_ready", lambda _f: False)
    doc["deep_fields_ready"] = {
        "duty_bank_naming": False,
        "duty_bank_phrasing": False,
        "signature_fact_questions": True,
        "reference_jds": False,
    }
    problems = library.validate_deep_fields_ready(doc, "finance")
    assert any("seal" in p for p in problems)


def test_ci_safe_seal_ok_without_archive(monkeypatch):
    monkeypatch.setattr(library, "archive_available", lambda: False)
    for fid in library.WAVE_1A_FAMILIES:
        assert library.deep_scores_ok_for_ready(fid) is True
    assert library.live_seal_problems() == []


def test_raw_seal_accepts_crlf_and_rejects_tamper(tmp_path, monkeypatch):
    root = tmp_path / "stage2" / "finance"
    root.mkdir(parents=True)
    body = b'{"made_at":"x","family_id":"finance","adverts":[]}\r\n'
    (root / "reconciled.json").write_bytes(body)
    digest = hashlib.sha256(body).hexdigest()
    (root / "reconciled.sha256").write_text(digest + "\n", encoding="utf-8", newline="\n")
    monkeypatch.setattr(library.adverts, "WORK", tmp_path)
    monkeypatch.setitem(library.DEEP_SEAL_PREFIX, "finance", digest[:12])
    assert library.deep_reconciled_seal_prefix("finance") == digest[:12]
    assert library.deep_scores_ok_for_ready("finance") is True
    assert library.sha256_file(root / "reconciled.json") != digest
    (root / "reconciled.json").write_bytes(body + b" ")
    assert library.deep_reconciled_seal_prefix("finance") is None
    assert library.deep_scores_ok_for_ready("finance") is False


def test_schema_subset_rejects_extra_group_field_and_non_null_phrasing():
    bad_group = {
        "group_id": 1,
        "heuristic_name": "x",
        "stable_id": "pm-x",
        "name_en": "X",
        "name_fr": "X",
        "named": True,
        "line_count": 1,
        "advert_count": 5,
        "organisation_count": 2,
        "label": "Fact",
        "phrasing": "no",
        "extra": True,
    }
    problems = library.validate_schema_subset(bad_group, library._group_schema(), "g")
    assert any("phrasing" in p or "const" in p or "type must be null" in p for p in problems)
    assert any("extra" in p for p in problems)


def test_named_groups_complete_and_meet_floor():
    groups = library.read_duty_group_names()
    measured = library.load_measured()
    for fid in library.WAVE_1A_FAMILIES:
        family = [g for g in groups if g["family_id"] == fid]
        reported = measured["duty_grouping"][fid]["n_groups_reported"]
        assert len(family) == reported
        for g in family:
            assert g["named"] is (g["advert_count"] >= library.DUTY_NAME_ADVERT_FLOOR)


def test_signature_facts_cover_four_families():
    facts = library.read_signature_facts()
    for fid in library.WAVE_1A_FAMILIES:
        rows = [r for r in facts if r["family_id"] == fid]
        assert len(rows) >= library.MIN_SIGNATURE_FACTS
        assert all(r["question_en"] and r["question_fr"] for r in rows)


def test_normative_sources_csv_required(tmp_path):
    with pytest.raises(FileNotFoundError):
        library.read_normative_rows(tmp_path / "missing.csv")


def test_deterministic_built_at_stable():
    bf = {
        "normative_sources_sha256": "a" * 64,
        "wave_1a_broad_measured_sha256": "b" * 64,
        "signature_facts_sha256": "c" * 64,
        "duty_group_names_sha256": "d" * 64,
        "duty_phrasing_sha256": "",
        "reference_jds_sha256": "",
    }
    assert library.deterministic_built_at(bf) == library.deterministic_built_at(bf)
    assert library.deterministic_built_at(bf).startswith("wave1a-0.3.0-")


def test_noise_name_detection():
    assert library.is_noise_group_name("CPS requirements (employer noise)")
    assert library.is_noise_group_name("Main responsibilities heading (catch-all)")
    assert not library.is_noise_group_name("Project implementation")
