"""Tests of the broad layer's validation sample (W-54, role-survey.md 19.16; no network). Every row,
advert and answer here was written for the tests by AidJobs; none is copied from a real advert.
Run: python -m pytest tools/survey/test_validation.py -q"""
import csv
import json
import sys
from collections import Counter
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import adverts
import roles
import validation as v

SPEC = [  # source, system, adverts, organisations, French
    ("archive", "own site", 586, 40, False), ("archive", "own site", 155, 10, True),
    ("archive", "Greenhouse", 215, 20, False), ("board", "myjobmag", 70, 30, False),
    ("archive", "iCIMS", 54, 5, False), ("step-f-feed", "Teamtailor", 33, 3, False),
    ("archive", "Teamtailor", 16, 4, False), ("feed", "Greenhouse", 13, 3, False),
    ("board", "groundzero", 30, 1, False), ("archive", "Jobvite", 23, 2, False),
    ("step-f-feed", "Teamtailor", 9, 1, True),
]


def draw_rows(held: int = 30) -> list[dict]:
    rows, n = [], 0
    for source, system, count, orgs, french in SPEC:
        for i in range(count):
            n += 1
            rows.append({"advert_id": f"{n:016x}", "org_id": f"{system}-{french}-{i % orgs}", "source": source,
                         "system": system, "language": "fr" if french else "en", "held_out": "false"})
    for i in range(held):
        n += 1
        rows.append({"advert_id": f"{n:016x}", "org_id": "held-org", "source": "step-f-feed", "system": "Lever",
                     "language": "en", "held_out": "true"})
    return rows


def test_the_draw_keeps_every_rule_and_is_fixed_by_its_seed():
    rows = draw_rows()
    exclude = {rows[0]["advert_id"]}          # also in the AI test set's file, though not held out here
    chosen = v.draw_sample(rows, exclude)
    assert v.draw_problems(chosen, rows, exclude) == []
    assert len(chosen) == 100 and rows[0] not in chosen
    assert all(r["held_out"] == "false" for r in chosen)
    assert sum(r["language"] == "fr" for r in chosen) >= 20
    assert max(Counter(r["org_id"] for r in chosen).values()) <= 3
    systems = Counter(r["system"] for r in chosen)
    assert all(systems[s] >= 3 for s in ("own site", "Greenhouse", "myjobmag", "iCIMS", "Teamtailor"))
    assert [r["advert_id"] for r in v.draw_sample(rows, exclude)] == [r["advert_id"] for r in chosen]
    assert [r["advert_id"] for r in v.draw_sample(rows, exclude, seed=1)] != [r["advert_id"] for r in chosen]


def test_quotas_share_places_by_size_with_french_and_system_floors():
    rows = [r for r in draw_rows() if r["held_out"] == "false"]
    q = v.quotas(rows)
    assert sum(q.values()) == 100
    assert sum(n for c, n in q.items() if c[2]) == 20
    assert q[("archive", "own site", False)] > q[("archive", "Greenhouse", False)] > q[("archive", "iCIMS", False)]
    # A system of 50 or more split into small cells is raised to its floor of 3.
    small = rows + [{"advert_id": f"f{i:015x}", "org_id": f"x{i}", "source": "archive", "system": "Small",
                     "language": "en", "held_out": "false"} for i in range(50)]
    assert sum(n for c, n in v.quotas(small).items() if c[1] == "Small") >= 3


def test_allocate_never_gives_a_cell_more_than_it_holds():
    q = v.allocate({"a": 2, "b": 50, "c": 48}, 60)
    assert q["a"] <= 2 and sum(q.values()) == 60


def test_a_cell_held_back_by_the_organisation_cap_passes_its_places_on():
    rows = draw_rows() + [{"advert_id": f"5{i:015x}", "org_id": "solo-org", "source": "board", "system": "solo",
                           "language": "en", "held_out": "false"} for i in range(300)]
    assert v.quotas([r for r in rows if r["held_out"] == "false"])[("board", "solo", False)] > 3
    chosen = v.draw_sample(rows, set())
    assert len(chosen) == 100 and v.draw_problems(chosen, rows, set()) == []
    assert sum(1 for r in chosen if r["system"] == "solo") == 3      # one organisation, capped at 3


