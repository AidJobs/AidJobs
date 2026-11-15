"""Tests for Stage 3 wave-1a library stubs."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import library


def test_wave_1a_families_match_deep():
    assert library.WAVE_1A_FAMILIES == list(library.deep.FAMILIES)


def test_build_writes_four_families_and_index(tmp_path, monkeypatch):
    monkeypatch.setattr(library, "LIBRARY", tmp_path / "library")
    assert library.build() == 0
    for fid in library.WAVE_1A_FAMILIES:
        assert (library.LIBRARY / f"{fid}.json").is_file()
    assert (library.LIBRARY / "index.json").is_file()
    doc = json.loads((library.LIBRARY / "programme_management.json").read_text(encoding="utf-8"))
    assert doc["schema_version"] == "0.1.0"
    assert doc["normative_sources"]["default_source_ids"] == list(library.DEFAULT_NORMATIVE_SOURCE_IDS)
    assert library.UN_VARIANT_SOURCE_ID not in doc["normative_sources"]["default_source_ids"]
    assert doc["deep_option_a_scores"]["seal_prefix"] == library.DEEP_SEAL_PREFIX["programme_management"]
    assert doc["deep_fields_ready"] == dict.fromkeys(library.DEEP_FIELDS_READY_KEYS, False)
    assert doc["duty_bank"]["phrasing"] is None


def test_check_passes_on_built_output(tmp_path, monkeypatch):
    monkeypatch.setattr(library, "LIBRARY", tmp_path / "library")
    assert library.build() == 0
    assert library.check() == 0


def test_check_refuses_deep_fields_ready_without_sealed_archive(tmp_path, monkeypatch):
    monkeypatch.setattr(library, "LIBRARY", tmp_path / "library")
    assert library.build() == 0
    path = library.LIBRARY / "finance.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["deep_fields_ready"]["signature_fact_questions"] = True
    doc["signature_fact_questions"] = [{"fact": "budget", "label": "Estimate"}]
    path.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
    assert library.check() == 1


def test_check_refuses_un_values_in_default_sources(tmp_path, monkeypatch):
    monkeypatch.setattr(library, "LIBRARY", tmp_path / "library")
    assert library.build() == 0
    path = library.LIBRARY / "meal.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["normative_sources"]["default_source_ids"].append(library.UN_VARIANT_SOURCE_ID)
    path.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
    assert library.check() == 1


def test_deep_ready_allowed_only_with_verified_seal(monkeypatch):
    doc = {"deep_fields_ready": {"duty_bank_phrasing": True, "signature_fact_questions": False, "reference_jds": False},
           "duty_bank": {}, "signature_fact_questions": [], "reference_jds": []}
    fid = "communications_advocacy"
    monkeypatch.setattr(library, "deep_scores_sealed_in_archive", lambda _f: False)
    monkeypatch.setattr(library, "deep_reconciled_seal_prefix", lambda _f: None)
    assert len(library.validate_deep_fields_ready(doc, fid)) > 0
    monkeypatch.setattr(library, "deep_scores_sealed_in_archive", lambda _f: True)
    monkeypatch.setattr(
        library,
        "deep_reconciled_seal_prefix",
        lambda f: library.DEEP_SEAL_PREFIX[f],
    )
    assert library.validate_deep_fields_ready(doc, fid) == []


def test_normative_sources_csv_required(tmp_path):
    with pytest.raises(FileNotFoundError):
        library.read_normative_rows(tmp_path / "missing.csv")