"""Tests for Stage 3 wave-1a library fill (signature facts + duty naming)."""
from __future__ import annotations

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
    assert library.build() == 0
    assert (library.LIBRARY / "schema.json").is_file()
    assert (library.LIBRARY / "index.json").is_file()
    schema = json.loads((library.LIBRARY / "schema.json").read_text(encoding="utf-8"))
    assert schema["schema_version"] == "0.2.0"
    for fid in library.WAVE_1A_FAMILIES:
        doc = json.loads((library.LIBRARY / f"{fid}.json").read_text(encoding="utf-8"))
        assert doc["schema_version"] == "0.2.0"
        assert doc["normative_sources"]["default_source_ids"] == list(
            library.DEFAULT_NORMATIVE_SOURCE_IDS
        )
        assert library.UN_VARIANT_SOURCE_ID not in doc["normative_sources"]["default_source_ids"]
        assert doc["deep_option_a_scores"]["seal_prefix"] == library.DEEP_SEAL_PREFIX[fid]
        ready = doc["deep_fields_ready"]
        assert ready["signature_fact_questions"] is True
        assert ready["duty_bank_naming"] is True
        assert ready["duty_bank_phrasing"] is False
        assert ready["reference_jds"] is False
        assert len(doc["signature_fact_questions"]) >= library.MIN_SIGNATURE_FACTS
        named = [g for g in doc["duty_bank"]["groups"] if g["named"]]
        assert named
        assert all(g["phrasing"] is None for g in doc["duty_bank"]["groups"])
        assert doc["duty_bank"]["phrasing"] is None


def test_check_passes_on_built_output(tmp_path, monkeypatch):
    monkeypatch.setattr(library, "LIBRARY", tmp_path / "library")
    assert library.build() == 0
    assert library.check() == 0


def test_check_refuses_ready_when_seal_not_ok(tmp_path, monkeypatch):
    monkeypatch.setattr(library, "LIBRARY", tmp_path / "library")
    assert library.build() == 0
    monkeypatch.setattr(library, "deep_scores_ok_for_ready", lambda _f: False)
    path = library.LIBRARY / "finance.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    # Force a ready claim while seal helper returns false
    doc["deep_fields_ready"]["signature_fact_questions"] = True
    path.write_text(json.dumps(doc, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    assert library.validate_deep_fields_ready(doc, "finance")
    problems = library.validate_deep_fields_ready(doc, "finance")
    assert any("seal" in p for p in problems)


def test_check_refuses_un_values_in_default_sources(tmp_path, monkeypatch):
    monkeypatch.setattr(library, "LIBRARY", tmp_path / "library")
    assert library.build() == 0
    path = library.LIBRARY / "meal.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["normative_sources"]["default_source_ids"].append(library.UN_VARIANT_SOURCE_ID)
    path.write_text(json.dumps(doc, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    assert library.check() == 1


def test_check_refuses_phrasing_when_present(tmp_path, monkeypatch):
    monkeypatch.setattr(library, "LIBRARY", tmp_path / "library")
    assert library.build() == 0
    path = library.LIBRARY / "programme_management.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["duty_bank"]["phrasing"] = [{"text": "should not appear yet"}]
    path.write_text(json.dumps(doc, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    assert library.check() == 1


def test_ci_safe_seal_ok_without_archive(monkeypatch):
    monkeypatch.setattr(library, "archive_available", lambda: False)
    for fid in library.WAVE_1A_FAMILIES:
        assert library.deep_scores_ok_for_ready(fid) is True


def test_named_groups_meet_advert_floor():
    groups = library.read_duty_group_names()
    named = [g for g in groups if g["named"]]
    assert len(named) >= 90
    assert all(g["advert_count"] >= library.DUTY_NAME_ADVERT_FLOOR for g in named)
    assert all(g["stable_id"] and g["name_en"] and g["name_fr"] for g in named)


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
    }
    assert library.deterministic_built_at(bf) == library.deterministic_built_at(bf)
    assert library.deterministic_built_at(bf).startswith("wave1a-0.2.0-")
