"""The offline country lookup (ledger W-27, W-37): the frontend's table, with no network call."""
import re
from datetime import datetime, timezone
from pathlib import Path

import pytest

from contracts import countries
from contracts.countries import (
    countries_named,
    country_name,
    iso_from_name,
    name_key,
    read_location,
)
from contracts.models import CrawlRun
from contracts.upsert import upsert

FRONTEND_TABLE = Path(__file__).resolve().parents[2] / "frontend" / "lib" / "site" / "countries.ts"
_ENTRY = re.compile(
    r"""^\s*(?:'(?P<q1>[^']*)'|"(?P<q2>[^"]*)"|(?P<bare>[A-Za-z]+)):\s*"""
    r"""(?:'(?P<v1>[^']*)'|"(?P<v2>[^"]*)"),\s*$"""
)


def _frontend_block(name: str) -> dict:
    source = FRONTEND_TABLE.read_text(encoding="utf-8")
    start = source.index(f"const {name}: Record<string, string> = {{")
    end = source.index("};", start)
    entries = {}
    for line in source[start:end].splitlines()[1:]:
        found = _ENTRY.match(line)
        assert found, f"{name}: a line the test cannot read: {line!r}"
        key = next(found.group(g) for g in ("q1", "q2", "bare") if found.group(g) is not None)
        entries[key] = next(found.group(g) for g in ("v1", "v2") if found.group(g) is not None)
    return entries


@pytest.mark.parametrize("name", ["COUNTRY_NAMES", "DISPLAY", "ALIASES"])
def test_the_table_is_the_public_sites(name):
    assert getattr(countries, name) == _frontend_block(name)


@pytest.mark.parametrize(
    ("text", "key"),
    [
        ("  The Gambia. ", "gambia"),
        ("Côte d’Ivoire", "cote d'ivoire"),
        ("Bosnia & Herzegovina", "bosnia and herzegovina"),
        ("São Tomé  &  Príncipe", "sao tome and principe"),
        ("Lao People’s Democratic Republic", "lao people's democratic republic"),
    ],
)
def test_name_key_matches_the_frontend(text, key):
    assert name_key(text) == key


# Location texts stored in production on 8 November 2026 (Verified, read-only). Nominatim had
# stored Zambia for the DR Congo spelling, and nothing for SoP, Renk, Afghanistan or Fiji.
@pytest.mark.parametrize(
    ("location", "iso", "name"),
    [
        ("Italy", "IT", "Italy"),
        ("Kenya", "KE", "Kenya"),
        ("Democratic Republic of Congo", "CD", "DR Congo"),
        ("State of Palestine (SoP)", "PS", "State of Palestine"),
        ("Lao People’s Democratic Republic", "LA", "Laos"),
        ("Cote d'Ivoire", "CI", "Côte d’Ivoire"),
        ("Bosnia & Herzegovina", "BA", "Bosnia and Herzegovina"),
        ("Türkiye", "TR", "Türkiye"),
        ("Viet Nam", "VN", "Vietnam"),
        ("United Republic of Tanzania", "TZ", "Tanzania"),
        ("Republic of Moldova", "MD", "Moldova"),
        ("Syrian Arab Republic", "SY", "Syria"),
        ("Trinidad and Tobago", "TT", "Trinidad and Tobago"),
        ("Myanmar", "MM", "Myanmar"),
        ("London, London, United Kingdom", "GB", "United Kingdom"),
        ("Batley, Batley, England", "GB", "United Kingdom"),
        ("Renk County, Uppernile State, South Sudan", "SS", "South Sudan"),
        ("Afghanistan, various sites", "AF", "Afghanistan"),
        ("Fiji/Pacific Island Countries", "FJ", "Fiji"),
    ],
)
def test_one_country_named(location, iso, name):
    assert read_location(location) == {
        "country": name, "country_iso": iso, "city": None, "is_remote": False,
    }


@pytest.mark.parametrize(
    ("location", "named"),
    [
        ("Somalia / Nairobi, Kenya", ["SO", "KE"]),
        ("Belize, Guyana", ["BZ", "GY"]),
        ("Barbados, Trinidad and Tobago", ["BB", "TT"]),
        ("DRC/ Afghanistan/ Ethiopia/ South Sudan/Jerusalem", ["CD", "AF", "ET", "SS"]),
        ("Belgium, Denmark, Italy, Switzerland, United Kingdom, Finland",
         ["BE", "DK", "IT", "CH", "GB", "FI"]),
    ],
)
def test_several_countries_store_none(location, named):
    assert countries_named(location) == named
    reading = read_location(location)
    assert reading["country"] is None and reading["country_iso"] is None


