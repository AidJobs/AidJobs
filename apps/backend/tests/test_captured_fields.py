"""Captured fields (W-37): reading, cleaning, placing and writing. No network or database."""
import asyncio
from datetime import date, datetime, timezone
from pathlib import Path

import pytest
from bs4 import BeautifulSoup

from contracts.captured import (
    CONTACT_REMOVED,
    DESCRIPTION_LIMIT,
    clean_description,
    clean_locations,
    clean_short_text,
    posted_day,
)
from contracts.detail_reader import (
    apply_captured_fields,
    apply_detail_reading,
    read_detail_fields,
    read_detail_page,
)
from contracts.identity import algorithm_a
from contracts.persist import LOAD_COLUMNS, persist_candidate

SEEN = date(2026, 11, 9)
WHEN = datetime(2026, 11, 9, 8, 0, tzinfo=timezone.utc)


# --- Description cleaning -------------------------------------------------------------------


def test_html_becomes_paragraphs_and_list_lines():
    html = (
        "<p>About <b>us</b></p><ul><li>First duty</li><li>Second<br>line</li></ul>"
        "<script>track()</script><style>p{}</style><p>&nbsp;</p><h3>Apply</h3>"
    )
    assert clean_description(html) == (
        "About us\n\n• First duty\n\n• Second\nline\n\nApply"
    )


def test_escaped_html_inside_structured_data_is_read_once_more():
    escaped = "&lt;p&gt;Role&lt;/p&gt;&lt;p&gt;Duties&lt;/p&gt;"
    assert clean_description(escaped) == "Role\n\nDuties"


def test_a_tag_is_read_without_its_own_wrapper():
    soup = BeautifulSoup('<span lang="en-GB"><p>One</p><p>Two</p></span>', "html.parser")
    assert clean_description(soup.span) == "One\n\nTwo"


@pytest.mark.parametrize("value", [None, "", "   ", "<p> </p>", 5, ["text"]])
def test_nothing_published_is_none(value):
    assert clean_description(value) is None


@pytest.mark.parametrize(
    ("text", "kept"),
    [
        ("Please e-mail us at jobs.syria@oxfam.org.uk, quoting the title.", "Please e-mail us at"),
        ("Write to recruit [at] example [dot] org today.", "Write to"),
        ("Write to recruit(at)example.org today.", "Write to"),
        ("Call +41 22 730 21 11 for details.", "Call"),
        ("Call +44 (0)20 7946 0958.", "Call"),
        ("Tel: 022 730 2111.", "Tel:"),
        ("Phone number: 555-0134-77", "Phone number:"),
        ("WhatsApp 0712 345 678 any time.", "WhatsApp"),
        ("Ring 020 7946 0958 between nine and five.", "Ring"),
    ],
)
def test_contacts_are_removed(text, kept):
    cleaned = clean_description(text)
    assert CONTACT_REMOVED in cleaned
    assert cleaned.startswith(kept)
    for fragment in ("@", "oxfam.org", "730", "7946", "345 678", "0134"):
        assert fragment not in cleaned


def test_contact_links_are_removed_with_their_text():
    html = (
        '<p>Questions: <a href="mailto:hr@example.org">Ms Recruiter</a> or '
        '<a href="TEL:+1 555 0100">our office</a>. '
        '<a href="https://example.org/apply">Apply here</a></p>'
    )
    assert clean_description(html) == (
        f"Questions: {CONTACT_REMOVED} or {CONTACT_REMOVED}. Apply here"
    )


@pytest.mark.parametrize(
    "text",
    [
        "Contract from 01.10.2026 to 31.12.2026 (01-10-2026).",
        "Programme 2026-2027 and 2025 - 2027.",
        "Salary: £25,557 per annum; grade P-3; 5 to 8 years.",
        "Reference INT11888, vacancy 1444751333.",
        "Budget of USD 12 500 000 over 36 months.",
        "Deadline 06/11/2026; growth of +5% a year.",
        "Founded in 1949 under the Geneva Conventions.",
        "Telephone allowance of 50 CHF.",
    ],
)
def test_dates_amounts_and_references_are_kept(text):
    assert clean_description(text) == text


