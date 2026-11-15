"""Tests for Phase 0 scoring-guide pilot tools."""
from __future__ import annotations

import phase0


def test_codes_of_groups_of_five():
    pilot = [f"{i:016x}" for i in range(20)]
    codes = phase0.codes_of(pilot)
    assert list(codes) == [f"P{i:02d}" for i in range(1, 21)]
    assert codes["P01"]["batch"] == "batch-1"
    assert codes["P05"]["batch"] == "batch-1"
    assert codes["P06"]["batch"] == "batch-2"
    assert codes["P20"]["batch"] == "batch-4"
    assert codes["P03"]["advert_id"] == pilot[2]


def test_score_ok_field_realism_null():
    assert phase0.score_ok("field_realism", None)
    assert phase0.score_ok("field_realism", 2)
    assert not phase0.score_ok("field_realism", 4)
    assert not phase0.score_ok("decision_facts", None)
    assert phase0.score_ok("decision_facts", 0)


def test_answer_problems_catches_bad_score():
    expected = {"P01"}
    good = {
        "id": "P01",
        "decision_facts": 2, "specificity": 1, "realistic_must_haves": 2,
        "clear_outcomes": 1, "field_realism": None, "fairness": 2,
        "readability": 2, "right_length": 1, "findability": 2,
    }
    assert phase0.answer_problems(good, expected) == []
    bad = dict(good, decision_facts=5)
    assert any("decision_facts" in p for p in phase0.answer_problems(bad, expected))


def test_quadratic_weighted_kappa_perfect_and_chance():
    assert phase0.quadratic_weighted_kappa([0, 1, 2, 3], [0, 1, 2, 3]) == 1.0
    # Completely opposed on a two-point set still defined.
    k = phase0.quadratic_weighted_kappa([0, 0, 3, 3], [3, 3, 0, 0])
    assert k is not None and k < 0


def test_check_passes_on_committed_guide(monkeypatch, tmp_path):
    guide = tmp_path / "scoring-guide.md"
    guide.write_text(
        "# Scoring guide\nVersion 1\n"
        + "\n".join(f"`{k}` {k}" for k in phase0.SCORE_KEYS)
        + "\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(phase0, "GUIDE_COMMITTED", guide)
    monkeypatch.setattr(phase0, "AI_TEST", tmp_path / "missing.json")
    assert phase0.check() == 0