@pytest.mark.parametrize(
    ("location", "named"),
    [
        ("Congo, Democratic Republic of the", ["CD"]),
        ("Kinshasa, Congo, The Democratic Republic of the", ["CD"]),
        ("Congo, Republic of the", ["CG"]),
        ("Congo, Dem. Rep.", []),
        ("Korea, Republic of", ["KR"]),
        ("Korea, Democratic People's Republic of", ["KP"]),
        ("Iran, Islamic Republic of", ["IR"]),
        ("Tanzania, United Republic of", ["TZ"]),
        ("Moldova, Republic of", ["MD"]),
        ("Bolivia, Plurinational State of", ["BO"]),
        ("Venezuela, Bolivarian Republic of", ["VE"]),
        ("Micronesia, Federated States of", ["FM"]),
        ("London, United Kingdom", ["GB"]),
        ("Belgium, United Kingdom", ["BE", "GB"]),
        ("Kenya, United States", ["KE", "US"]),
        ("Gaza, State of Palestine", ["PS"]),
    ],
)
def test_inverted_official_names_are_read_whole(location, named):
    assert countries_named(location) == named


@pytest.mark.parametrize(
    "location",
    [
        "Global Deployment",
        "Global Field Deployment.",
        "JERUSALEM (JER)",
        "Near & Middle East Region, various contexts",
        "within the Caribbean Multi-Country Office (excluding Kingston, Jamaica)",
    ],
)
def test_no_country_named(location):
    assert read_location(location) == {
        "country": None, "country_iso": None, "city": None, "is_remote": False,
    }


@pytest.mark.parametrize("location", [None, "", "   ", 7])
def test_no_location_reads_nothing(location):
    assert read_location(location) is None


@pytest.mark.parametrize(
    ("location", "remote", "iso"),
    [
        ("Remote", True, None),
        ("Remote / home based", True, None),
        ("Home-based, Kenya", True, "KE"),
        ("Work from home", True, None),
        ("Online", True, None),
        ("Nairobi, Kenya", False, "KE"),
        ("Remotely located, Kenya", False, "KE"),
    ],
)
def test_remote_words_are_whole_words(location, remote, iso):
    reading = read_location(location)
    assert reading["is_remote"] is remote
    assert reading["country_iso"] == iso


def test_names_and_codes():
    assert country_name("cd") == "DR Congo"
    assert country_name("AG") == "Antigua and Barbuda"
    assert country_name("ZZ") is None
    assert country_name(None) is None
    assert iso_from_name("Ivory Coast") == "CI"
    assert iso_from_name("Atlantis") is None


# The crawler's step and the one writer.

def test_place_job_fills_the_fields_from_the_location():
    from crawler_v2.simple_crawler import place_job

    job = {"location_raw": "Democratic Republic of Congo"}
    place_job(job)
    assert job == {
        "location_raw": "Democratic Republic of Congo",
        "country": "DR Congo", "country_iso": "CD", "city": None, "is_remote": False,
    }


def test_place_job_leaves_a_job_without_a_location_alone():
    from crawler_v2.simple_crawler import place_job

    job = {"title": "Officer", "location_raw": "  "}
    place_job(job)
    assert job == {"title": "Officer", "location_raw": "  "}


def test_place_job_keeps_a_country_its_reader_supplied():
    from crawler_v2.simple_crawler import place_job

    job = {"location_raw": "Nairobi, Kenya", "country": "Kenya", "country_iso": "KE",
           "city": "Nairobi"}
    place_job(job)
    assert (job["country"], job["country_iso"], job["city"], job["is_remote"]) == (
        "Kenya", "KE", "Nairobi", False)


def test_place_job_reads_a_normalised_location_and_its_remote_type():
    from crawler_v2.simple_crawler import place_job

    job = {"location_normalized": {"label": "Kenya", "type": "remote"}}
    place_job(job)
    assert (job["country_iso"], job["is_remote"]) == ("KE", True)


def test_place_job_prefers_the_location_text_and_skips_a_blank_one():
    from crawler_v2.simple_crawler import place_job

    job = {"location_raw": "Kenya", "location_normalized": {"label": "Uganda"}}
    place_job(job)
    assert job["country_iso"] == "KE"
    job = {"location_raw": "  ", "location_normalized": {"label": "Uganda"}}
    place_job(job)
    assert job["country_iso"] == "UG"


def test_place_job_counts_only_a_true_remote_flag():
    from crawler_v2.simple_crawler import place_job

    job = {"location_raw": "Kenya", "is_remote": "no"}
    place_job(job)
    assert job["is_remote"] is False


class _Run:
    def __init__(self):
        self.saved = []

    async def save(self, save_jobs, jobs, source_id, org_name, **_kwargs):
        self.saved.extend(dict(job) for job in jobs)
        return {"inserted": len(jobs), "updated": 0, "skipped": 0, "failed": 0}


