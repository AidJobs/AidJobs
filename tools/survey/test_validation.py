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
    # The latest guide's categories are the script's; rounds 1 and 2 keep guide 1.1's, residence under
    # nationality (19.18).
    assert v.ROUNDS[max(v.ROUNDS)]["restrictions"] == list(adverts.RESTRICTIONS)
    assert set(v.RESTRICTIONS_11) == set(adverts.RESTRICTIONS) - {"residence"}
    assert v.RESTRICTION_IDS == v.RESTRICTIONS_11
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


def test_an_advert_one_coder_could_not_code_takes_a_decision_on_every_item():
    a, b = {"V001": answer()}, {}
    rows = v.disagreement_rows(a, b, ["V001"])
    assert len(rows) == len(v.ITEM_KEYS) and {r["coder_b"] for r in rows} == {"not coded"}
    items, problems = v.reconciled_items(a, b, ["V001"], rows)
    assert len(problems) == len(v.ITEM_KEYS)
    for r in rows:
        r["decision"], r["reason"] = r["coder_a"], "checked against the advert"
    items, problems = v.reconciled_items(a, b, ["V001"], rows)
    assert problems == [] and items["V001"] == v.items_of(answer())
    assert v.reconciled_items({}, {}, ["V001"], rows)[1] == ["V001: coded by neither coder"]


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


# --- round 2 (19.17): a fresh draw after the rules are revised ----------------------------------------

def test_a_later_round_never_draws_an_earlier_rounds_advert_and_keeps_the_same_strata():
    rows = draw_rows() + [{"advert_id": f"e{i:015x}", "org_id": f"small-{i}", "source": "archive", "system": "Small",
                           "language": "en", "held_out": "false"} for i in range(50)]
    exclude = {rows[0]["advert_id"]}
    first = {r["advert_id"] for r in v.draw_sample(rows, exclude)}
    # Three of "Small"'s 50 were drawn before: 47 are left, and the system keeps its floor of 3.
    earlier = first | {f"e{i:015x}" for i in range(3)}
    second = v.draw_sample(rows, exclude, seed=20261114, earlier=earlier)
    assert not {r["advert_id"] for r in second} & earlier
    assert v.draw_problems(second, rows, exclude, earlier) == []
    assert sum(r["system"] == "Small" for r in second) >= 3
    assert any("earlier round" in p for p in v.draw_problems(v.draw_sample(rows, exclude), rows, exclude, first))


def test_round_two_has_ids_from_v101_and_five_batches_with_no_pilot():
    codes = v.codes_for(v.draw_sample(draw_rows(), set()), 20261114, 101, 0, 5)
    assert sorted(codes) == [f"V{i:03d}" for i in range(101, 201)]
    assert sorted(Counter(c["batch"] for c in codes.values()).items()) == [(f"batch-{i}", 20) for i in range(1, 6)]


@pytest.fixture
def round2(work, monkeypatch):
    monkeypatch.setattr(v, "ROUND", 1)
    monkeypatch.setattr(v, "SEED", v.SEED)
    rows = draw_rows()
    write_csv(roles.ROLES / "broad-adverts.csv", rows)
    assert v.draw() == 0                                     # round 1, in work/validation
    v.use_round(2)
    assert v.draw() == 0
    return rows


def test_round_two_leaves_out_round_one_and_holds_its_rules(round2, monkeypatch):
    first = json.loads((adverts.WORK / "validation" / "draw.json").read_text(encoding="utf-8"))["codes"]
    second = v.load_draw()
    assert min(second) == "V101" and v.VALID.name == "validation-2"
    assert not {c["advert_id"] for c in first.values()} & {c["advert_id"] for c in second.values()}
    # A rebuild that changes only measures keeps the draw; changed strata, or changed rules while the
    # round is the latest, refuse it.
    rows = [dict(r, facts_given="pay") for r in round2]
    write_csv(roles.ROLES / "broad-adverts.csv", rows)
    assert v.load_draw() == second
    with monkeypatch.context() as m:
        m.setattr(v, "rules_hashes", lambda: {"adverts.py": "changed"})
        m.setattr(v, "ROUNDS", {k: c for k, c in v.ROUNDS.items() if k <= 2})
        with pytest.raises(SystemExit, match="rules"):
            v.load_draw()
    # Once a later round exists, round 2 is a scored record: its draw stays usable for recheck.
    with monkeypatch.context() as m:
        m.setattr(v, "rules_hashes", lambda: {"adverts.py": "changed"})
        assert v.load_draw() == second
    rows[5]["language"] = "fr" if rows[5]["language"] == "en" else "en"
    write_csv(roles.ROLES / "broad-adverts.csv", rows)
    with pytest.raises(SystemExit, match="changed since"):
        v.load_draw()


