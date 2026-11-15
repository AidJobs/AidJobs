"""Tests for Stage 2 deep-layer draw tooling (Option A)."""
from __future__ import annotations

import csv
import json
import sys
from collections import Counter
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import adverts
import deep
import roles


def _row(n: int, family: str, org: str, lang: str, level: str, org_type: str, source: str) -> dict:
    return {
        "advert_id": f"{n:016x}",
        "org_id": org,
        "family_id": family,
        "held_out": "false",
        "language": lang,
        "level": level,
        "org_type": org_type,
        "source": source,
        "system": "own site",
    }


def _pool(family: str, n: int = 40) -> list[dict]:
    rows = []
    for i in range(n):
        rows.append(_row(i, family, f"org-{i % 8}", "fr" if i % 5 == 0 else "en",
                        "unknown" if i % 7 == 0 else "officer",
                        "NGO" if i % 2 else "UN",
                        "archive" if i % 3 else "board"))
    return rows


def test_codes_batches_of_five():
    chosen = _pool("programme_management", 20)
    codes = deep.codes_for(chosen, "PM", 1)
    assert list(codes) == [f"PM{i:02d}" for i in range(1, 21)]
    assert codes["PM01"]["batch"] == "batch-1"
    assert codes["PM05"]["batch"] == "batch-1"
    assert codes["PM06"]["batch"] == "batch-2"
    assert codes["PM20"]["batch"] == "batch-4"


def test_draw_respects_org_cap_and_unknown_cap():
    pool = _pool("meal", 60)
    chosen = deep.draw_sample(pool, seed=99, french_min=4)
    assert deep.draw_problems(chosen, pool, set(), 4) == []
    assert len(chosen) == 20
    assert max(Counter(r["org_id"] for r in chosen).values()) <= 3
    assert sum(1 for r in chosen if r["level"] == "unknown") <= 3


def test_draw_is_fixed_by_seed():
    pool = _pool("finance", 50)
    a = deep.draw_sample(pool, seed=20261123, french_min=3)
    b = deep.draw_sample(pool, seed=20261123, french_min=3)
    assert [r["advert_id"] for r in a] == [r["advert_id"] for r in b]
    c = deep.draw_sample(pool, seed=1, french_min=3)
    assert [r["advert_id"] for r in a] != [r["advert_id"] for r in c]


def test_effective_french_min_when_pool_is_small():
    pool = [_row(i, "finance", "o", "en", "officer", "NGO", "archive") for i in range(10)]
    pool += [_row(i + 10, "finance", "o", "fr", "officer", "NGO", "archive") for i in range(2)]
    assert deep.effective_french_min(pool, 4, 20) == 2


@pytest.fixture
def work(tmp_path, monkeypatch):
    roles_dir = tmp_path / "roles"
    roles_dir.mkdir()
    work = tmp_path / "work"
    work.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(roles, "ROLES", roles_dir)
    monkeypatch.setattr(adverts, "WORK", work)
    monkeypatch.setattr(deep, "STAGE2", work / "stage2")
    monkeypatch.setattr(deep, "AI_TEST", work / "ai-test-set.json")
    (work / "ai-test-set.json").write_text(json.dumps({"test": ["0000000000000001"]}), encoding="utf-8")
    return roles_dir


def test_draw_refuses_existing_draw(work):
    family = "programme_management"
    pool = _pool(family, 30)
    with (work / "broad-adverts.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(pool[0]))
        w.writeheader()
        w.writerows(pool)
    assert deep.draw_one(family, pool, {"0000000000000001"}) == 0
    assert deep.draw_one(family, pool, {"0000000000000001"}) == 1


def test_check_requires_draw_files(work):
    rows = [_row(0, "programme_management", "o", "en", "officer", "NGO", "archive")]
    probs = deep.check_draw("programme_management", rows, set())
    assert any("draw.json is missing" in p for p in probs)


def _answer_row(vid: str, **scores: int | None) -> dict:
    base = {
        "id": vid,
        "decision_facts": 2,
        "specificity": 2,
        "realistic_must_haves": 2,
        "clear_outcomes": 2,
        "field_realism": None,
        "fairness": 2,
        "readability": 2,
        "right_length": 2,
        "findability": 2,
    }
    base.update(scores)
    return base


def _write_draw(family: str, ids: list[str]) -> None:
    root = deep.family_dir(family)
    root.mkdir(parents=True, exist_ok=True)
    codes = {
        vid: {"advert_id": f"adv-{vid}", "batch": f"batch-{(i - 1) // 5 + 1}"}
        for i, vid in enumerate(ids, 1)
    }
    (root / "draw.json").write_text(
        json.dumps({"family_id": family, "codes": codes}, indent=1),
        encoding="utf-8",
    )


def _write_answers(family: str, name: str, rows: list[dict]) -> None:
    ans = deep.answers_dir(family)
    ans.mkdir(parents=True, exist_ok=True)
    (ans / f"{name}.jsonl").write_text(
        "\n".join(json.dumps(r) for r in rows) + "\n",
        encoding="utf-8",
    )


class _FamArgs:
    def __init__(self, family: str, file: str | None = None):
        self.family = family
        self.file = file


def test_answers_form_check_against_draw_codes(work):
    family = "programme_management"
    ids = [f"PM{i:02d}" for i in range(1, 3)]
    _write_draw(family, ids)
    _write_answers(family, "a", [_answer_row(i) for i in ids])
    assert deep.answers(_FamArgs(family, "a.jsonl")) == 0
    bad = _answer_row(ids[0], decision_facts=9)
    (deep.answers_dir(family) / "bad.jsonl").write_text(json.dumps(bad) + "\n", encoding="utf-8")
    assert deep.answers(_FamArgs(family, "bad.jsonl")) == 1


def test_agreement_writes_json_and_kappa(work):
    family = "meal"
    ids = [f"ML{i:02d}" for i in range(1, 4)]
    _write_draw(family, ids)
    rows = [_answer_row(i) for i in ids]
    _write_answers(family, "a", rows)
    _write_answers(family, "b", rows)
    assert deep.agreement(_FamArgs(family)) == 0
    data = json.loads((deep.family_dir(family) / "agreement.json").read_text(encoding="utf-8"))
    assert data["targets"] == deep.TARGETS
    assert data["adverts"] == len(ids)
    dim = data["dimensions"]["decision_facts"]
    assert dim["exact"] == 1.0
    assert dim["kappa"] == 1.0


def test_reconcile_seals_once(work):
    family = "finance"
    vid = "FN01"
    _write_draw(family, [vid])
    a = _answer_row(vid, decision_facts=1)
    b = _answer_row(vid, decision_facts=2)
    _write_answers(family, "a", [a])
    _write_answers(family, "b", [b])
    assert deep.disagreements(_FamArgs(family)) == 0
    assert deep.reconcile(_FamArgs(family)) == 1
    path = deep.family_dir(family) / "disagreements.csv"
    rows = list(csv.DictReader(path.open(encoding="utf-8")))
    rows[0]["decision"] = "2"
    rows[0]["reason"] = "coder b"
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=rows[0].keys())
        w.writeheader()
        w.writerows(rows)
    assert deep.reconcile(_FamArgs(family)) == 0
    seal = deep.family_dir(family) / "reconciled.sha256"
    assert seal.exists()
    assert deep.reconcile(_FamArgs(family)) == 0
