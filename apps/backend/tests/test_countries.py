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
    job = {"title": "Officer", "apply_url": "https://example.org/jobs/1",
           "location_raw": "Italy", "admitted": True}
    simple_crawler.place_job(job)
    crawler.save_jobs([job], "src-1", "Example", run_token="run-1")
    assert len(sent) == 1
    candidate = sent[0]
    assert (candidate["country"], candidate["country_iso"], candidate["is_remote"]) == (
        "Italy", "IT", False)
    assert "city" in candidate and candidate["city"] is None
    for name in ("latitude", "longitude", "geocoding_source", "geocoded_at"):
        assert name not in candidate


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