def test_a_round_two_draw_must_record_its_strata_and_rules(round2):
    path = v.VALID / "draw.json"
    saved = json.loads(path.read_text(encoding="utf-8"))
    for k in ("strata", "rules"):
        saved.pop(k)
    path.write_text(json.dumps(saved), encoding="utf-8")
    with pytest.raises(SystemExit, match="does not record"):
        v.load_draw()


def test_an_earlier_rounds_committed_results_are_never_scored_over(round2):
    v.use_round(1)
    v.OUTPUT.write_text("round 1's results", encoding="utf-8")
    assert v.score() == 1 and v.OUTPUT.read_text(encoding="utf-8") == "round 1's results"


def test_round_two_is_scored_only_on_a_set_reconciled_with_the_frozen_guide(round2):
    path = v.VALID / "reconciled.json"
    path.write_text(json.dumps({"guide": "another", "items": {}}), encoding="utf-8")
    (v.VALID / "reconciled.sha256").write_text(v.sha256(path) + "\n", encoding="utf-8")
    assert v.score() == 1 and not v.OUTPUT.exists()


def test_round_one_survives_a_rebuild_of_measures_through_its_commits_file(work, monkeypatch):
    rows = draw_rows()
    write_csv(roles.ROLES / "broad-adverts.csv", rows)
    v.draw()
    saved = json.loads((v.VALID / "draw.json").read_text(encoding="utf-8"))
    old_file_sha = saved["drawn_from"]
    for k in ("strata", "rules", "round"):                   # round 1 recorded only the whole file
        saved.pop(k)
    (v.VALID / "draw.json").write_text(json.dumps(saved), encoding="utf-8")
    write_csv(roles.ROLES / "broad-adverts.csv", [dict(r, years_min="3") for r in rows])
    monkeypatch.setattr(v, "round1_strata", lambda: (v.strata_hash(rows), old_file_sha))
    assert v.load_draw() == saved["codes"]
    monkeypatch.setattr(v, "round1_strata", lambda: ("other", old_file_sha))
    with pytest.raises(SystemExit, match="changed since"):
        v.load_draw()


def test_round_two_is_coded_on_the_frozen_guide_only(round2, monkeypatch):
    assert v.ROUNDS[1]["guide"] is None and v.ROUNDS[2]["guide"] == v.GUIDE_11 != v.ROUNDS[3]["guide"]
    (v.VALID / "guide.md").write_text("A different guide.", encoding="utf-8")
    assert v.frozen_guide_problems() and v.guide() == 1
    monkeypatch.setitem(v.ROUNDS[2], "guide", v.sha256(v.VALID / "guide.md"))
    assert v.frozen_guide_problems() == []


def test_a_long_line_is_given_in_pieces_under_its_own_number():
    ad = {"title": "Officer", "method": "feed", "lines": [{"text": "short", "heading": False, "tag": "p"},
                                                          {"text": " ".join(["word"] * 40), "heading": False, "tag": "p"}]}
    text, n = v.packet_text("V101", ad, "", chunk=50)
    assert n == 2
    body = text.split("Lines:\n", 1)[1].splitlines()
    assert body[0] == "1 short" and body[1].startswith("2 word") and all(b.startswith("2 (continued) word")
                                                                         for b in body[2:])
    words = [w for b in body[1:] for w in b.replace("(continued)", "").split()[1:]]
    assert words == ["word"] * 40
    assert v.packet_text("V101", ad, "")[0].count("\n2 ") == 1          # round 1's packets are unchanged


def test_check_needs_every_rounds_committed_file(tmp_path, monkeypatch):
    monkeypatch.setattr(roles, "ROLES", tmp_path)
    rows = v.score_rows([v.script_items(script_row(), set())] * 3, [v.items_of(answer())] * 3, {})
    adverts.write_dicts(tmp_path / "broad-validation.csv", v.FIELDS, rows)
    assert v.check() == 1
    adverts.write_dicts(tmp_path / "broad-validation-2.csv", v.FIELDS, rows)
    assert v.check() == 1                                    # round 3's file is missing
    v.set_measures(3)
    third = v.targeted_rows([v.script_items(script_row(), set())] * 3, [v.items_of(restriction_answer())] * 3,
                            ["rest"] * 3, {"rest": 100}, {}, {})
    adverts.write_dicts(tmp_path / "broad-validation-3.csv", v.FIELDS, third)
    v.set_measures(1)
    assert v.check() == 0
    # Each file is checked in its own round's form: round 1's rows in round 3's file fail.
    adverts.write_dicts(tmp_path / "broad-validation-3.csv", v.FIELDS, rows)
    assert v.check() == 1