def test_a_big_system_left_short_by_the_organisation_cap_stops_the_draw():
    def row(i, system, org):
        return {"advert_id": f"{system[:2]}{i:014x}", "org_id": org, "source": "archive", "system": system,
                "language": "fr" if i % 4 == 0 else "en", "held_out": "false"}

    # The 50 adverts of "zz" belong to the same three organisations as the cell drawn before it.
    rows = [row(i, "own site", f"o{i % 3}") for i in range(300)] + [row(i, "zz", f"o{i % 3}") for i in range(50)]
    rows += [row(i, "other", f"p{i}") for i in range(200)]
    with pytest.raises(SystemExit, match="under 3"):
        v.draw_sample(rows, set(), n=40, french=10)


def test_quotas_stop_moving_places_when_no_cell_can_give_one():
    rows = [{"advert_id": f"{s}{i:015x}", "org_id": f"{s}{i}", "source": "archive", "system": s, "language": "en",
             "held_out": "false"} for s in "abc" for i in range(50)]
    q = v.quotas(rows, n=6, french=0)
    assert sum(q.values()) == 6


def test_a_draw_that_breaks_a_rule_is_reported():
    rows = draw_rows()
    chosen = v.draw_sample(rows, set())
    english = [r for r in rows if r["language"] == "en" and r not in chosen and r["held_out"] == "false"]
    bad = [r for r in chosen if r["language"] != "fr"] + english[:sum(r["language"] == "fr" for r in chosen)]
    assert any("French" in p for p in v.draw_problems(bad, rows, set()))
    held = chosen[:-1] + [next(r for r in rows if r["held_out"] == "true")]
    assert any("AI test set" in p for p in v.draw_problems(held, rows, set()))


def write_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        w = csv.DictWriter(handle, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)


@pytest.fixture
def work(tmp_path, monkeypatch):
    roles_dir, valid = tmp_path / "roles", tmp_path / "work" / "validation"
    roles_dir.mkdir()
    monkeypatch.setattr(roles, "ROLES", roles_dir)
    monkeypatch.setattr(adverts, "WORK", tmp_path / "work")
    monkeypatch.setattr(v, "VALID", valid)
    monkeypatch.setattr(v, "PACKETS", valid / "packets")
    monkeypatch.setattr(v, "ANSWERS", valid / "answers")
    monkeypatch.setattr(v, "OUTPUT", roles_dir / "broad-validation.csv")
    return tmp_path


def test_a_draw_once_made_is_frozen(work):
    write_csv(roles.ROLES / "broad-adverts.csv", draw_rows())
    assert v.draw() == 0
    first = (v.VALID / "draw.json").read_text(encoding="utf-8")
    assert v.draw() == 0
    assert (v.VALID / "draw.json").read_text(encoding="utf-8") == first
    codes = json.loads(first)["codes"]
    assert sorted(codes) == [f"V{i:03d}" for i in range(1, 101)]
    assert v.load_draw() == codes


def test_a_frozen_draw_is_refused_once_its_source_or_its_ids_change(work):
    rows = draw_rows()
    write_csv(roles.ROLES / "broad-adverts.csv", rows)
    v.draw()
    saved = json.loads((v.VALID / "draw.json").read_text(encoding="utf-8"))
    rows[-1]["system"] = "Changed"
    write_csv(roles.ROLES / "broad-adverts.csv", rows)
    with pytest.raises(SystemExit, match="changed since"):
        v.load_draw()
    assert v.draw() == 1
    write_csv(roles.ROLES / "broad-adverts.csv", draw_rows())
    held = next(r["advert_id"] for r in draw_rows() if r["held_out"] == "true")
    saved["codes"]["V001"]["advert_id"] = held
    (v.VALID / "draw.json").write_text(json.dumps(saved), encoding="utf-8")
    with pytest.raises(SystemExit, match="AI test set"):
        v.load_draw()


def test_neutral_ids_put_a_spread_pilot_first_then_four_batches():
    chosen = v.draw_sample(draw_rows(), set())
    codes = v.codes_for(chosen)
    pilot = [c for c in codes.values() if c["batch"] == "pilot"]
    assert len(pilot) == 10 and len({c["org_id"] for c in pilot}) == 10 and sum(c["french"] for c in pilot) >= 2
    assert [codes[f"V{i:03d}"]["batch"] for i in range(1, 11)] == ["pilot"] * 10
    sizes = Counter(c["batch"] for c in codes.values() if c["batch"] != "pilot")
    assert sorted(sizes) == ["batch-1", "batch-2", "batch-3", "batch-4"] and set(sizes.values()) <= {22, 23}
    assert not any(c["advert_id"] in vid for vid, c in codes.items())


