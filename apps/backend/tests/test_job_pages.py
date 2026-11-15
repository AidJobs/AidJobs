"""Which job pages a crawl opens (W-09, W-36) and the observation path (W-36). No database."""
from datetime import date, datetime, timezone

import pytest

from contracts.admission import page_verdicts
from contracts.expiry import RETURN_ON_SIGHT_SQL
from contracts.persist import observation_link, observe_known
from crawler_v2.job_pages import (
    ROTATION_CRAWLS,
    PagePlan,
    choose_pages,
    rotation_bucket,
    saved_job,
)

TODAY = date(2026, 11, 11)
WHEN = datetime(2026, 11, 11, 9, 0, tzinfo=timezone.utc)


def _row(n, **fields):
    return {"title": f"Officer {n}", "apply_url": f"https://jobs.example/job/{n}/officer", **fields}


def _plan(rows, saved=None, *, verdicts=None, run_number=0, **caps) -> PagePlan:
    verdicts = page_verdicts(rows, "html") if verdicts is None else verdicts
    by_link = {}
    for url, job in (saved or {}).items():
        by_link.setdefault(observation_link(url), []).append(job)
    return choose_pages(rows, verdicts, by_link, today=TODAY, run_number=run_number, **caps)


def _never_in_turn(job_id_prefix, run_number):
    """A job id whose rotation bucket is not this run's turn."""
    n = 0
    while rotation_bucket(f"{job_id_prefix}{n}") == run_number % ROTATION_CRAWLS:
        n += 1
    return f"{job_id_prefix}{n}"


# ---------------------------------------------------------------------------
# Admission's verdicts, without stamping a row.
# ---------------------------------------------------------------------------


def test_page_verdicts_name_admitted_and_thin_rows_and_leave_out_junk():
    rows = [
        _row(1, location_raw="Nairobi, Kenya"),
        _row(2),
        {"title": "About us", "apply_url": "https://jobs.example/about"},
        {"title": "Careers home", "apply_url": "https://jobs.example/"},
    ]
    before = [dict(row) for row in rows]
    assert page_verdicts(rows, "html") == {0: "admitted", 1: "thin_vacancy"}
    assert rows == before, "no row is stamped or changed"


# ---------------------------------------------------------------------------
# New vacancies.
# ---------------------------------------------------------------------------


def test_new_vacancies_are_opened_up_to_the_cap():
    rows = [_row(n) for n in range(1, 6)]
    plan = _plan(rows, new_cap=3)
    assert len(plan.open) == 3
    assert plan.open | plan.unconfirmed == {0, 1, 2, 3, 4}
    assert not plan.open & plan.unconfirmed, "thin and over the cap: held back"
    assert plan.listing_only == plan.saved == set()


def test_no_new_vacancy_waits_behind_the_same_others_every_crawl():
    rows = [_row(n) for n in range(1, 21)]
    opened = set()
    for run_number in range(7):  # ceil(20 / 3) crawls
        opened |= _plan(rows, run_number=run_number, new_cap=3).open
    assert opened == set(range(20))


def test_a_structured_posting_without_its_fields_is_a_row_its_page_can_cure():
    rows = [{"title": "Officer", "apply_url": "https://jobs.example/careers/officer",
             "record_class": "job_posting"}]
    assert page_verdicts(rows, "html") == {0: "thin_vacancy"}
    assert _plan(rows).open == {0}


def test_a_new_vacancy_over_the_cap_the_listing_admits_is_saved_from_the_listing():
    rows = [_row(1), _row(2, deadline="2026-12-01")]
    for run_number in range(2):
        plan = _plan(rows, run_number=run_number, new_cap=1)
        assert len(plan.open) == 1
        assert 1 not in plan.unconfirmed, "admitted by its listing: saved from it, never held"
        assert plan.unconfirmed == {0} - plan.open, "thin and over the cap: held back"
        assert 1 not in plan.listing_only, "new, so not a saved job read from its listing"


def test_junk_rows_are_never_opened():
    rows = [{"title": "About us", "apply_url": "https://jobs.example/about"}, _row(1)]
    plan = _plan(rows)
    assert plan.open == {1}
    assert 0 not in plan.unconfirmed | plan.listing_only