def test_the_crawl_reads_countries_before_saving(monkeypatch):
    import asyncio

    from contracts.outbound import FetchResult, crawl_budget
    from crawler_v2 import simple_crawler

    async def fetch_url(url, **_kwargs):
        return FetchResult(200, {}, b"<html><body>listing</body></html>", url)

    monkeypatch.setattr(simple_crawler, "fetch_url", fetch_url)
    crawler = simple_crawler.SimpleCrawler("postgresql://unused")
    crawler.extraction_logger = None
    crawler.html_storage = None
    crawler.quality_scorer = None
    rows = [
        {"title": "Officer", "apply_url": "https://jobs.example/job/1/officer",
         "location_raw": "Democratic Republic of Congo"},
        {"title": "Adviser", "apply_url": "https://jobs.example/job/2/adviser",
         "location_raw": "Belize, Guyana"},
    ]

    async def listing(html, url):
        return [dict(row) for row in rows], None

    async def detail(job, base_url):
        return job

    monkeypatch.setattr(crawler, "_listing_jobs", listing)
    monkeypatch.setattr(crawler, "enrich_job_from_detail_page", detail)
    run = _Run()
    source = {"id": "src-1", "org_name": "Example", "careers_url": "https://jobs.example/",
              "source_type": "html"}

    async def crawl():
        with crawl_budget():
            return await crawler.crawl_source(source, run)

    asyncio.run(crawl())
    saved = {job["title"]: job for job in run.saved}
    assert (saved["Officer"]["country_iso"], saved["Officer"]["country"]) == ("CD", "DR Congo")
    assert saved["Adviser"]["country_iso"] is None and saved["Adviser"]["country"] is None
    for job in run.saved:
        assert job["city"] is None and job["is_remote"] is False
        assert "latitude" not in job


def test_the_crawler_sends_no_coordinates_and_clears_a_guessed_city(monkeypatch):
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
        sent.append(dict(candidate))
        return "updated"

    crawler = simple_crawler.SimpleCrawler("postgresql://example")
    crawler._get_db_conn = Connection
    crawler.extraction_logger = None
    monkeypatch.setattr(simple_crawler, "confirm_running", lambda *args, **kwargs: None)
    monkeypatch.setattr(simple_crawler, "commit_and_schedule", lambda *args, **kwargs: None)
    monkeypatch.setattr(simple_crawler, "persist_candidate", persist)
    jobs = [
        {"title": "Officer", "apply_url": "https://example.org/jobs/1",
         "location_raw": "Italy", "admitted": True},
        {"title": "Adviser", "apply_url": "https://example.org/jobs/2",
         "location_raw": "Belize, Guyana", "admitted": True},
    ]
    for job in jobs:
        simple_crawler.place_job(job)
    crawler.save_jobs(jobs, "src-1", "Example", run_token="run-1")
    assert len(sent) == 2
    one, several = sent
    assert (one["country"], one["country_iso"], one["is_remote"]) == ("Italy", "IT", False)
    assert "city" in one and one["city"] is None
    for name in ("country", "country_iso", "city"):
        assert name in several and several[name] is None
    for candidate in sent:
        for name in ("latitude", "longitude", "geocoding_source", "geocoded_at"):
            assert name not in candidate


def test_a_country_read_offline_scores_as_the_old_coordinates_did():
    from core.data_quality import DataQualityScorer
    from crawler_v2.simple_crawler import place_job

    base = {"title": "Programme Officer", "apply_url": "https://example.org/jobs/1",
            "org_name": "Example", "location_raw": "Kenya"}
    geocoded = dict(base, latitude=-1.29, longitude=36.82, country="Kenya", country_iso="KE")
    offline = dict(base)
    place_job(offline)
    scorer = DataQualityScorer()
    assert scorer.score_job(offline) == scorer.score_job(geocoded)
    several = dict(base, location_raw="Belize, Guyana")
    place_job(several)
    assert scorer.score_job(several)["factors"]["geocoding"] == 0.0


def _stored(**fields):
    row = {
        "id": "job-1", "canonical_hash": None, "title": "Officer",
        "apply_url": "https://example.org/jobs/1", "location_raw": "Italy",
        "country": "Italia", "country_iso": "IT", "city": None, "is_remote": False,
        "deadline": None, "description_snippet": None, "status": "active",
        "deleted_at": None, "deleted_by": None, "deletion_reason": None,
    }
    row.update(fields)
    return row


def _upsert(stored, candidate):
    from contracts.identity import both_keys

    stored["canonical_hash"] = both_keys(stored["title"], stored["apply_url"], None)[0]
    crawl = CrawlRun(source_id="src-1")
    observed = datetime(2026, 11, 9, tzinfo=timezone.utc)
    return upsert([stored], candidate, crawl, observed_at=observed, heuristics=False)


def test_a_stored_local_name_becomes_the_sites_name_on_the_next_crawl():
    from crawler_v2.simple_crawler import place_job

    stored = _stored()
    candidate = {"title": "Officer", "apply_url": "https://example.org/jobs/1",
                 "location_raw": "Italy"}
    place_job(candidate)
    assert _upsert(stored, candidate) == "updated"
    assert (stored["country"], stored["country_iso"]) == ("Italy", "IT")


def test_a_row_without_a_location_keeps_what_is_stored():
    from crawler_v2.simple_crawler import place_job

    stored = _stored(location_raw=None, country="Kenya", country_iso="KE", city="Nairobi")
    candidate = {"title": "Officer", "apply_url": "https://example.org/jobs/1"}
    place_job(candidate)
    assert _upsert(stored, candidate) == "unchanged"
    assert (stored["country"], stored["country_iso"], stored["city"]) == ("Kenya", "KE", "Nairobi")
