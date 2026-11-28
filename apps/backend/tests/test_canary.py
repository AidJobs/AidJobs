"""Reader canary (ledger W-35, pull request 2): marks, warnings, message notes only."""
from __future__ import annotations

import pytest

from contracts.canary import (
    append_message,
    evaluate,
    previous_kept_from_logs,
    previous_reader_from_logs,
)
from crawler_v2.readers import GeneralReader, PageUpReader, SitesReader, SuccessFactorsReader


class _FakeCrawler:
    pass


@pytest.fixture
def readers():
    c = _FakeCrawler()
    return [PageUpReader(c), SitesReader(c), SuccessFactorsReader(c), GeneralReader(c)]


def test_pageup_marks_weaker_than_cards():
    assert PageUpReader(_FakeCrawler()).marks('<div class="list-view--item"></div>')
    assert PageUpReader(_FakeCrawler()).marks(
        '<script src="https://careers-static.pageuppeople.com/x.js"></script>'
    )
    assert PageUpReader(_FakeCrawler()).marks("Powered by PageUp")
    assert not PageUpReader(_FakeCrawler()).marks("<html>no marks</html>")


def test_sites_marks_pager_alone():
    assert SitesReader(_FakeCrawler()).marks(
        '<nav class="pagination" engine="Sites::Engine"><ul></ul></nav>'
    )
    assert SitesReader(_FakeCrawler()).marks(
        "<nav class=\"pagination\" engine='Sites::Engine'><ul></ul></nav>"
    )
    assert not SitesReader(_FakeCrawler()).marks(
        '<article class="job-search-results-card-col"></article>'
    )


def test_successfactors_marks_its_tile_markers_alone():
    tiles = '<ul class="container job-list" id="job-tile-list"><li class="job-tile">'
    assert SuccessFactorsReader(_FakeCrawler()).marks(tiles)
    assert SuccessFactorsReader(_FakeCrawler()).marks(
        '<link href="https://rmkcdn.successfactors.com/x.css">'
    )
    assert SuccessFactorsReader(_FakeCrawler()).marks('<body class="coreCSB">')
    assert not SuccessFactorsReader(_FakeCrawler()).marks(
        '<article class="job-search-results-card-col"></article>'
    )
    assert not SuccessFactorsReader(_FakeCrawler()).marks("<html>no marks</html>")


def test_general_marks_never():
    assert not GeneralReader(_FakeCrawler()).marks("<html>anything</html>")


def test_marks_present_but_general_read_the_successfactors_page(readers):
    page = '<body class="coreCSB"><ul id="job-tile-list"></ul></body>'
    warnings = evaluate(
        page=page,
        readers=readers,
        reader_name="general",
        rows_read=12,
        admitted=12,
        observed=0,
        previous_kept=None,
        previous_reader=None,
    )
    assert any("successfactors marks present but general read the listing" in w for w in warnings)


def test_quiet_when_healthy(readers):
    page = '<nav class="pagination" engine="Sites::Engine"></nav>'
    assert (
        evaluate(
            page=page,
            readers=readers,
            reader_name="sites-engine",
            rows_read=10,
            admitted=10,
            observed=0,
            previous_kept=10,
            previous_reader="sites-engine",
        )
        == []
    )


def test_marks_present_but_another_reader(readers):
    page = '<nav class="pagination" engine="Sites::Engine"></nav><div>x</div>'
    warnings = evaluate(
        page=page,
        readers=readers,
        reader_name="general",
        rows_read=5,
        admitted=0,
        observed=0,
        previous_kept=None,
        previous_reader=None,
    )
    assert any("sites-engine marks present" in w for w in warnings)
    assert any("none admitted or observed" in w for w in warnings)


def test_marks_present_but_no_rows(readers):
    page = '<div class="list-view--item"></div>'
    warnings = evaluate(
        page=page,
        readers=readers,
        reader_name="pageup",
        rows_read=0,
        admitted=0,
        observed=0,
    )
    assert warnings == ["pageup marks present but read no rows"]


def test_none_admitted_or_observed(readers):
    warnings = evaluate(
        page="<html></html>",
        readers=readers,
        reader_name="general",
        rows_read=5,
        admitted=0,
        observed=0,
    )
    assert warnings == ["rows read but none admitted or observed"]


def test_observed_counts_as_kept(readers):
    assert (
        evaluate(
            page="<html></html>",
            readers=readers,
            reader_name="general",
            rows_read=5,
            admitted=0,
            observed=5,
            previous_kept=5,
            previous_reader="general",
        )
        == []
    )


def test_half_drop_needs_previous_of_five(readers):
    assert (
        evaluate(
            page="<html></html>",
            readers=readers,
            reader_name="general",
            rows_read=1,
            admitted=1,
            observed=0,
            previous_kept=4,
        )
        == []
    )
    warnings = evaluate(
        page="<html></html>",
        readers=readers,
        reader_name="general",
        rows_read=1,
        admitted=1,
        observed=0,
        previous_kept=10,
    )
    assert any("less than half" in w for w in warnings)


def test_reader_changed(readers):
    warnings = evaluate(
        page="<html></html>",
        readers=readers,
        reader_name="sites-engine",
        rows_read=10,
        admitted=10,
        observed=0,
        previous_kept=10,
        previous_reader="pageup",
    )
    assert warnings == ["reader changed from pageup to sites-engine"]


def test_append_message_only_when_warn():
    assert append_message("Found 3 jobs", []) == "Found 3 jobs"
    assert append_message("Found 3 jobs", ["rows read but none admitted or observed"]) == (
        "Found 3 jobs; canary: rows read but none admitted or observed"
    )


def test_previous_kept_skips_null_valid():
    assert previous_kept_from_logs(lambda: (None, 2)) is None
    assert previous_kept_from_logs(lambda: (10, 2)) == 12
    assert previous_kept_from_logs(lambda: (_ for _ in ()).throw(RuntimeError())) is None


def test_previous_reader_skips_errors():
    assert previous_reader_from_logs(lambda: "sites-engine") == "sites-engine"
    assert previous_reader_from_logs(lambda: None) is None
    assert previous_reader_from_logs(lambda: (_ for _ in ()).throw(RuntimeError())) is None