# ---------------------------------------------------------------------------
# Saved jobs.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("deadline", ["2026-11-08", "2026-11-11", "2026-11-14"])
def test_a_saved_jobs_page_is_reopened_within_three_days_of_its_deadline(deadline):
    job = saved_job(_never_in_turn("near-", 0), deadline, hidden=False)
    plan = _plan([_row(1)], {_row(1)["apply_url"]: job})
    assert plan.open == {0}


@pytest.mark.parametrize("deadline", ["2026-11-07", "2026-11-15", None, "not a date"])
def test_a_saved_jobs_page_is_otherwise_read_from_the_listing(deadline):
    job = saved_job(_never_in_turn("far-", 0), deadline, hidden=False)
    plan = _plan([_row(1)], {_row(1)["apply_url"]: job})
    assert plan.open == set()
    assert plan.listing_only == {0}


def test_the_rotation_reopens_each_saved_job_once_in_seven_crawls():
    rows = [_row(n) for n in range(1, 30)]
    saved = {row["apply_url"]: saved_job(f"job-{i}", None, hidden=False)
             for i, row in enumerate(rows)}
    opened = {index: 0 for index in range(len(rows))}
    for run_number in range(100, 100 + ROTATION_CRAWLS):
        plan = _plan(rows, saved, run_number=run_number, known_cap=len(rows))
        for index in plan.open:
            opened[index] += 1
        assert plan.open | plan.listing_only == set(range(len(rows)))
    assert set(opened.values()) == {1}


@pytest.mark.parametrize("run_number", [0, 1, 6, 7, 13, 700])
def test_a_saved_job_is_reopened_exactly_on_its_rotation_turn(run_number):
    rows = [_row(n) for n in range(1, 15)]
    saved = {row["apply_url"]: saved_job(f"turn-{i}", None, hidden=False)
             for i, row in enumerate(rows)}
    plan = _plan(rows, saved, run_number=run_number, known_cap=len(rows))
    expected = {i for i in range(len(rows))
                if rotation_bucket(f"turn-{i}") == run_number % ROTATION_CRAWLS}
    assert plan.open == expected
    assert plan.saved == set(range(len(rows)))