@pytest.mark.parametrize(
    "text",
    [
        "Write to jobs @ oxfam.org today.",
        "Write to jobs@ oxfam.org today.",
        "Write to jobs at oxfam dot org today.",
        "Write to (202) 555-0143 today.",
        "Write to 202-555-0143 today.",
        "Write to Hotline: 1-800-555-0199 today.",
        "Write to Contact number: 734 6001 today.",
        "Write to Contact: 734 60 01 today.",
        "Write to +44 20 7946\u20130958 today.",
        "Write to Kenya +254 722 123 456 today.",
        "Write to Mobile: 0722 123 456 today.",
        "Write to Tel 734 6001 today.",
    ],
)
def test_more_contact_forms_are_removed(text):
    cleaned = clean_description(text)
    assert cleaned.startswith("Write to") and cleaned.endswith("today.")
    assert CONTACT_REMOVED in cleaned
    for fragment in ("@", "oxfam", "555", "734", "7946", "0958", "722"):
        assert fragment not in cleaned


def test_contacts_split_by_inline_tags_are_removed():
    assert clean_description("<p><span>hr</span> @ <span>unicef.org</span></p>") == CONTACT_REMOVED


def test_an_extension_goes_with_its_number():
    assert clean_description("Call +1 202 555 0143 ext. 1234 now") == f"Call {CONTACT_REMOVED} now"


@pytest.mark.parametrize(
    "text",
    [
        "Closing date: 05.12.2026 12:00 GMT",
        "Deadline: 05.12.2026 (23:59 CET)",
        "Start date: 01.03.2026 (12 months)",
        "Phase step 01 (2026-2027)",
        "The post is mobile. 2026-2027",
        "Funding of +15 000 000 USD.",
        "Salary KES 90,000 - 120,000 per month",
        "Grade P-3, 2 years, 100 000 people",
        "Fax: 12 34 56",
        "Account +1 2345 6789 1123 4567 89",
    ],
)
def test_dates_amounts_and_short_numbers_near_phone_words_are_kept(text):
    assert clean_description(text) == text


@pytest.mark.parametrize(
    "text",
    ["A" * 20_000, "0" * 20_000, "+1" * 10_000, "a." * 50_000, "a@" * 20_000,
     "x at y dot " * 10_000, "A" * 400_000],
)
def test_hostile_text_is_cleaned_quickly(text):
    import time

    start = time.perf_counter()
    clean_description(text)
    assert time.perf_counter() - start < 3


def test_deep_nesting_is_read():
    assert clean_description("<div>" * 5000 + "deep text" + "</div>" * 5000) == "deep text"


def test_forms_and_empty_list_items_leave_nothing():
    html = "<p>Role</p><form><label>Your e-mail</label><input></form><ul><li> </li></ul>"
    assert clean_description(html) == "Role"


def test_script_text_of_escaped_html_is_not_kept():
    escaped = "&lt;p&gt;Role&lt;/p&gt;<script>var tracking = 1;</script>"
    assert clean_description(escaped) == "Role"


def test_a_long_description_is_capped_at_a_word():
    assert DESCRIPTION_LIMIT == 20_000
    text = ("word " * 4_100).strip()
    cleaned = clean_description(text)
    assert len(cleaned) <= 20_000
    assert cleaned.endswith(" …")
    assert cleaned[:-2].split(" ")[-1] == "word"


def test_control_characters_never_reach_the_database():
    assert clean_description("Role\x00 one\x07\r\nTwo") == "Role one\nTwo"


def test_short_text_is_one_line_as_written():
    assert clean_short_text("  Fixed\n Term \x00") == "Fixed Term"
    assert clean_short_text("x" * 400) == "x" * 300
    assert clean_short_text("  ") is None
    assert clean_short_text(["Fixed Term"]) is None


def test_short_text_loses_its_contacts():
    assert clean_short_text("KES 90,000; queries hr@ngo.org / 0722 123 456") == (
        f"KES 90,000; queries {CONTACT_REMOVED} / {CONTACT_REMOVED}"
    )
    assert clean_locations(["Nairobi, call +254 722 123 456"]) == [
        f"Nairobi, call {CONTACT_REMOVED}"
    ]