# --- round 3 (19.18): restrictions only, a targeted draw ------------------------------------------------

@pytest.fixture(autouse=True)
def back_to_round_one():
    yield
    v.use_round(1)


def restriction_answer(**kw) -> dict:
    a = {"id": "V201", "restrictions": [], "preferred": []}
    a.update(kw)
    return a


def test_round_three_codes_restrictions_only_with_residence_and_preferences():
    v.set_measures(3)
    assert v.RESTRICTION_IDS == list(adverts.RESTRICTIONS) and "residence" in v.RESTRICTION_IDS
    assert v.ANSWER_KEYS == {"id", "restrictions", "preferred", "note"}
    assert v.MEASURES[0] == "restriction:any" and v.MEASURES[-1] == "restriction:preferred"
    assert all(m in v.PRECISION_ONLY for m in v.MEASURES)
    assert v.answer_problems(restriction_answer(restrictions=["residence"], preferred=["residence"]), 5) == []
    assert v.answer_problems(restriction_answer(restrictions=["residence"], note="short"), 5) == []
    for bad in (restriction_answer(restrictions=["gender"]), restriction_answer(preferred=["residence"]),
                restriction_answer(restrictions=["age", "age"]), {"id": "V201", "restrictions": []}):
        assert v.answer_problems(bad, 5), bad
    items = v.items_of(restriction_answer(restrictions=["nationality", "residence"], preferred=["residence"]))
    assert items["restriction:residence"] and items["preferred:residence"] and not items["preferred:nationality"]
    assert v.value_for("restriction:preferred", items) and v.value_for("restriction:any", items)
    assert v.parse_decision("preferred:residence", "yes") is True
    assert v.item_problems({**items, "restriction:residence": False}) == ["a category is preferred but not a restriction"]


def test_a_recheck_is_named_by_its_rules_and_never_written_over(work, monkeypatch):
    calls = []
    monkeypatch.setattr(v, "score_to", lambda out, err, local=False: calls.append((out.name, err.name, local)) or 0)
    monkeypatch.setattr(v, "rules_hashes", lambda: {"adverts.py": "abcdef0123456789"})
    assert v.recheck() == 0 and calls == [("recheck-abcdef012345.csv", "errors-recheck-abcdef012345.csv", True)]
    v.VALID.mkdir(parents=True, exist_ok=True)
    (v.VALID / "recheck-abcdef012345.csv").write_text("kept", encoding="utf-8")
    assert v.recheck() == 0 and len(calls) == 1
    assert (v.VALID / "recheck-abcdef012345.csv").read_text(encoding="utf-8") == "kept"


def test_a_round_on_guide_one_one_reads_residence_as_nationality():
    v.set_measures(2)
    s = v.script_items(script_row(restrictions="residence~preference;age"), set())
    assert s["restriction:nationality"] and s["restriction:age"] and "restriction:residence" not in s
    v.set_measures(3)
    s = v.script_items(script_row(restrictions="residence~preference;age"), set())
    assert s["restriction:residence"] and s["preferred:residence"] and not s["restriction:nationality"]
    assert not s["preferred:age"]


def pool_rows() -> list[dict]:
    """A made-up evidence pool: 60 nationality positives at 30 organisations, 4 religion positives at
    one, 50 adverts the net catches and 200 others."""
    rows = []
    for i in range(60):
        rows.append({"advert_id": f"a{i:015x}", "org_id": f"nat-{i % 30}", "restrictions": "nationality"})
    for i in range(4):
        rows.append({"advert_id": f"b{i:015x}", "org_id": "faith-org", "restrictions": "religion"})
    for i in range(250):
        rows.append({"advert_id": f"c{i:015x}", "org_id": f"other-{i % 60}", "restrictions": ""})
    for r in rows:
        r.update(source="archive", system="own site", language="en", held_out="false")
    return rows