@pytest.mark.parametrize("count", [21, 39])
def test_no_saved_job_waits_behind_the_same_others_when_its_turn_is_over_the_cap(count):
    # 21 rows with a cap of 3: a start moved on every crawl rather than every turn would move
    # 7 x 3 = 21 places a turn, back to where it was, and reach only three of them.
    rows = [_row(n) for n in range(1, count + 1)]
    ids = [next(f"cap-{i}-{k}" for k in range(1000) if rotation_bucket(f"cap-{i}-{k}") == 0)
           for i in range(len(rows))]
    saved = {row["apply_url"]: saved_job(ids[i], None, hidden=False)
             for i, row in enumerate(rows)}
    opened = set()
    for turn in range(-(-count // 3)):  # ceil(count / 3) of the bucket's turns
        opened |= _plan(rows, saved, run_number=turn * ROTATION_CRAWLS, known_cap=3).open
    assert opened == set(range(len(rows)))


def test_the_saved_jobs_cap_takes_deadlines_before_the_rotation():
    rows = [_row(n) for n in range(1, 4)]
    turn = 3
    in_turn = next(f"rot-{n}" for n in range(500) if rotation_bucket(f"rot-{n}") == turn)
    saved = {
        rows[0]["apply_url"]: saved_job(in_turn, None, hidden=False),
        rows[1]["apply_url"]: saved_job(_never_in_turn("a-", turn), "2026-11-12", hidden=False),
        rows[2]["apply_url"]: saved_job(_never_in_turn("b-", turn), "2026-11-10", hidden=False),
    }
    plan = _plan(rows, saved, run_number=turn, known_cap=2)
    assert plan.open == {1, 2}
    assert plan.listing_only == {0}


def test_a_hidden_saved_job_is_not_reopened():
    job = saved_job("hidden-1", "2026-11-11", hidden=True)
    plan = _plan([_row(1)], {_row(1)["apply_url"]: job})
    assert plan.open == set()
    assert plan.listing_only == {0}


def test_saved_jobs_are_matched_on_the_normalised_link():
    job = saved_job(_never_in_turn("norm-", 0), None, hidden=False)
    stored = "https://JOBS.example/job/1/officer/"
    row = {"title": "Officer 1", "apply_url": "https://jobs.example/job/1/officer?utm_source=x"}
    plan = _plan([row], {stored: job})
    assert plan.listing_only == {0}, "known, not new"


def test_a_stored_deadline_is_read_as_its_day():
    assert saved_job("a", date(2026, 11, 12), hidden=False).deadline == "2026-11-12"
    assert saved_job("a", "2026-11-12", hidden=False).deadline == "2026-11-12"
    assert saved_job("a", None, hidden=False).deadline is None


# ---------------------------------------------------------------------------
# The observation path in the writer.
# ---------------------------------------------------------------------------


class FakeCursor:
    def __init__(self):
        self.statements = []

    def execute(self, sql, params=None):
        self.statements.append((" ".join(sql.split()), params))

    def fetchone(self):
        return None


def _saved(job_id="job-1", url=None, **fields):
    row = {"id": job_id, "apply_url": url or _row(1)["apply_url"], "status": "active",
           "deadline": None, "deleted_at": None}
    row.update(fields)
    return row


def _observe(rows, row=None, **kwargs):
    by_link = {}
    for saved in rows:
        by_link.setdefault(observation_link(saved["apply_url"]), []).append(saved)
    cursor, seen, not_open = FakeCursor(), [], []
    outcome = observe_known(
        cursor, row or _row(1), by_link, observed_at=WHEN, source_id="src-1",
        open_on=TODAY, seen=seen, not_open=not_open, **kwargs,
    )
    return outcome, cursor.statements, seen, not_open


def test_a_thin_row_of_one_saved_open_job_updates_only_its_last_seen_time():
    outcome, statements, seen, not_open = _observe([_saved()])
    assert outcome == "observed"
    assert statements == [("UPDATE jobs SET last_seen_at = %s WHERE id = %s", (WHEN, "job-1"))]
    assert (seen, not_open) == (["job-1"], [])


def test_a_job_expired_by_absence_is_observed_but_was_not_open():
    outcome, statements, seen, not_open = _observe([_saved(status="expired")])
    assert outcome == "observed"
    assert statements[0][0].startswith("UPDATE jobs SET last_seen_at")
    assert [sql for sql, _p in statements[1:]] == [
        " ".join(RETURN_ON_SIGHT_SQL.split())
    ], "then the return on sight (contracts.expiry), nothing else"
    assert (seen, not_open) == ([], ["job-1"])


@pytest.mark.parametrize("fields", [
    {"deleted_at": WHEN},
    {"deadline": date(2026, 11, 10)},
    {"status": "expired", "deadline": "2026-11-01"},
    {"status": "archived"},
])
def test_hidden_passed_or_other_jobs_are_not_observed(fields):
    outcome, statements, seen, not_open = _observe([_saved(**fields)])
    assert outcome == "ineligible"
    assert statements == []
    assert (seen, not_open) == ([], [])


def test_two_eligible_saved_jobs_with_the_link_observe_nothing():
    rows = [_saved("job-1"), _saved("job-2", url=_row(1)["apply_url"] + "/")]
    outcome, statements, seen, not_open = _observe(rows)
    assert outcome == "ambiguous"
    assert statements == []
    assert (seen, not_open) == ([], [])


def test_one_eligible_and_one_hidden_job_with_the_link_observes_the_eligible_one():
    rows = [_saved("job-1"), _saved("job-2", deleted_at=WHEN)]
    outcome, statements, seen, _not_open = _observe(rows)
    assert outcome == "observed"
    assert statements[0][1] == (WHEN, "job-1")


def test_an_unknown_link_observes_nothing():
    outcome, statements, _seen, _not_open = _observe([_saved()], row=_row(9))
    assert (outcome, statements) == ("unknown", [])


def test_a_deadline_today_is_still_open():
    outcome, _statements, seen, _not_open = _observe([_saved(deadline="2026-11-11")])
    assert (outcome, seen) == ("observed", ["job-1"])