def test_locations_keep_their_order_once_each():
    assert clean_locations([" Geneva ", "Kabul", "Geneva", "", None, 3]) == ["Geneva", "Kabul"]
    assert clean_locations([f"Place {n}" for n in range(80)]) == [
        f"Place {n}" for n in range(50)
    ]
    assert clean_locations([]) is None
    assert clean_locations("Geneva") is None


# --- Posting date ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("2026-10-11", "2026-10-11"),
        ("2026-10-11T23:30:00+05:00", "2026-10-11"),
        ("Fri Oct 09 02:00:00 UTC 2026", "2026-10-09"),
        ("Tue Oct 06 00:00:00 CEST 2026", "2026-10-06"),
        ("2026-11-10", "2026-11-10"),
        (date(2026, 1, 2), "2026-01-02"),
        (datetime(2026, 1, 2, 23, 0), "2026-01-02"),
    ],
)
def test_a_published_posting_date_is_kept_as_its_calendar_day(raw, expected):
    assert posted_day(raw, SEEN) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "2026-11-11",
        "2026-02-30",
        "Fri Foo 09 02:00:00 UTC 2026",
        "11 October 2026",
        "10/11/2026",
        "",
        None,
        20261011,
    ],
)
def test_an_unreadable_or_future_posting_date_is_not_stored(raw):
    assert posted_day(raw, SEEN) is None


# --- Reading a job page ---------------------------------------------------------------------

_OXFAM = """
<html lang="en-GB"><body>
<script type="application/ld+json">
{
  "@context": "http://schema.org/",
  "@type": "JobPosting",
  "title": "Finance Manager",
  "description": "<p>Oxfam is a global movement.</p><p>E-mail jobs@oxfam.org.uk.</p>",
  "datePosted": "2026-10-11",
  "validThrough": "2026-10-26",
  "employmentType": "Fixed Term",
  "jobLocation": [{"@type": "Place", "address": {"streetAddress": "Farabi Street",
    "addressLocality": "Damascus", "addressRegion": "Damascus", "addressCountry": "Syria"}}],
  "salaryCurrency": "GBP"
}
</script>
<h1>Finance Manager</h1>
<div class="jobSumLabel">Salary</div><div>As Per Oxfam Salary Scale</div>
</body></html>
"""

_ICRC = """
<html lang="en-GB"><body>
<div itemscope itemtype="http://schema.org/JobPosting">
  <meta itemprop="title" content="Pashto Interpreter">
  <meta itemprop="datePosted" content="Fri Oct 09 02:00:00 UTC 2026">
  <meta itemprop="validThrough" content="Fri Dec 31 23:00:00 UTC 2027">
  <h1>Pashto Interpreter</h1>
  <span lang="en-GB" itemprop="description"><p>What we do</p>
    <p><strong>Location:</strong> Afghanistan, various sites</p></span>
  <span>Location:</span><span>Geneva (GVA)</span>
  <span>Contract Type:</span><span>Max term contract</span>
</div>
</body></html>
"""


def test_structured_data_gives_every_captured_field():
    results, captured = read_detail_fields(_OXFAM)
    assert results == read_detail_page(_OXFAM)
    assert results[0]["employment_types"] == ["Fixed Term"]
    assert len(captured) == 1
    fields = captured[0]
    assert clean_description(fields["description"]) == (
        f"Oxfam is a global movement.\n\nE-mail {CONTACT_REMOVED}."
    )
    assert fields["posted"] == ["2026-10-11"]
    assert fields["salary"] == "As Per Oxfam Salary Scale"
    assert fields["language"] is None
    assert fields["remote"] is False
    assert fields["locations"] == ["Damascus, Damascus, Syria"]
    assert fields["place"] == {"location": "Damascus, Damascus, Syria", "locality": "Damascus"}


def test_microdata_gives_the_pages_own_posting_fields_and_its_declared_language():
    results, captured = read_detail_fields(_ICRC)
    assert results == read_detail_page(_ICRC)
    fields = captured[0]
    assert fields["posted"] == ["Fri Oct 09 02:00:00 UTC 2026"]
    assert fields["language"] == "en-GB"
    assert clean_description(fields["description"]) == (
        "What we do\n\nLocation: Afghanistan, various sites"
    )
    assert fields["locations"] == ["Afghanistan, various sites", "Geneva (GVA)"]
    assert fields["salary"] is None
    assert fields["place"] is None