def test_a_targeted_draw_takes_each_categorys_positives_then_net_and_rest():
    rows = pool_rows()
    texts = {r["advert_id"]: ("Officer", ["Applicants must live within commuting distance."]
                              if r["advert_id"].startswith("c") and int(r["advert_id"][1:], 16) < 50
                              else ["Keep the stock records."]) for r in rows}
    earlier = {rows[0]["advert_id"]}
    exclude = {rows[1]["advert_id"]}
    pool = v.pool_info(rows, texts, exclude, earlier)
    assert len(pool) == len(rows) - 2
    assert Counter(r["stratum"] for r in pool) == {"positive": 62, "net": 50, "rest": 200}
    chosen = v.targeted_sample(pool, 20261115)
    ids = {r["advert_id"] for r in chosen}
    assert not ids & (earlier | exclude)
    assert sum("nationality" in r["cats"] for r in chosen) == v.PER_CATEGORY
    # Every religion positive is wanted, but at most 3 from one organisation.
    assert sum("religion" in r["cats"] for r in chosen) == v.ORG_MAX
    assert Counter(r["stratum"] for r in chosen)["net"] == v.NET_SIZE
    assert Counter(r["stratum"] for r in chosen)["rest"] == v.REST_SIZE
    for stratum in ("net", "rest"):
        assert max(Counter(r["org_id"] for r in chosen if r["stratum"] == stratum).values()) <= v.ORG_MAX
    assert [r["advert_id"] for r in v.targeted_sample(pool, 20261115)] == [r["advert_id"] for r in chosen]
    codes = v.targeted_codes(chosen, 20261115, 201, 5)
    assert sorted(codes) == [f"V{i:03d}" for i in range(201, 201 + len(chosen))]
    assert max(Counter(c["batch"] for c in codes.values()).values()) == 5
    assert not any("stratum" in c or "cats" in c for c in codes.values())
    assert v.targeted_problems([r for r in rows if r["advert_id"] in ids], rows, exclude, earlier) == []
    assert v.targeted_problems([rows[0]], rows, exclude, earlier) == ["an advert of an earlier round was drawn"]


def test_the_keyword_net_leaves_out_equal_opportunity_sentences():
    assert v.net_hits("Officer", ["Applicants must live within commuting distance."]) == {"residence"}
    assert v.net_hits("Officer", ["We hire regardless of nationality, age or religion."]) == set()
    assert v.net_hits("National Consultant", ["Keep records."]) == {"national_post"}
    assert len(v.net_hash()) == 64


def test_a_targeted_round_is_judged_on_the_scripts_positives_and_weights_recall():
    v.set_measures(3)
    pos = v.script_items(script_row(restrictions="residence"), set())
    neg = v.script_items(script_row(), set())
    yes = v.items_of(restriction_answer(restrictions=["residence"]))
    no = v.items_of(restriction_answer())
    # 18 of 20 script positives are true; one miss among 10 net adverts (pool 100) and none among 10
    # others (pool 1,000); the script finds 50 residence adverts in the pool.
    script = [pos] * 20 + [neg] * 20
    truth = [yes] * 18 + [no] * 2 + [yes] + [no] * 19
    strata = ["positive"] * 20 + ["net"] * 10 + ["rest"] * 10
    rows = {r["measure"]: r for r in v.targeted_rows(script, truth, strata, {"positive": 60, "net": 100, "rest": 1000},
                                                       {"residence": 50, "any": 60}, {})}
    r = rows["restriction:residence"]
    assert (r["sampled_script_positives"], r["true_positives"], r["positive_cases"]) == (20, 18, 19)
    assert r["precision"] == "0.900" and r["result"] == "validated"
    # Recall: 45 found (0.9 of 50) over 45 plus 10 estimated misses (1 of 10 net adverts, pool 100).
    assert r["recall_estimate"] == f"{45 / 55:.3f}"
    assert rows["restriction:age"]["result"] == "not validated"


def test_a_targeted_draw_is_refused_once_its_rules_or_net_change(work, monkeypatch):
    v.use_round(3)
    monkeypatch.setattr(v, "VALID", adverts.WORK / "validation-3")
    for k in (1, 2):
        folder = adverts.WORK / v.ROUNDS[k]["folder"]
        folder.mkdir(parents=True)
        (folder / "draw.json").write_text(json.dumps({"codes": {}}), encoding="utf-8")
    rows = pool_rows()
    write_csv(roles.ROLES / "broad-adverts.csv", rows)
    texts = {r["advert_id"]: ("Officer", ["Keep the stock records."]) for r in rows}
    assert v.draw_targeted(rows, texts, set(), set()) == 0
    codes = v.load_draw()
    assert min(codes) == "V201"
    strata = json.loads((v.VALID / "strata.json").read_text(encoding="utf-8"))
    assert set(strata["strata"]) == set(codes) and strata["script_pool"]["nationality"] == 60
    with monkeypatch.context() as m:
        m.setattr(v, "rules_hashes", lambda: {"adverts.py": "changed"})
        with pytest.raises(SystemExit, match="rules"):
            v.load_draw()
    with monkeypatch.context() as m:
        m.setattr(v, "net_hash", lambda: "changed")
        with pytest.raises(SystemExit, match="net"):
            v.load_draw()
    assert v.draw() == 0                                      # frozen: kept as it is