def test_a_packet_holds_the_advert_text_and_nothing_the_script_measured():
    ad = {"title": "Field Logistics Officer", "method": "jsonld", "lines": [
        {"text": "Field Logistics Officer", "heading": True, "tag": "h1"},
        {"text": "What you will do", "heading": True, "tag": "h2"},
        {"text": "Keep the made-up warehouse in order.", "heading": False, "tag": "li"}]}
    text, n = v.packet_text("V007", ad, "closing date: 2026-12-01")
    assert n == 3
    assert "1 # Field Logistics Officer" in text and "2 ## What you will do" in text and "3 Keep" in text
    assert "Job-posting data on the page: closing date: 2026-12-01" in text
    assert "responsibilities" not in text and "facts_given" not in text


def test_posting_values_are_read_with_contacts_removed():
    desc = " ".join(["word"] * 120)
    html = ('<script type="application/ld+json">' + json.dumps({
        "@type": "JobPosting", "description": desc, "validThrough": "2026-12-01",
        "jobLocation": {"address": {"addressLocality": "Goma"}}, "employmentType": "FULL_TIME",
        "baseSalary": {"value": {"value": "jobs@acme.example"}}}) + "</script>")
    out = v.posting_values(html)
    assert "closing date: 2026-12-01" in out and "place: Goma" in out and "employment type: FULL_TIME" in out
    assert "@" not in out and "[email]" in out
    assert v.posting_values("<p>no data</p>") == ""


def answer(**kw) -> dict:
    a = {"id": "V001", "headings": [[2, "responsibilities"]], "given": ["contract_type"], "vague": ["pay"],
         "years_min": 3, "years_alt": None, "degree": "bachelor", "function": "supply_chain", "sector": "none",
         "level": "officer", "language": "en", "restrictions": []}
    a.update(kw)
    return a


def test_answers_in_the_guides_form_pass_and_others_are_named():
    assert v.answer_problems(answer(), 5) == []
    assert v.answer_problems(answer(note="a short note"), 5) == []
    assert v.answer_problems(answer(headings=[[1, "role_purpose"], [1, "responsibilities"]]), 1) == []
    assert v.answer_problems(answer(headings=[[1, "scope"], [1, "scope"]]), 1)
    cases = {
        "headings": answer(headings=[[9, "responsibilities"]]),
        "section type": answer(headings=[[2, "duties"]]),
        "both": answer(given=["pay"], vague=["pay"]),
        "unknown": answer(given=["salary"]),
        "pay_vague": answer(vague=["pay_vague"]),
        "years_alt": answer(years_min=None, years_alt=5),
        "smaller": answer(years_min=5, years_alt=4),
        "years_min": answer(years_min="three"),
        "degree": answer(degree="msc"),
        "function": answer(function="logistics"),
        "restrictions": answer(restrictions=["gender"]),
        "keys": {k: x for k, x in answer().items() if k != "level"},
        "boolean line": answer(headings=[[True, "scope"]]),
    }
    for name, a in cases.items():
        assert v.answer_problems(a, 5), name
    assert any("not an advert" in p for p in v.answer_problems(answer(), None))


def test_the_guide_must_define_every_category_the_script_uses():
    full = " ".join(f"`{i}`" for i in v.HEADING_TYPES + v.FACT_IDS + v.DEGREES + v.FUNCTIONS + v.SECTORS +
                    v.LEVELS + v.LANGUAGES + v.RESTRICTION_IDS + ["given", "vague", "absent"])
    assert v.guide_problems(full) == []
    assert v.guide_problems(full.replace("`hardship_rr`", "")) == ["the guide does not define `hardship_rr`"]


def test_the_categories_are_the_scripts_own():
    assert set(v.FACT_IDS) == set(adverts.FACTS)
    assert set(v.RESTRICTION_IDS) == set(adverts.RESTRICTIONS)
    assert {adverts.section_type(h) for h in ("Key responsibilities", "About us", "How to apply")} <= set(v.SECTION_TYPES)
    assert set(v.SECTION_TYPES) <= set(adverts.SECTION_IDS)
    assert set(roles.LEVEL_IDS) < set(v.LEVELS) and set(roles.FUNCTION_IDS) < set(v.FUNCTIONS)


def test_kappa():
    assert v.kappa([1, 1, 0, 0], [1, 0, 0, 0]) == pytest.approx(0.5)
    assert v.kappa([1, 1], [1, 1]) is None
    assert v.kappa([], []) is None


def test_agreement_on_years_counts_within_one_year_where_either_gives_a_figure():
    a = [v.items_of(answer(years_min=y)) for y in (3, 5, None, None)]
    b = [v.items_of(answer(years_min=y)) for y in (4, 7, None, 2)]
    share, _k = v.agreement_of("years_min", a, b)
    assert share == pytest.approx(1 / 3)
    share, k = v.agreement_of("fact:pay", a, b)
    assert share == 1 and k is None