def test_the_whole_pages_language_is_not_the_adverts():
    html = _ICRC.replace(' lang="en-GB" itemprop', " itemprop")
    assert read_detail_fields(html)[1][0]["language"] is None


def test_another_jobs_microdata_lends_no_date_or_description():
    html = (
        "<h1>Main role</h1><span>Location: Geneva</span>"
        '<aside><div itemscope itemtype="http://schema.org/JobPosting">'
        '<meta itemprop="title" content="Other role">'
        '<meta itemprop="datePosted" content="2026-10-01">'
        '<span itemprop="description" lang="fr">Autre</span></div></aside>'
    )
    fields = read_detail_fields(html)[1][0]
    assert fields["posted"] == []
    assert fields["description"] is None
    assert fields["language"] is None


def test_a_nested_items_description_and_date_are_not_the_postings():
    html = (
        '<div itemscope itemtype="http://schema.org/JobPosting">'
        '<meta itemprop="title" content="Role"><h1>Role</h1><span>Location: Geneva</span>'
        '<div itemprop="hiringOrganization" itemscope>'
        '<meta itemprop="datePosted" content="2026-10-01">'
        '<span itemprop="description">About the organisation</span></div></div>'
    )
    fields = read_detail_fields(html)[1][0]
    assert fields["posted"] == []
    assert fields["description"] is None


def test_captured_fields_alone_do_not_qualify_a_posting():
    html = """
    <script type="application/ld+json">
    {"@type": "JobPosting", "title": "JSON Title", "description": "Long text",
     "datePosted": "2026-10-01", "baseSalary": 50000, "inLanguage": "fr",
     "jobLocationType": "TELECOMMUTE"}
    </script>
    <h1>Visible title</h1><span>Location:</span><span>Geneva</span>
    """
    results, captured = read_detail_fields(html)
    assert results == [
        {"title": "Visible title", "locations": ["Geneva"], "deadlines": [],
         "employment_types": []}
    ]
    assert captured[0]["description"] is None
    assert captured[0]["posted"] == []
    assert captured[0]["remote"] is False


@pytest.mark.parametrize(
    ("salary", "currency", "expected"),
    [
        ({"@type": "MonetaryAmount", "currency": "USD",
          "value": {"@type": "QuantitativeValue", "minValue": 40000, "maxValue": 50000,
                    "unitText": "YEAR"}}, None, "USD 40000 - 50000 YEAR"),
        ({"currency": "EUR", "value": {"value": 3200, "unitText": "MONTH"}}, None,
         "EUR 3200 MONTH"),
        ({"value": 25557}, "GBP", "GBP 25557"),
        ({"minValue": 1, "maxValue": 2}, None, "1 - 2"),
        ("£25,557 per annum", None, "£25,557 per annum"),
        (31000, None, "31000"),
        ({"currency": "USD"}, None, None),
        (True, None, None),
    ],
)
def test_base_salary_as_published(salary, currency, expected):
    import json

    data = {"@type": "JobPosting", "title": "Role", "validThrough": "2026-12-01",
            "baseSalary": salary}
    if currency:
        data["salaryCurrency"] = currency
    html = f'<script type="application/ld+json">{json.dumps(data)}</script>'
    assert read_detail_fields(html)[1][0]["salary"] == expected


def test_structured_salary_comes_before_the_salary_label():
    html = _OXFAM.replace('"salaryCurrency": "GBP"',
                          '"baseSalary": {"currency": "GBP", "value": {"value": 25557}}')
    assert read_detail_fields(html)[1][0]["salary"] == "GBP 25557"


def test_two_different_salary_labels_give_none():
    html = _OXFAM.replace(
        "</body>", '<div class="jobSumLabel">Salary</div><div>£30,000</div></body>'
    )
    assert read_detail_fields(html)[1][0]["salary"] is None


def test_remote_and_declared_language_from_structured_data():
    html = _OXFAM.replace(
        '"salaryCurrency": "GBP"',
        '"salaryCurrency": "GBP", "jobLocationType": "TELECOMMUTE", "inLanguage": "fr-FR"',
    )
    fields = read_detail_fields(html)[1][0]
    assert fields["remote"] is True
    assert fields["language"] == "fr-FR"


@pytest.mark.parametrize(
    "locations",
    [
        '[{"address": {"addressLocality": "Geneva", "addressCountry": "Switzerland"}},'
        ' {"address": {"addressLocality": "Kabul", "addressCountry": "Afghanistan"}}]',
        '{"address": {"addressCountry": "Syria"}}',
        '"Damascus, Syria"',
        '{"name": "Head office"}',
    ],
)
def test_a_place_needs_one_structured_location_with_a_locality(locations):
    html = (
        '<script type="application/ld+json">{"@type": "JobPosting", "title": "Role",'
        f' "jobLocation": {locations}}}</script>'
    )
    assert read_detail_fields(html)[1][0]["place"] is None


# --- Applying them to a listing row ---------------------------------------------------------


def _listing(**extra):
    job = {"title": "Listing title", "apply_url": "https://example.org/jobs/role/1"}
    job.update(extra)
    return job


def test_captured_fields_fill_blanks_only():
    results, captured = read_detail_fields(_OXFAM)
    job = _listing(salary_range_text="£30,000", locations=["Listing place"], posted_on=" ")
    updated = apply_captured_fields(apply_detail_reading(job, results), captured)
    assert updated["salary_range_text"] == "£30,000"
    assert updated["locations"] == ["Listing place"]
    assert updated["posted_on"] == "2026-10-11"
    assert updated["description"].startswith("<p>Oxfam")
    assert updated["published_place"]["locality"] == "Damascus"
    assert updated["employment_type"] == "Fixed Term"
    assert "advert_language" not in updated
    assert updated["title"] == "Listing title"
    assert job == _listing(salary_range_text="£30,000", locations=["Listing place"], posted_on=" ")


def test_several_results_leave_the_row_unchanged():
    one = {"description": "A", "posted": ["2026-10-01"], "salary": "1", "language": "en",
           "remote": True, "locations": ["Geneva"], "place": None}
    original = _listing()
    assert apply_captured_fields(original, [one, dict(one)]) == original
    assert apply_captured_fields(original, []) == original
    assert apply_captured_fields(original, None) == original
    assert apply_captured_fields(None, [one]) == {}


def test_a_remote_marker_only_ever_sets_remote():
    row = {"description": None, "posted": [], "salary": None, "language": None,
           "remote": False, "locations": [], "place": None}
    assert apply_captured_fields(_listing(is_remote=True), [row])["is_remote"] is True
    assert "is_remote" not in apply_captured_fields(_listing(), [row])
    row["remote"] = True
    assert apply_captured_fields(_listing(is_remote=False), [row])["is_remote"] is True


# --- City from the published place ----------------------------------------------------------


def _placed(**job):
    from crawler_v2.simple_crawler import place_job

    row = _listing(**job)
    place_job(row)
    return row


def test_city_is_the_published_locality_of_the_jobs_one_country():
    row = _placed(location_raw="Damascus, Damascus, Syria",
                  published_place={"location": "Damascus, Damascus, Syria",
                                   "locality": "Damascus"})
    assert (row["country_iso"], row["city"]) == ("SY", "Damascus")


@pytest.mark.parametrize(
    ("location_raw", "place"),
    [
        ("Syria", {"location": "Amman, Jordan", "locality": "Amman"}),
        ("Syria, Jordan", {"location": "Amman, Jordan", "locality": "Amman"}),
        ("Syria", {"location": "Head office", "locality": "Damascus"}),
        ("Syria", {"location": "Damascus, Syria", "locality": None}),
        ("Syria", None),
        ("Damascus, Syria", "Damascus"),
    ],
)
def test_no_city_without_a_matching_published_place(location_raw, place):
    row = _placed(location_raw=location_raw, published_place=place)
    assert row["city"] is None