def test_disagreements_need_a_decision_with_a_one_line_reason():
    a = {"V001": answer()}
    b = {"V001": answer(vague=[], given=["contract_type", "pay"], years_min=4)}
    rows = v.disagreement_rows(a, b, ["V001"])
    assert {(r["item"], r["coder_a"], r["coder_b"]) for r in rows} == {("fact:pay", "vague", "given"),
                                                                     ("years_min", "3", "4")}
    items, problems = v.reconciled_items(a, b, ["V001"], rows)
    assert len(problems) == 2
    for r in rows:
        r["decision"], r["reason"] = ("given", "a figure is stated") if r["item"] == "fact:pay" else ("4", "four asked")
    items, problems = v.reconciled_items(a, b, ["V001"], rows)
    assert problems == [] and items["V001"]["fact:pay"] == "given" and items["V001"]["years_min"] == 4
    assert items["V001"]["fact:contract_type"] == "given"
    # A decision already written is kept when the list is made again; a changed answer drops it.
    again = v.disagreement_rows(a, b, ["V001"], rows)
    assert all(r["decision"] for r in again)
    b["V001"]["years_min"] = 5
    assert not next(r for r in v.disagreement_rows(a, b, ["V001"], rows) if r["item"] == "years_min")["decision"]
    rows[0]["decision"] = "maybe"
    assert v.reconciled_items(a, b, ["V001"], rows)[1]


def test_a_reconciled_years_pair_must_keep_the_guides_form():
    a, b = {"V001": answer(years_min=5, years_alt=7)}, {"V001": answer(years_min=5, years_alt=6)}
    rows = v.disagreement_rows(a, b, ["V001"])
    rows[0]["decision"], rows[0]["reason"] = "4", "a slip"
    _items, problems = v.reconciled_items(a, b, ["V001"], rows)
    assert problems == ["V001: years_alt needs a smaller years_min"]
    rows[0]["decision"] = "7"
    assert v.reconciled_items(a, b, ["V001"], rows)[1] == []


def test_parse_decision_takes_only_the_items_values():
    assert v.parse_decision("section:scope", "yes") is True
    assert v.parse_decision("years_alt", "none") is None
    assert v.parse_decision("level", "officer") == "officer"
    for item, text in (("section:scope", "true"), ("fact:pay_vague", "vague"), ("years_min", "60"),
                       ("degree", "msc"), ("language", "english")):
        with pytest.raises(ValueError):
            v.parse_decision(item, text)


def setup_reconciled(work) -> None:
    write_csv(roles.ROLES / "broad-adverts.csv", draw_rows())
    v.draw()
    codes = v.load_draw()
    v.ANSWERS.mkdir(parents=True)
    (v.VALID / "guide.md").write_text("guide", encoding="utf-8")
    for coder in "ab":
        lines = [json.dumps(answer(id=vid)) for vid in codes]
        (v.ANSWERS / f"coder-{coder}-all.jsonl").write_text("\n".join(lines), encoding="utf-8")
    v.disagreements()


def test_the_reconciled_set_is_frozen_and_scoring_needs_its_seal(work):
    assert v.score() == 1
    setup_reconciled(work)
    assert v.reconcile() == 0
    sealed = (v.VALID / "reconciled.json").read_text(encoding="utf-8")
    assert v.reconcile() == 0
    assert (v.VALID / "reconciled.json").read_text(encoding="utf-8") == sealed
    (v.VALID / "reconciled.json").write_text(sealed.replace('"bachelor"', '"master"'), encoding="utf-8")
    assert v.reconcile() == 1 and v.score() == 1


def script_row(**kw) -> dict:
    r = {"advert_id": "0" * 16, "facts_given": "", "restrictions": "", "years_min": "", "years_alt": "",
         "degree": "", "function": "unplaced", "sector": "none", "level": "unknown", "language": "en",
         "family_id": "unplaced"}
    r.update(kw)
    return r


def test_script_answers_are_read_from_the_committed_rows():
    s = v.script_items(script_row(facts_given="pay;hours", years_min="5", degree="master", language="unknown",
                                  restrictions="age"), {"responsibilities", "preamble"})
    assert s["fact:pay"] == "given" and s["fact:travel"] == "absent" and s["years_min"] == 5
    assert s["section:responsibilities"] and not s["section:scope"]
    assert s["degree"] == "master" and s["language"] == "other" and s["function"] == "none"
    assert s["restriction:age"] and v.script_of("family", s) == "unplaced"