def test_a_city_the_reader_supplied_is_kept():
    row = _placed(location_raw="Damascus, Syria", city="Aleppo",
                  published_place={"location": "Damascus, Syria", "locality": "Damascus"})
    assert row["city"] == "Aleppo"


def test_a_published_locality_loses_its_contacts():
    row = _placed(location_raw="Damascus, Syria",
                  published_place={"location": "Damascus, Syria",
                                   "locality": "Damascus hr@ngo.org"})
    assert row["city"] == f"Damascus {CONTACT_REMOVED}"


def test_a_job_without_a_location_gets_no_city():
    row = _placed(published_place={"location": "Damascus, Syria", "locality": "Damascus"})
    assert "city" not in row


# --- The save step --------------------------------------------------------------------------


def _save(monkeypatch, jobs):
    from crawler_v2 import simple_crawler

    sent = []

    class Cursor:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def execute(self, *args, **kwargs):
            pass

    class Connection:
        def cursor(self):
            return Cursor()

        def commit(self):
            pass

        def rollback(self):
            pass

        def close(self):
            pass

    def persist(cursor, candidate, **kwargs):
        sent.append((dict(candidate), kwargs["observed_at"]))
        return "updated"

    crawler = simple_crawler.SimpleCrawler("postgresql://example")
    crawler._get_db_conn = Connection
    crawler.extraction_logger = None
    monkeypatch.setattr(simple_crawler, "confirm_running", lambda *args, **kwargs: None)
    monkeypatch.setattr(simple_crawler, "commit_and_schedule", lambda *args, **kwargs: None)
    monkeypatch.setattr(simple_crawler, "persist_candidate", persist)
    crawler.save_jobs(jobs, "src-1", "Example", run_token="run-1")
    return sent


def test_the_save_step_cleans_and_sends_the_captured_fields(monkeypatch):
    job = {
        "title": "Finance Manager", "apply_url": "https://example.org/jobs/1", "admitted": True,
        "location_raw": "Damascus, Damascus, Syria",
        "description": "<p>Role</p><p>Mail hr@example.org</p>",
        "posted_on": "Fri Oct 09 02:00:00 UTC 2026",
        "locations": ["Damascus, Damascus, Syria", " Head office "],
        "employment_type": " Fixed\nTerm ",
        "salary_range_text": "As Per Oxfam Salary Scale",
        "advert_language": "en-GB",
    }
    [(candidate, observed)] = _save(monkeypatch, [job])
    assert observed.tzinfo is not None
    assert candidate["description"] == f"Role\n\nMail {CONTACT_REMOVED}"
    assert candidate["posted_on"] == "2026-10-09"
    assert candidate["locations"] == ["Damascus, Damascus, Syria", "Head office"]
    assert candidate["contract_type"] == "Fixed Term"
    assert candidate["salary_range_text"] == "As Per Oxfam Salary Scale"
    assert candidate["advert_language"] == "en-GB"


def test_a_listing_row_sends_its_one_location_and_nothing_it_did_not_publish(monkeypatch):
    job = {"title": "Officer", "apply_url": "https://example.org/jobs/2", "admitted": True,
           "location_raw": "United States, Belgium, Denmark", "deadline": "2026-11-17"}
    [(candidate, _)] = _save(monkeypatch, [job])
    assert candidate["locations"] == ["United States, Belgium, Denmark"]
    for name in ("description", "posted_on", "contract_type", "salary_range_text",
                 "advert_language"):
        assert name not in candidate


def test_every_short_field_loses_its_contacts_at_the_save_step(monkeypatch):
    contact = " hr@ngo.org +254 722 123 456"
    job = {"title": "Officer", "apply_url": "https://example.org/jobs/4", "admitted": True,
           "locations": ["Nairobi" + contact], "employment_type": "Fixed term" + contact,
           "salary_range_text": "KES 90,000" + contact, "advert_language": "en" + contact}
    [(candidate, _)] = _save(monkeypatch, [job])
    for name in ("contract_type", "salary_range_text", "advert_language"):
        assert "@" not in candidate[name] and "722" not in candidate[name], name
        assert CONTACT_REMOVED in candidate[name], name
    assert candidate["locations"] == [f"Nairobi {CONTACT_REMOVED} {CONTACT_REMOVED}"]


def test_blank_or_future_values_are_not_sent(monkeypatch):
    job = {"title": "Officer", "apply_url": "https://example.org/jobs/3", "admitted": True,
           "description": "<p> </p>", "posted_on": "2999-01-01", "locations": [" "],
           "employment_type": " ", "salary_raw": "", "advert_language": None}
    [(candidate, _)] = _save(monkeypatch, [job])
    for name in ("description", "posted_on", "locations", "contract_type",
                 "salary_range_text", "advert_language"):
        assert name not in candidate


def test_a_listing_salary_and_employment_type_list_are_sent_as_text(monkeypatch):
    from crawler_v2.simple_crawler import SimpleCrawler

    posting = SimpleCrawler("postgresql://example")._parse_job_posting(
        {"title": "Role", "url": "/jobs/9", "employmentType": ["FULL_TIME", " ", "TEMPORARY"],
         "baseSalary": {"value": {"value": 100, "currency": "USD"}}},
        "https://example.org/",
    )
    posting["admitted"] = True
    [(candidate, _)] = _save(monkeypatch, [posting])
    assert candidate["contract_type"] == "FULL_TIME, TEMPORARY"
    assert candidate["salary_range_text"] == "USD 100"


def test_listing_structured_data_gives_real_locations_and_no_object_text(monkeypatch):
    from crawler_v2.simple_crawler import SimpleCrawler

    posting = SimpleCrawler("postgresql://example")._parse_job_posting(
        {"title": "Role", "url": "/jobs/10", "validThrough": "2026-12-01",
         "description": {"text": "not a string"}, "baseSalary": {"value": [1, 2]},
         "jobLocation": [{"address": {"addressLocality": "Geneva", "addressCountry": "CH"}},
                         {"name": "Kabul"}]},
        "https://example.org/",
    )
    posting["admitted"] = True
    [(candidate, _)] = _save(monkeypatch, [posting])
    assert candidate["locations"] == ["Geneva, CH", "Kabul"]
    assert "description" not in candidate
    assert "salary_range_text" not in candidate


# --- The writer -----------------------------------------------------------------------------

TITLE = "Finance Manager"
URL = "https://example.org/jobs/1"
CAPTURED = {
    "description": "Role\n\nDuties",
    "posted_on": "2026-10-11",
    "locations": ["Damascus, Damascus, Syria"],
    "contract_type": "Fixed Term",
    "salary_range_text": "As Per Oxfam Salary Scale",
    "advert_language": "en-GB",
}


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows
        self.statements = []
        self._sql = ""

    def execute(self, sql, params=None):
        self.statements.append((sql, params))
        self._sql = sql

    def fetchall(self):
        if self._sql.lstrip().upper().startswith("SELECT"):
            return list(self.rows)
        return []


def _stored(**fields):
    row = {name: None for name in LOAD_COLUMNS}
    row.update(id="row-1", canonical_hash=algorithm_a(TITLE, URL), title=TITLE, apply_url=URL,
               status="active", source_id="src-1", org_name="Example")
    row.update(fields)
    return row


def _persist(cursor, **candidate):
    return persist_candidate(
        cursor, {"title": TITLE, "apply_url": URL, "admitted": True, **candidate},
        observed_at=WHEN, heuristics=False,
    )


def _writes(cursor):
    return [(sql, params) for sql, params in cursor.statements
            if not sql.lstrip().upper().startswith("SELECT")]


def test_every_compared_field_is_loaded():
    from contracts.upsert import VALIDATED_FIELDS

    assert set(VALIDATED_FIELDS) <= set(LOAD_COLUMNS)


def test_a_new_job_is_inserted_with_its_captured_fields():
    cursor = FakeCursor([])
    assert _persist(cursor, **CAPTURED) == "created"
    [(sql, params)] = _writes(cursor)
    columns = sql.split("(", 1)[1].split(")", 1)[0].split(", ")
    inserted = dict(zip(columns, params))
    for name, value in CAPTURED.items():
        assert inserted[name] == value