def test_a_measure_is_validated_only_on_enough_cases_and_its_targets():
    def run(measure, pairs):
        script = [v.script_items(script_row(facts_given="pay" if s else ""), set()) for s, _t in pairs]
        truth = [v.items_of(answer(given=["pay"] if t else [], vague=[])) for _s, t in pairs]
        return v.score_measure(measure, script, truth)

    r = run("fact:pay", [(True, True)] * 18 + [(False, True)] * 2 + [(False, False)] * 80)
    assert (r["positive_cases"], r["script_positives"], r["result"]) == (20, 18, "validated")
    assert r["precision"] == 1 and r["recall"] == pytest.approx(0.9)
    r = run("fact:pay", [(True, True)] * 16 + [(False, True)] * 4 + [(False, False)] * 80)
    assert r["result"] == "Estimate"                       # recall 0.8
    r = run("fact:pay", [(True, True)] * 14 + [(False, False)] * 86)
    assert r["result"] == "not validated"
    # A vague fact is not a given one.
    script = [v.script_items(script_row(facts_given="pay"), set())] * 20
    truth = [v.items_of(answer(vague=["pay"]))] * 20
    assert v.score_measure("fact:pay", script, truth)["precision"] == 0


def test_family_and_restrictions_are_judged_on_the_scripts_own_positives():
    script = ([v.script_items(script_row(function="finance", family_id="finance"), set())] * 16 +
              [v.script_items(script_row(), set())] * 4)
    truth = [v.items_of(answer(function="finance"))] * 15 + [v.items_of(answer(function="hr"))] * 5
    r = v.score_measure("family", script, truth)
    assert (r["script_positives"], r["positive_cases"]) == (16, 20)
    assert r["precision"] == pytest.approx(15 / 16, abs=1e-3) and r["recall"] == pytest.approx(15 / 20)
    assert r["result"] == "validated"
    wash = v.script_items(script_row(function="programme_management", sector="wash",
                                     family_id="programme_management.wash"), set())
    truth = [v.items_of(answer(function="programme_management", sector="wash"))] * 15 + \
        [v.items_of(answer(function="programme_management", sector="none"))] * 5
    r = v.score_measure("family", [wash] * 20, truth)
    assert r["precision"] == pytest.approx(0.75) and r["result"] == "Estimate"
    assert v.score_measure("function", [wash] * 20, truth)["precision"] == 1
    script = [v.script_items(script_row(restrictions="age"), set())] * 3 + [v.script_items(script_row(), set())] * 97
    truth = [v.items_of(answer(restrictions=["age"]))] * 3 + [v.items_of(answer())] * 97
    r = v.score_measure("restriction:age", script, truth)
    assert r["precision"] == 1 and r["result"] == "not validated"


def test_years_are_validated_within_one_year_among_adverts_with_a_figure():
    script = [v.script_items(script_row(years_min=str(y) if y else ""), set()) for y in [5] * 18 + [2, None] + [None] * 80]
    truth = [v.items_of(answer(years_min=y)) for y in [6] * 18 + [5, 3] + [None] * 80]
    r = v.score_measure("years_min", script, truth)
    assert (r["positive_cases"], r["within_one_year"], r["result"]) == (20, 0.9, "validated")


def test_the_committed_file_passes_its_form_check_and_a_bad_one_fails(tmp_path):
    script = [v.script_items(script_row(), set())] * 3
    truth = [v.items_of(answer())] * 3
    rows = v.score_rows(script, truth, {"fact:pay": (0.95, 0.81)})
    good = tmp_path / "broad-validation.csv"
    adverts.write_dicts(good, v.FIELDS, rows)
    assert v.check_problems(good) == []
    assert v.check(path=good) == 0
    assert v.check(path=tmp_path / "missing.csv") == 1
    broken = [dict(r) for r in rows]
    broken[0]["result"] = "validated"                    # 0 positive cases cannot be validated
    adverts.write_dicts(good, v.FIELDS, broken)
    assert any("what its counts give" in p for p in v.check_problems(good))
    for k, bad in (("result", "maybe"), ("precision", "95%"), ("positive_cases", "x"), ("kappa", "2.000"),
                   ("measure", "fact:salary"), ("recall", "jobs@acme.example")):
        broken = [dict(r) for r in rows]
        broken[0][k] = bad
        adverts.write_dicts(good, v.FIELDS, broken)
        assert v.check_problems(good), k