def test_the_first_capture_updates_an_existing_job_once():
    cursor = FakeCursor([_stored()])
    assert _persist(cursor, **CAPTURED) == "updated"
    [(sql, params)] = _writes(cursor)
    for name in CAPTURED:
        assert f"{name} = %s" in sql
    assert "created_at" not in sql and "canonical_hash" not in sql


def test_the_same_capture_again_is_unchanged():
    stored = _stored(**dict(CAPTURED, posted_on=date(2026, 10, 11)))
    cursor = FakeCursor([stored])
    assert _persist(cursor, **CAPTURED) == "unchanged"
    [(sql, _)] = _writes(cursor)
    assert sql == "UPDATE jobs SET last_seen_at = %s WHERE id = %s"


def test_a_field_not_sent_keeps_what_is_stored():
    cursor = FakeCursor([_stored(**CAPTURED)])
    assert _persist(cursor, location_raw="Damascus") == "updated"
    [(sql, _)] = _writes(cursor)
    for name in CAPTURED:
        assert f"{name} =" not in sql


def test_a_changed_description_alone_is_an_update():
    cursor = FakeCursor([_stored(**CAPTURED)])
    assert _persist(cursor, **dict(CAPTURED, description="New text")) == "updated"
    [(sql, params)] = _writes(cursor)
    assert "description = %s" in sql and "New text" in params
    assert "posted_on =" not in sql and "locations =" not in sql


# --- The job-page path, end to end ----------------------------------------------------------


def test_the_generic_job_page_path_captures_the_fields():
    from crawler_v2.simple_crawler import SimpleCrawler, place_job

    async def fake_fetch(url):
        return 200, _OXFAM, ""

    crawler = SimpleCrawler("postgresql://example")
    crawler._fetch_page = fake_fetch
    job = asyncio.run(crawler.enrich_job_from_detail_page(
        _listing(apply_url="https://jobs.oxfam.org.uk/jobs/vacancy/finance-manager/25190/"),
        "https://jobs.oxfam.org.uk/jobs/home/",
    ))
    place_job(job)
    assert job["deadline"] == "2026-10-26"
    assert job["location_raw"] == "Damascus, Damascus, Syria"
    assert (job["country_iso"], job["city"]) == ("SY", "Damascus")
    assert job["posted_on"] == "2026-10-11"
    assert job["salary_range_text"] == "As Per Oxfam Salary Scale"
    assert job["locations"] == ["Damascus, Damascus, Syria"]
    assert "Oxfam is a global movement." in clean_description(job["description"])


_SAVED_PAGES = {
    "icrc-pashto.body": ("2026-10-09", None, "en-GB", 2, None),
    "icrc-first-aid.body": ("2026-10-06", None, "en-GB", 2, None),
    "icrc-burmese.body": ("2026-10-05", None, "en-GB", 2, None),
    "oxfam-finance.body": ("2026-10-11", "As Per Oxfam Salary Scale", None, 1, "Damascus"),
    "oxfam-protection.body": ("2026-10-08", "As per Oxfam Syria Salary Scale", None, 1,
                              "Damascus"),
    "oxfam-income.body": ("2026-10-08", "£25,557 per annum", None, 1, "Newcastle-Upon-Tyne"),
}


def test_saved_vacancy_pages_give_their_captured_fields():
    from crawler_v2.simple_crawler import place_job

    root = Path(__file__).resolve().parents[3] / "raw-html" / "career-coverage"
    if not root.is_dir():
        pytest.skip("saved vacancy pages are gitignored")
    for name, (posted, salary, language, places, city) in _SAVED_PAGES.items():
        html = (root / name).read_text(encoding="utf-8")
        results, captured = read_detail_fields(html)
        assert results == read_detail_page(html), name
        job = apply_captured_fields(apply_detail_reading(_listing(), results), captured)
        place_job(job)
        assert posted_day(job["posted_on"], SEEN) == posted, name
        assert job.get("salary_range_text") == salary, name
        assert job.get("advert_language") == language, name
        assert len(job["locations"]) == places, name
        assert job["city"] == city, name
        description = clean_description(job["description"])
        assert 3000 < len(description) <= DESCRIPTION_LIMIT, name
        assert "@" not in description, name
